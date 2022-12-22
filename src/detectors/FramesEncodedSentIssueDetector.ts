import {
  IssueDetector,
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';
import { scheduleTask } from '../utils/tasks';
import { CLEANUP_PREV_STATS_TTL_MS } from '../utils/constants';

class FramesEncodedSentIssueDetector implements IssueDetector {
  #lastProcessedStats: { [connectionId: string]: WebRTCStatsParsed | undefined } = {};

  #missedFramesThreshold = 0.15;

  detect(data: WebRTCStatsParsed): IssueDetectorResult {
    const { connection: { id: connectionId } } = data;
    const issues = this.processData(data);
    this.#lastProcessedStats[connectionId] = data;

    scheduleTask({
      taskId: connectionId,
      delayMs: CLEANUP_PREV_STATS_TTL_MS,
      callback: () => (delete this.#lastProcessedStats[connectionId]),
    });

    return issues;
  }

  private processData(data: WebRTCStatsParsed): IssueDetectorResult {
    const streamsWithEncodedFrames = data.video.outbound.filter((stats) => stats.framesEncoded > 0);
    const issues: IssueDetectorResult = [];
    const previousOutboundRTPVideoStreamsStats = this.#lastProcessedStats[data.connection.id]?.video.outbound;

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

      if (deltaFramesEncoded === 0) {
        // stream is paused
        return;
      }

      if (deltaFramesEncoded === deltaFramesSent) {
        // stream is ok
        return;
      }

      const missedFrames = deltaFramesSent / deltaFramesEncoded;
      if (missedFrames >= this.#missedFramesThreshold) {
        issues.push({
          type: IssueType.Network,
          reason: IssueReason.OutboundNetworkThroughput,
          ssrc: streamStats.ssrc,
          debug: `missedFrames: ${Math.round(missedFrames * 100)}%`,
        });
      }
    });

    return issues;
  }
}

export default FramesEncodedSentIssueDetector;
