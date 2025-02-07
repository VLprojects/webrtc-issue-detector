import { isDtxLikeBehavior } from '../helpers/streams';
import {
  IssueDetectorResult,
  IssueReason,
  IssueType,
  MosQuality,
  WebRTCStatsParsed,
  WebRTCStatsParsedWithNetworkScores,
} from '../types';
import { isSvcSpatialLayerChanged } from '../utils/video';
import BaseIssueDetector from './BaseIssueDetector';

interface FrozenVideoTrackDetectorParams {
  avgFreezeDurationThresholdMs?: number;
  frozenDurationThresholdPct?: number;
  minMosQuality?: number;
}

interface FrozenStreamStatsSample {
  ssrc: number;
  avgFreezeDurationMs: number;
  frozenDurationPct: number;
}

class FrozenVideoTrackDetector extends BaseIssueDetector {
  readonly #avgFreezeDurationThresholdMs: number;

  readonly #frozenDurationThresholdPct: number;

  readonly #minMosQuality: MosQuality;

  constructor(params: FrozenVideoTrackDetectorParams = {}) {
    super();
    this.#avgFreezeDurationThresholdMs = params.avgFreezeDurationThresholdMs ?? 1_000;
    this.#frozenDurationThresholdPct = params.frozenDurationThresholdPct ?? 30;
    this.#minMosQuality = params.minMosQuality ?? MosQuality.BAD;
  }

  performDetection(data: WebRTCStatsParsedWithNetworkScores): IssueDetectorResult {
    const inboundScore = data.networkScores.inbound;
    if (inboundScore !== undefined && inboundScore <= this.#minMosQuality) {
      // do not execute detection on stats based on poor network quality
      // to avoid false positives
      return [];
    }

    return this.processData(data);
  }

  private processData(data: WebRTCStatsParsed): IssueDetectorResult {
    const issues: IssueDetectorResult = [];
    const allLastProcessedStats = this.getAllLastProcessedStats(data.connection.id);
    if (allLastProcessedStats.length === 0) {
      return [];
    }

    const frozenStreams = data.video.inbound
      .map((videoStream): FrozenStreamStatsSample | undefined => {
        const prevStat = allLastProcessedStats[allLastProcessedStats.length - 1]
          .video.inbound.find((stream) => stream.ssrc === videoStream.ssrc);

        if (!prevStat) {
          return undefined;
        }

        const isSpatialLayerChanged = isSvcSpatialLayerChanged(videoStream.ssrc, [
          allLastProcessedStats[allLastProcessedStats.length - 1],
          data,
        ]);

        if (isSpatialLayerChanged) {
          return undefined;
        }

        const isDtx = isDtxLikeBehavior(videoStream.ssrc, allLastProcessedStats);
        if (isDtx) {
          // DTX-like behavior detected, ignoring freezes check
          return undefined;
        }

        const deltaFreezeCount = videoStream.freezeCount - (prevStat.freezeCount ?? 0);
        const deltaFreezesTimeMs = (videoStream.totalFreezesDuration - (prevStat.totalFreezesDuration ?? 0)) * 1000;
        const avgFreezeDurationMs = deltaFreezeCount > 0 ? deltaFreezesTimeMs / deltaFreezeCount : 0;

        const statsTimeDiff = videoStream.timestamp - prevStat.timestamp;
        const frozenDurationPct = (deltaFreezesTimeMs / statsTimeDiff) * 100;
        if (frozenDurationPct > this.#frozenDurationThresholdPct) {
          return {
            ssrc: videoStream.ssrc,
            avgFreezeDurationMs,
            frozenDurationPct,
          };
        }

        if (avgFreezeDurationMs > this.#avgFreezeDurationThresholdMs) {
          return {
            ssrc: videoStream.ssrc,
            avgFreezeDurationMs,
            frozenDurationPct,
          };
        }

        return undefined;
      })
      .filter((stream) => stream !== undefined) as FrozenStreamStatsSample[];

    if (frozenStreams.length > 0) {
      issues.push({
        type: IssueType.Stream,
        reason: IssueReason.FrozenVideoTrack,
        statsSample: {
          ssrcs: frozenStreams.map((stream) => stream.ssrc),
        },
      });

      // clear all processed stats for this connection to avoid duplicate issues
      this.deleteLastProcessedStats(data.connection.id);
    }

    return issues;
  }
}

export default FrozenVideoTrackDetector;
