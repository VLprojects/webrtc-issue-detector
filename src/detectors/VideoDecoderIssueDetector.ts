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
    this.#volatilityThreshold = params.volatilityThreshold ?? 1.5;
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
      .map((incomeVideoStream): { ssrc: number, allDecodeTimePerFrame: number[], volatility: number } | undefined => {
        const allDecodeTimePerFrame: number[] = [];
        const isSpatialLayerChanged = isSvcSpatialLayerChanged(incomeVideoStream.ssrc, allProcessedStats);
        if (isSpatialLayerChanged) {
          return undefined;
        }

        // We need at least 5 elements to have enough representation
        if (allProcessedStats.length < 5) {
          return undefined;
        }

        // exclude first element to calculate accurate delta
        for (let i = 1; i < allProcessedStats.length; i += 1) {
          let deltaFramesDecoded = 0;
          let deltaTotalDecodeTime = 0;
          let decodeTimePerFrame = 0;

          const videoStreamStats = allProcessedStats[i].video.inbound.find(
            (stream) => stream.ssrc === incomeVideoStream.ssrc,
          );

          if (!videoStreamStats) {
            continue;
          }

          const prevVideoStreamStats = allProcessedStats[i - 1].video.inbound.find(
            (stream) => stream.ssrc === incomeVideoStream.ssrc,
          );

          if (prevVideoStreamStats) {
            deltaFramesDecoded = videoStreamStats.framesDecoded - prevVideoStreamStats.framesDecoded;
            deltaTotalDecodeTime = videoStreamStats.totalDecodeTime - prevVideoStreamStats.totalDecodeTime;
          }

          if (deltaTotalDecodeTime > 0 && deltaFramesDecoded > 0) {
            decodeTimePerFrame = (deltaTotalDecodeTime * 1000) / deltaFramesDecoded;
          }

          allDecodeTimePerFrame.push(decodeTimePerFrame);
        }

        // Calculate volatility
        const mean = allDecodeTimePerFrame.reduce((acc, val) => acc + val, 0) / allDecodeTimePerFrame.length;
        const squaredDiffs = allDecodeTimePerFrame.map((val) => (val - mean) ** 2);
        const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / squaredDiffs.length;
        const volatility = Math.sqrt(variance);

        const isDecodeTimePerFrameIncrease = allDecodeTimePerFrame.every(
          (decodeTimePerFrame, index) => index === 0 || decodeTimePerFrame > allDecodeTimePerFrame[index - 1],
        );

        if (volatility > this.#volatilityThreshold && isDecodeTimePerFrameIncrease) {
          return { ssrc: incomeVideoStream.ssrc, allDecodeTimePerFrame, volatility };
        }

        return undefined;
      })
      .filter((throttledVideoStream) => Boolean(throttledVideoStream));

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
