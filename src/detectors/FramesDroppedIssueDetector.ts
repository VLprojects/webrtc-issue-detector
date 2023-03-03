import {
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';
import BaseIssueDetector, { BaseIssueDetectorParams } from './BaseIssueDetector';

interface FramesDroppedIssueDetectorParams extends BaseIssueDetectorParams {
  framesDroppedThreshold?: number;
}

class FramesDroppedIssueDetector extends BaseIssueDetector {
  readonly #framesDroppedThreshold: number;

  constructor(params: FramesDroppedIssueDetectorParams = {}) {
    super(params);
    this.#framesDroppedThreshold = params.framesDroppedThreshold ?? 0.5;
  }

  performDetection(data: WebRTCStatsParsed): IssueDetectorResult {
    const { connection: { id: connectionId } } = data;
    const issues = this.processData(data);
    this.setLastProcessedStats(connectionId, data);
    return issues;
  }

  private processData(data: WebRTCStatsParsed): IssueDetectorResult {
    const streamsWithDroppedFrames = data.video.inbound.filter((stats) => stats.framesDropped > 0);
    const issues: IssueDetectorResult = [];
    const previousInboundRTPVideoStreamsStats = this.getLastProcessedStats(data.connection.id)?.video.inbound;

    if (!previousInboundRTPVideoStreamsStats) {
      return issues;
    }

    streamsWithDroppedFrames.forEach((streamStats) => {
      const previousStreamStats = previousInboundRTPVideoStreamsStats.find((item) => item.ssrc === streamStats.ssrc);
      if (!previousStreamStats) {
        return;
      }

      if (streamStats.framesDropped === previousStreamStats.framesDropped) {
        // stream is decoded correctly
        return;
      }

      const deltaFramesReceived = streamStats.framesReceived - previousStreamStats.framesReceived;
      const deltaFramesDecoded = streamStats.framesDecoded - previousStreamStats.framesDecoded;
      const deltaFramesDropped = streamStats.framesDropped - previousStreamStats.framesDropped;

      if (deltaFramesReceived === 0 || deltaFramesDecoded === 0) {
        // looks like stream is stopped, skip checking framesDropped
        return;
      }

      const framesDropped = deltaFramesDropped / deltaFramesReceived;
      const debug = {
        deltaFramesDropped,
        deltaFramesReceived,
        deltaFramesDecoded,
        framesDroppedPct: Math.round(framesDropped * 100),
      };

      if (framesDropped >= this.#framesDroppedThreshold) {
        // more than half of the received frames were dropped
        issues.push({
          debug,
          type: IssueType.CPU,
          reason: IssueReason.DecoderCPUThrottling,
          ssrc: streamStats.ssrc,
        });
      }
    });

    return issues;
  }
}

export default FramesDroppedIssueDetector;
