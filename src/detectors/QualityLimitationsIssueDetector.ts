import {
  IssueDetector,
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';
import { scheduleTask } from '../utils/tasks';
import { CLEANUP_PREV_STATS_TTL_MS } from '../utils/constants';

class QualityLimitationsIssueDetector implements IssueDetector {
  #lastProcessedStats: { [connectionId: string]: WebRTCStatsParsed | undefined } = {};

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
    const streamsWithLimitation = data.video.outbound.filter((stats) => stats.qualityLimitationReason !== 'none');
    const issues: IssueDetectorResult = [];
    const previousOutboundRTPVideoStreamsStats = this.#lastProcessedStats[data.connection.id]?.video.outbound;

    if (!previousOutboundRTPVideoStreamsStats) {
      return issues;
    }

    streamsWithLimitation.forEach((streamStats) => {
      const previousStreamStats = previousOutboundRTPVideoStreamsStats.find((item) => item.ssrc === streamStats.ssrc);

      if (!previousStreamStats) {
        // can not determine current status of the stream
        return;
      }

      if (streamStats.framesSent > previousStreamStats.framesSent) {
        // stream is still sending
        return;
      }

      if (streamStats.qualityLimitationReason === 'cpu') {
        issues.push({
          type: IssueType.CPU,
          reason: IssueReason.EncoderCPUThrottling,
          ssrc: streamStats.ssrc,
          debug: 'qualityLimitationReason: cpu',
        });
      }

      if (streamStats.qualityLimitationReason === 'bandwidth') {
        issues.push({
          type: IssueType.Network,
          reason: IssueReason.OutboundNetworkThroughput,
          ssrc: streamStats.ssrc,
          debug: 'qualityLimitationReason: bandwidth',
        });
      }
    });

    return issues;
  }
}

export default QualityLimitationsIssueDetector;
