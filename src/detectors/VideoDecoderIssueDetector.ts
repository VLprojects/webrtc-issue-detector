import { calculateVolatility } from '../helpers/calc';
import { isDtxLikeBehavior } from '../helpers/streams';
import {
  IssueDetectorResult,
  IssueReason,
  IssueType,
  MosQuality,
  WebRTCStatsParsedWithNetworkScores,
} from '../types';
import { isSvcSpatialLayerChanged } from '../utils/video';
import BaseIssueDetector, { BaseIssueDetectorParams } from './BaseIssueDetector';

interface VideoDecoderIssueDetectorParams extends BaseIssueDetectorParams {
  volatilityThreshold?: number;
  affectedStreamsPercentThreshold?: number;
  decodeDemandThreshold?: number;
  affectedStreamDemandThreshold?: number;
  frameShortfallPctThreshold?: number;
  minMosQuality?: number;
}

const MIN_STATS_HISTORY_LENGTH = 5;

interface DecoderStreamStatsSample {
  ssrc: number;
  decodeDemand: number;
  shortfallPct: number;
  arrivalFps: number;
  decodedFps: number;
  allFps: number[];
  volatility: number;
}

class VideoDecoderIssueDetector extends BaseIssueDetector {
  readonly #affectedStreamsPercentThreshold: number;

  readonly #decodeDemandThreshold: number;

  readonly #affectedStreamDemandThreshold: number;

  readonly #frameShortfallPctThreshold: number;

  readonly #minMosQuality: MosQuality;

  constructor(params: VideoDecoderIssueDetectorParams = {}) {
    super(params);
    this.#affectedStreamsPercentThreshold = params.affectedStreamsPercentThreshold ?? 30;
    this.#decodeDemandThreshold = params.decodeDemandThreshold ?? 0.7;
    this.#affectedStreamDemandThreshold = params.affectedStreamDemandThreshold ?? 0.3;
    this.#frameShortfallPctThreshold = params.frameShortfallPctThreshold ?? 10;
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
    const issues: IssueDetectorResult = [];

    const allProcessedStats = [
      ...this.getAllLastProcessedStats(data.connection.id),
      data,
    ];

    const evaluatedStreams = data.video.inbound
      .map((incomeVideoStream): DecoderStreamStatsSample | undefined => {
        // At least 5 elements needed to have enough representation
        if (allProcessedStats.length < MIN_STATS_HISTORY_LENGTH) {
          return undefined;
        }

        const isSpatialLayerChanged = isSvcSpatialLayerChanged(incomeVideoStream.ssrc, allProcessedStats);
        if (isSpatialLayerChanged) {
          return undefined;
        }

        const streamStatsHistory = allProcessedStats
          .map((stat) => stat.video.inbound.find((stream) => stream.ssrc === incomeVideoStream.ssrc))
          .filter((stream): stream is NonNullable<typeof stream> => stream !== undefined);
        if (streamStatsHistory.length < MIN_STATS_HISTORY_LENGTH) {
          return undefined;
        }

        const firstStreamStats = streamStatsHistory[0];
        const lastStreamStats = streamStatsHistory[streamStatsHistory.length - 1];
        if (
          firstStreamStats?.framesReceived === undefined
          || firstStreamStats?.framesDecoded === undefined
          || firstStreamStats?.totalDecodeTime === undefined
          || firstStreamStats?.timestamp === undefined
          || lastStreamStats?.framesReceived === undefined
          || lastStreamStats?.framesDecoded === undefined
          || lastStreamStats?.totalDecodeTime === undefined
          || lastStreamStats?.timestamp === undefined
        ) {
          return undefined;
        }

        const deltaTimeSec = (lastStreamStats.timestamp - firstStreamStats.timestamp) / 1000;
        const deltaFramesReceived = lastStreamStats.framesReceived - firstStreamStats.framesReceived;
        const deltaFramesDecoded = lastStreamStats.framesDecoded - firstStreamStats.framesDecoded;
        const deltaTotalDecodeTime = lastStreamStats.totalDecodeTime - firstStreamStats.totalDecodeTime;
        if (
          deltaTimeSec <= 0
          || deltaFramesReceived <= 0
          || deltaFramesDecoded <= 0
          || deltaTotalDecodeTime <= 0
        ) {
          return undefined;
        }

        const allFps: number[] = [];
        for (let i = 0; i < allProcessedStats.length - 1; i += 1) {
          const videoStreamStats = allProcessedStats[i].video.inbound.find(
            (stream) => stream.ssrc === incomeVideoStream.ssrc,
          );

          if (videoStreamStats?.framesPerSecond !== undefined) {
            allFps.push(videoStreamStats.framesPerSecond);
          }
        }

        const isDtx = isDtxLikeBehavior(incomeVideoStream.ssrc, allProcessedStats);
        if (isDtx) {
          // DTX-like behavior detected, ignoring FPS volatility check
          return undefined;
        }

        const volatility = calculateVolatility(allFps);
        const avgDecodeTimePerFrameSec = deltaTotalDecodeTime / deltaFramesDecoded;
        const arrivalFps = deltaFramesReceived / deltaTimeSec;
        const decodedFps = deltaFramesDecoded / deltaTimeSec;
        const decodeDemand = avgDecodeTimePerFrameSec * arrivalFps;
        const shortfallPct = ((deltaFramesReceived - deltaFramesDecoded) / deltaFramesReceived) * 100;

        return {
          ssrc: incomeVideoStream.ssrc,
          decodeDemand,
          shortfallPct,
          arrivalFps,
          decodedFps,
          allFps,
          volatility,
        };
      })
      .filter((stream): stream is DecoderStreamStatsSample => stream !== undefined);

    if (evaluatedStreams.length === 0) {
      return issues;
    }

    const throttledStreams = evaluatedStreams
      .filter((stream) => (
        stream.shortfallPct > this.#frameShortfallPctThreshold
        && stream.decodeDemand > this.#affectedStreamDemandThreshold
      ));

    if (throttledStreams.length === 0) {
      return issues;
    }

    const decodeDemand = evaluatedStreams.reduce((acc, stream) => acc + stream.decodeDemand, 0);
    const frameShortfallPct = (
      throttledStreams.reduce((acc, stream) => acc + stream.shortfallPct, 0)
      / throttledStreams.length
    );
    const affectedStreamsPercent = throttledStreams.length / (data.video.inbound.length / 100);
    if (
      decodeDemand > this.#decodeDemandThreshold
      && affectedStreamsPercent > this.#affectedStreamsPercentThreshold
    ) {
      issues.push({
        type: IssueType.CPU,
        reason: IssueReason.DecoderCPUThrottling,
        statsSample: {
          decodeDemand,
          frameShortfallPct,
          affectedStreamsPercent,
          evaluatedStreams,
          throttledStreams,
          throtthedStreams: throttledStreams,
        },
      });

      // clear all processed stats for this connection to avoid duplicate issues
      this.deleteLastProcessedStats(data.connection.id);
    }

    return issues;
  }
}

export default VideoDecoderIssueDetector;
