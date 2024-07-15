import {
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';
import BaseIssueDetector, { BaseIssueDetectorParams } from './BaseIssueDetector';

interface NetworkMediaSyncIssueDetectorParams extends BaseIssueDetectorParams {
  correctedSamplesThresholdPct?: number
}

class NetworkMediaSyncIssueDetector extends BaseIssueDetector {
  readonly #correctedSamplesThresholdPct: number;

  constructor(params: NetworkMediaSyncIssueDetectorParams = {}) {
    super();
    this.#correctedSamplesThresholdPct = params.correctedSamplesThresholdPct ?? 5;
  }

  performDetection(data: WebRTCStatsParsed): IssueDetectorResult {
    const { connection: { id: connectionId } } = data;
    const issues = this.processData(data);
    this.setLastProcessedStats(connectionId, data);
    return issues;
  }

  private processData(data: WebRTCStatsParsed): IssueDetectorResult {
    const inboundRTPAudioStreamsStats = data.audio.inbound;
    const issues: IssueDetectorResult = [];
    const previousInboundRTPAudioStreamsStats = this.getLastProcessedStats(data.connection.id)?.audio.inbound;

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
      const correctedSamplesPct = Math.round((deltaCorrectedSamples * 100) / deltaSamplesReceived);
      const statsSample = {
        correctedSamplesPct,
      };

      if (correctedSamplesPct > this.#correctedSamplesThresholdPct) {
        issues.push({
          statsSample,
          type: IssueType.Network,
          reason: IssueReason.NetworkMediaSyncFailure,
          ssrc: stats.ssrc,
        });
      }
    });

    return issues;
  }
}

export default NetworkMediaSyncIssueDetector;
