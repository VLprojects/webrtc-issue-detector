import { calculateVolatility } from '../helpers/calc';
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
}

class VideoDecoderIssueDetector extends BaseIssueDetector {
  readonly #volatilityThreshold: number;

  readonly #affectedStreamsPercentThreshold: number;

  constructor(params: VideoDecoderIssueDetectorParams = {}) {
    super(params);
    this.#volatilityThreshold = params.volatilityThreshold ?? 8;
    this.#affectedStreamsPercentThreshold = params.affectedStreamsPercentThreshold ?? 30;
  }

  performDetection(data: WebRTCStatsParsedWithNetworkScores): IssueDetectorResult {
    const allHistoricalStats = [
      ...this.getAllLastProcessedStats(data.connection.id),
      data,
    ];

    const isBadNetworkHappened = allHistoricalStats
      .find((stat) => stat.networkScores.inbound !== undefined && stat.networkScores.inbound <= MosQuality.BAD);

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

    const throtthedStreams = data.video.inbound
      .map((incomeVideoStream): { ssrc: number, allFps: number[], volatility: number } | undefined => {
        // At least 5 elements needed to have enough representation
        if (allProcessedStats.length < 5) {
          return undefined;
        }

        const isSpatialLayerChanged = isSvcSpatialLayerChanged(incomeVideoStream.ssrc, allProcessedStats);
        if (isSpatialLayerChanged) {
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

        if (allFps.length === 0) {
          return undefined;
        }

        const volatility = calculateVolatility(allFps);

        if (volatility > this.#volatilityThreshold) {
          return { ssrc: incomeVideoStream.ssrc, allFps, volatility };
        }

        return undefined;
      })
      .filter((throttledVideoStream) => Boolean(throttledVideoStream));

    if (throtthedStreams.length === 0) {
      return issues;
    }

    const affectedStreamsPercent = throtthedStreams.length / (data.video.inbound.length / 100);
    if (affectedStreamsPercent > this.#affectedStreamsPercentThreshold) {
      issues.push({
        type: IssueType.CPU,
        reason: IssueReason.DecoderCPUThrottling,
        statsSample: {
          affectedStreamsPercent,
          throtthedStreams,
        },
      });

      // clear all processed stats for this connection to avoid duplicate issues
      this.deleteLastProcessedStats(data.connection.id);
    }

    return issues;
  }
}

export default VideoDecoderIssueDetector;
