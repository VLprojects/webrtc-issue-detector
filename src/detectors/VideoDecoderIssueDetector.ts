import { calculateVolatility } from '../helpers/calc';
import {
  IssueDetectorResult,
  IssueReason,
  IssueType,
  MosQuality,
  ParsedInboundVideoStreamStats,
  WebRTCStatsParsedWithNetworkScores,
} from '../types';
import BaseIssueDetector, { BaseIssueDetectorParams } from './BaseIssueDetector';

interface VideoDecoderIssueDetectorParams extends BaseIssueDetectorParams {
  /** Sum of per-stream decode demand over the connection, above which the decode load is high. 1 = whole wall clock. */
  decodeDemandThreshold?: number;
  /** At least one affected stream must have its own decode demand above this. */
  affectedStreamDemandThreshold?: number;
  /** Share (0..100) of received frames not decoded locally, above which the device did not keep up. */
  frameShortfallPctThreshold?: number;
  /** Share (0..100) of inbound video streams that must show their own shortfall before an issue is emitted. */
  affectedStreamsPercentThreshold?: number;
  /** Streams with fewer received frames in the window are ignored. */
  minFramesReceived?: number;
  /** The window must span at least this many milliseconds before the detector evaluates. */
  minWindowMs?: number;
  /** Streams whose packet loss over the window exceeds this percent are ignored. */
  maxPacketLossPct?: number;
  /** Streams whose mean RTP jitter over the window exceeds this many milliseconds are ignored. */
  maxJitterMs?: number;
  minMosQuality?: number;
  /** @deprecated No effect. The fps volatility signal was removed; a high value no longer silences this detector. */
  volatilityThreshold?: number;
}

interface EvaluatedStreamEntry {
  ssrc: number;
  decodeDemand: number;
  avgDecodeTimeMs: number;
  arrivalFps: number;
  decodedFps: number;
  shortfallPct: number;
  packetLossPct: number;
  jitterMs: number;
  /** @deprecated Informational only. */
  allFps: number[];
  /** @deprecated Informational only. */
  volatility: number;
}

interface EvaluatedStream {
  entry: EvaluatedStreamEntry;
  decodeDemand: number;
  shortfallFrames: number;
  shortfallPct: number;
  deltaReceived: number;
  deltaTimeMs: number;
}

type NumericField =
  'timestamp' | 'totalDecodeTime' | 'framesDecoded' | 'framesReceived' | 'packetsReceived' | 'packetsLost' | 'jitter';

const MIN_STATS_HISTORY_LENGTH = 5;

const REQUIRED_NUMERIC_FIELDS: NumericField[] = [
  'timestamp', 'totalDecodeTime', 'framesDecoded', 'framesReceived', 'packetsReceived', 'packetsLost', 'jitter',
];

// packetsLost can decrease when a late packet fills a gap, and jitter is a gauge, so neither is checked
const MONOTONIC_FIELDS: NumericField[] = [
  'timestamp', 'totalDecodeTime', 'framesDecoded', 'framesReceived', 'packetsReceived',
];

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const isEvaluable = (stream: ParsedInboundVideoStreamStats): boolean => (
  typeof stream.id === 'string'
  && REQUIRED_NUMERIC_FIELDS.every((field) => Number.isFinite(stream[field]))
);

const isContinuous = (series: ParsedInboundVideoStreamStats[]): boolean => {
  for (let i = 1; i < series.length; i += 1) {
    if (series[i].id !== series[0].id) {
      return false;
    }

    const decreased = MONOTONIC_FIELDS.some((field) => series[i][field] < series[i - 1][field]);
    if (decreased) {
      return false;
    }
  }

  return true;
};

class VideoDecoderIssueDetector extends BaseIssueDetector {
  readonly #decodeDemandThreshold: number;

  readonly #affectedStreamDemandThreshold: number;

  readonly #frameShortfallPctThreshold: number;

  readonly #affectedStreamsPercentThreshold: number;

  readonly #minFramesReceived: number;

  readonly #minWindowMs: number;

  readonly #maxPacketLossPct: number;

  readonly #maxJitterMs: number;

  readonly #minMosQuality: MosQuality;

  constructor(params: VideoDecoderIssueDetectorParams = {}) {
    super(params);
    this.#decodeDemandThreshold = params.decodeDemandThreshold ?? 0.7;
    this.#affectedStreamDemandThreshold = params.affectedStreamDemandThreshold ?? 0.3;
    this.#frameShortfallPctThreshold = params.frameShortfallPctThreshold ?? 10;
    this.#affectedStreamsPercentThreshold = params.affectedStreamsPercentThreshold ?? 30;
    this.#minFramesReceived = params.minFramesReceived ?? 10;
    this.#minWindowMs = params.minWindowMs ?? 15_000;
    this.#maxPacketLossPct = params.maxPacketLossPct ?? 2;
    this.#maxJitterMs = params.maxJitterMs ?? 30;
    this.#minMosQuality = params.minMosQuality ?? MosQuality.BAD;
  }

