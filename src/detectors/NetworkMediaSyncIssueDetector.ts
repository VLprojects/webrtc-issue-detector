import {
  IssueDetector,
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';
import { scheduleTask } from '../utils/tasks';
import { CLEANUP_PREV_STATS_TTL_MS } from '../utils/constants';

class NetworkMediaSyncIssueDetector implements IssueDetector {
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
    const inboundRTPAudioStreamsStats = data.audio.inbound;
    const issues: IssueDetectorResult = [];
    const previousInboundRTPAudioStreamsStats = this.#lastProcessedStats[data.connection.id]?.audio.inbound;

    if (!previousInboundRTPAudioStreamsStats) {
      return issues;
    }

    inboundRTPAudioStreamsStats.forEach((stats) => {
      const previousStreamStats = previousInboundRTPAudioStreamsStats.find((item) => item.ssrc === stats.ssrc);
      if (!previousStreamStats) {
        return;
      }

      const nowCorrectedSamples = stats.track.insertedSamplesForDeceleration
        + stats.track.removedSamplesForAcceleration;
      const lastCorrectedSamples = previousStreamStats.track.insertedSamplesForDeceleration
        + previousStreamStats.track.removedSamplesForAcceleration;

      if (nowCorrectedSamples === lastCorrectedSamples) {
        return;
      }

      const deltaSamplesReceived = stats.track.totalSamplesReceived - previousStreamStats.track.totalSamplesReceived;
      const deltaCorrectedSamples = nowCorrectedSamples - lastCorrectedSamples;
      const correctedSamplesPercentage = Math.round((deltaCorrectedSamples * 100) / deltaSamplesReceived);

      if (correctedSamplesPercentage > 5) {
        issues.push({
          type: IssueType.Network,
          reason: IssueReason.NetworkMediaSyncFailure,
          ssrc: stats.ssrc,
          debug: `correctedSamplesPercentage: ${correctedSamplesPercentage}%`,
        });
      }
    });

    return issues;
  }
}

export default NetworkMediaSyncIssueDetector;
