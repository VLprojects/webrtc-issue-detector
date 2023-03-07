import {
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';
import BaseIssueDetector, { BaseIssueDetectorParams } from './BaseIssueDetector';

interface FramesEncodedSentIssueDetectorParams extends BaseIssueDetectorParams {
  missedFramesThreshold?: number;
}

class FramesEncodedSentIssueDetector extends BaseIssueDetector {
  readonly #missedFramesThreshold: number;

  constructor(params: FramesEncodedSentIssueDetectorParams = {}) {
    super(params);
    this.#missedFramesThreshold = params.missedFramesThreshold ?? 0.15;
  }

  performDetection(data: WebRTCStatsParsed): IssueDetectorResult {
    const { connection: { id: connectionId } } = data;
    const issues = this.processData(data);
    this.setLastProcessedStats(connectionId, data);
    return issues;
  }

  private processData(data: WebRTCStatsParsed): IssueDetectorResult {
    const streamsWithEncodedFrames = data.video.outbound.filter((stats) => stats.framesEncoded > 0);
    const issues: IssueDetectorResult = [];
    const previousOutboundRTPVideoStreamsStats = this.getLastProcessedStats(data.connection.id)?.video.outbound;

    if (!previousOutboundRTPVideoStreamsStats) {
      return issues;
    }

    streamsWithEncodedFrames.forEach((streamStats) => {
      const previousStreamStats = previousOutboundRTPVideoStreamsStats.find((item) => item.ssrc === streamStats.ssrc);

      if (!previousStreamStats) {
        return;
      }

      if (streamStats.framesEncoded === previousStreamStats.framesEncoded) {
        // stream is paused
        return;
      }

      const deltaFramesEncoded = streamStats.framesEncoded - previousStreamStats.framesEncoded;
      const deltaFramesSent = streamStats.framesSent - previousStreamStats.framesSent;
      const missedFrames = deltaFramesSent / deltaFramesEncoded;

      if (deltaFramesEncoded === 0) {
        // stream is paused
        return;
      }

      if (deltaFramesEncoded === deltaFramesSent) {
        // stream is ok
        return;
      }

      const statsSample = {
        deltaFramesSent,
        deltaFramesEncoded,
        missedFramesPct: Math.round(missedFrames * 100),
      };

      if (missedFrames >= this.#missedFramesThreshold) {
        issues.push({
          statsSample,
          type: IssueType.Network,
          reason: IssueReason.OutboundNetworkThroughput,
          ssrc: streamStats.ssrc,
        });
      }
    });

    return issues;
  }
}

export default FramesEncodedSentIssueDetector;