  performDetection(data: WebRTCStatsParsedWithNetworkScores): IssueDetectorResult {
    const allHistoricalStats = [
      ...this.getAllLastProcessedStats(data.connection.id),
      data,
    ];

    const isBadNetworkHappened = allHistoricalStats
      .find((stat) => stat.networkScores.inbound !== undefined && stat.networkScores.inbound <= this.#minMosQuality);

    if (isBadNetworkHappened) {
      // do not execute detection on historical stats based on bad network quality
      // to avoid false positives
      return [];
    }

    return this.processData(data);
  }

  private processData(data: WebRTCStatsParsedWithNetworkScores): IssueDetectorResult {
    const window = [
      ...this.getAllLastProcessedStats(data.connection.id),
      data,
    ];

    // At least 5 elements needed to have enough representation
    if (window.length < MIN_STATS_HISTORY_LENGTH) {
      return [];
    }

    const evaluated: EvaluatedStream[] = [];
    data.video.inbound.forEach((stream) => {
      const result = this.evaluateStream(stream.ssrc, window);
      if (result) {
        evaluated.push(result);
      }
    });

    if (evaluated.length === 0) {
      return [];
    }

    const totalDecodeDemand = evaluated.reduce((sum, stream) => sum + stream.decodeDemand, 0);
    const totalShortfallFrames = evaluated.reduce((sum, stream) => sum + stream.shortfallFrames, 0);
    const totalReceived = evaluated.reduce((sum, stream) => sum + stream.deltaReceived, 0);
    const frameShortfallPct = (totalShortfallFrames / totalReceived) * 100;
    const affected = evaluated.filter((stream) => stream.shortfallPct > this.#frameShortfallPctThreshold);
    const affectedStreamsPercent = (affected.length / data.video.inbound.length) * 100;
    const maxAffectedDemand = affected.reduce((max, stream) => Math.max(max, stream.decodeDemand), 0);

    const isThrottled = frameShortfallPct > this.#frameShortfallPctThreshold
      && affectedStreamsPercent > this.#affectedStreamsPercentThreshold
      && totalDecodeDemand > this.#decodeDemandThreshold
      && maxAffectedDemand > this.#affectedStreamDemandThreshold;

    if (!isThrottled) {
      return [];
    }

    const affectedEntries = affected.map((stream) => stream.entry);

    const issues: IssueDetectorResult = [{
      type: IssueType.CPU,
      reason: IssueReason.DecoderCPUThrottling,
      statsSample: {
        decodeDemand: round3(totalDecodeDemand),
        frameShortfallPct: round3(frameShortfallPct),
        windowMs: evaluated[0].deltaTimeMs,
        affectedStreamsPercent: round3(affectedStreamsPercent),
        evaluatedStreams: evaluated.map((stream) => stream.entry),
        throttledStreams: affectedEntries,
        // deprecated misspelling, kept for consumers that persisted it; remove in the next major
        throtthedStreams: affectedEntries,
      },
    }];

    // clear all processed stats for this connection to avoid duplicate issues
    this.deleteLastProcessedStats(data.connection.id);

    return issues;
  }

  private evaluateStream(
    ssrc: number,
    window: WebRTCStatsParsedWithNetworkScores[],
  ): EvaluatedStream | undefined {
    const series: ParsedInboundVideoStreamStats[] = [];
    for (let i = 0; i < window.length; i += 1) {
      const stream = window[i].video.inbound.find((item) => item.ssrc === ssrc);
      if (!stream) {
        return undefined;
      }
      series.push(stream);
    }

    if (!series.every(isEvaluable) || !isContinuous(series)) {
      return undefined;
    }

    const oldest = series[0];
    const newest = series[series.length - 1];

    if (newest.powerEfficientDecoder === true) {
      // hardware decode time includes pipeline latency and says nothing about CPU load
      return undefined;
    }

    const deltaTimeMs = newest.timestamp - oldest.timestamp;
    const deltaDecodeTimeSec = newest.totalDecodeTime - oldest.totalDecodeTime;
    const deltaDecoded = newest.framesDecoded - oldest.framesDecoded;
    const deltaReceived = newest.framesReceived - oldest.framesReceived;
    const deltaPacketsReceived = newest.packetsReceived - oldest.packetsReceived;
    const deltaPacketsLost = Math.max(newest.packetsLost - oldest.packetsLost, 0);

    if (deltaTimeMs < this.#minWindowMs || deltaReceived < this.#minFramesReceived || deltaDecoded === 0) {
      return undefined;
    }

    const totalPackets = deltaPacketsLost + deltaPacketsReceived;
    const packetLossPct = totalPackets === 0 ? 0 : (deltaPacketsLost / totalPackets) * 100;
    if (packetLossPct > this.#maxPacketLossPct) {
      return undefined;
    }

    const jitterMs = (series.reduce((sum, stream) => sum + stream.jitter, 0) / series.length) * 1000;
    if (jitterMs > this.#maxJitterMs) {
      return undefined;
    }

    const deltaTimeSec = deltaTimeMs / 1000;
    const arrivalFps = deltaReceived / deltaTimeSec;
    const decodedFps = deltaDecoded / deltaTimeSec;
    const shortfallFrames = Math.max(deltaReceived - deltaDecoded, 0);
    const shortfallPct = (shortfallFrames / deltaReceived) * 100;
    const decodeTimePerFrameSec = deltaDecodeTimeSec / deltaDecoded;
    const decodeDemand = decodeTimePerFrameSec * arrivalFps;

    const allFps: number[] = [];
    for (let i = 0; i < series.length - 1; i += 1) {
      if (series[i].framesPerSecond !== undefined) {
        allFps.push(series[i].framesPerSecond);
      }
    }
    const volatility = allFps.length > 0 ? calculateVolatility(allFps) : 0;

    return {
      entry: {
        ssrc,
        decodeDemand: round3(decodeDemand),
        avgDecodeTimeMs: round3(decodeTimePerFrameSec * 1000),
        arrivalFps: round3(arrivalFps),
        decodedFps: round3(decodedFps),
        shortfallPct: round3(shortfallPct),
        packetLossPct: round3(packetLossPct),
        jitterMs: round3(jitterMs),
        allFps,
        volatility: round3(volatility),
      },
      decodeDemand,
      shortfallFrames,
      shortfallPct,
      deltaReceived,
      deltaTimeMs,
    };
  }
}

export default VideoDecoderIssueDetector;
