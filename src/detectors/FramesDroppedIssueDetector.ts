import {
  IssueDetector,
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';
import { scheduleTask } from '../utils/tasks';
import { CLEANUP_PREV_STATS_TTL_MS } from '../utils/constants';

class FramesDroppedIssueDetector implements IssueDetector {
  #lastProcessedStats: { [connectionId: string]: WebRTCStatsParsed | undefined } = {};

  #framesDroppedThreshold = 0.5;

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
    const streamsWithDroppedFrames = data.video.inbound.filter((stats) => stats.framesDropped > 0);
    const issues: IssueDetectorResult = [];
    const previousInboundRTPVideoStreamsStats = this.#lastProcessedStats[data.connection.id]?.video.inbound;

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
      if (deltaFramesReceived === 0 && deltaFramesDecoded === 0) {
        // looks like stream is stopped, skip checking framesDropped
        return;
      }

      const framesDropped = deltaFramesDropped / deltaFramesReceived;
      if (framesDropped >= this.#framesDroppedThreshold) {
        // more than half of the received frames were dropped
        issues.push({
          type: IssueType.CPU,
          reason: IssueReason.DecoderCPUThrottling,
          ssrc: streamStats.ssrc,
          debug: `framesDropped: ${Math.round(framesDropped * 100)}`
            + ` , deltaFramesDropped: ${deltaFramesDropped}, deltaFramesReceived: ${deltaFramesReceived}`,
        });
      }
    });

    return issues;
  }
}

export default FramesDroppedIssueDetector;
