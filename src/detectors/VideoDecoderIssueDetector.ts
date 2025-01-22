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
  #volatilityThreshold: number;

  #affectedStreamsPercentThreshold: number;

  constructor(params: VideoDecoderIssueDetectorParams = {}) {
    super(params);
    this.#volatilityThreshold = params.volatilityThreshold ?? 8;
    this.#affectedStreamsPercentThreshold = params.affectedStreamsPercentThreshold ?? 50;
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
        const isSpatialLayerChanged = isSvcSpatialLayerChanged(incomeVideoStream.ssrc, allProcessedStats);
        if (isSpatialLayerChanged) {
          return undefined;
        }

        // We need at least 5 elements to have enough representation
        if (allProcessedStats.length < 5) {
          return undefined;
        }

        const allFps: number[] = [];

        // exclude first element to calculate accurate delta
        for (let i = 1; i < allProcessedStats.length; i += 1) {
          const videoStreamStats = allProcessedStats[i].video.inbound.find(
            (stream) => stream.ssrc === incomeVideoStream.ssrc,
          );

          if (videoStreamStats) {
            allFps.push(videoStreamStats.framesPerSecond);
          }
        }

        // Calculate volatility fps
        const meanFps = allFps.reduce((acc, val) => acc + val, 0) / allFps.length;
        const meanAbsoluteDeviationFps = allFps
          .reduce((acc, val) => acc + Math.abs(val - meanFps), 0) / allFps.length;
        const volatility = (meanAbsoluteDeviationFps * 100) / meanFps;

        console.log('THROTTLE', {
          volatility,
          allFps,
        });

        if (volatility > this.#volatilityThreshold) {
          console.log('THROTTLE DETECTED on Single stream');
          return { ssrc: incomeVideoStream.ssrc, allFps, volatility };
        }

        return undefined;
      })
      .filter((throttledVideoStream) => Boolean(throttledVideoStream));

    const affectedStreamsPercent = throtthedStreams.length / (data.video.inbound.length / 100);
    console.log('THROTTLE AFFECTION', { affectedStreamsPercent });
    if (affectedStreamsPercent > this.#affectedStreamsPercentThreshold) {
      console.log('THROTTLE DETECTED !!!!');
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
