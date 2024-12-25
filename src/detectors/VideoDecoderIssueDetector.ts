import {
  IssueDetectorResult,
  WebRTCStatsParsed,
} from '../types';
import BaseIssueDetector, { BaseIssueDetectorParams } from './BaseIssueDetector';

interface VideoDecoderIssueDetectorParams extends BaseIssueDetectorParams {
  decodeTimePerFrameIncreaseSpeedThreshold?: number;
  minDecodeTimePerFrameIncreaseCases?: number;
}

class VideoDecoderIssueDetector extends BaseIssueDetector {
  #decodeTimePerFrameIncreaseSpeedThreshold: number;

  #minDecodeTimePerFrameIncreaseCases: number;

  constructor(params: VideoDecoderIssueDetectorParams = {}) {
    super(params);
    this.#decodeTimePerFrameIncreaseSpeedThreshold = params.decodeTimePerFrameIncreaseSpeedThreshold ?? 1.05;
    this.#minDecodeTimePerFrameIncreaseCases = params.minDecodeTimePerFrameIncreaseCases ?? 3;
  }

  performDetection(data: WebRTCStatsParsed): IssueDetectorResult {
    const { connection: { id: connectionId } } = data;
    const issues = this.processData(data);
    this.setLastProcessedStats(connectionId, data);
    return issues;
  }

  private processData(data: WebRTCStatsParsed): IssueDetectorResult {
    const currentIncomeVideoStreams = data.video.inbound;
    const allLastProcessedStats = this
      .getAllLastProcessedStats(data.connection.id);

    const issues: IssueDetectorResult = [];

    currentIncomeVideoStreams.forEach((incomeVideoStream) => {
      const lastIncomeVideoStreamStats = allLastProcessedStats
        .map((connectionStats) => connectionStats.video.inbound.find(
          (videoStreamStats) => videoStreamStats.id === incomeVideoStream.id,
        ))
        .filter((stats) => (stats?.framesDecoded || 0) > 0 && (stats?.totalDecodeTime || 0) > 0);

      if (lastIncomeVideoStreamStats.length < this.#minDecodeTimePerFrameIncreaseCases) {
        return;
      }

      const decodeTimePerFrame = lastIncomeVideoStreamStats
        .map((stats) => (stats!.totalDecodeTime * 1000) / stats!.framesDecoded);

      const currentDecodeTimePerFrame = (incomeVideoStream.totalDecodeTime * 1000) / incomeVideoStream.framesDecoded;
      decodeTimePerFrame.push(currentDecodeTimePerFrame);

      const mean = decodeTimePerFrame.reduce((acc, val) => acc + val, 0) / decodeTimePerFrame.length;
      const squaredDiffs = decodeTimePerFrame.map((val) => (val - mean) ** 2);
      const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / squaredDiffs.length;
      const volatility = Math.sqrt(variance);

      console.log({
        decodeTimePerFrame,
        mean,
        variance,
        volatility,
      });
    });

    return issues;
  }
}

export default VideoDecoderIssueDetector;
