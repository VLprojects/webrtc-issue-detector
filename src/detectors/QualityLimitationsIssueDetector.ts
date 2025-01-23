import {
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';
import BaseIssueDetector from './BaseIssueDetector';

class QualityLimitationsIssueDetector extends BaseIssueDetector {
  performDetection(data: WebRTCStatsParsed): IssueDetectorResult {
    return this.processData(data);
  }

  private processData(data: WebRTCStatsParsed): IssueDetectorResult {
    const streamsWithLimitation = data.video.outbound.filter((stats) => stats.qualityLimitationReason !== 'none');
    const issues: IssueDetectorResult = [];
    const previousOutboundRTPVideoStreamsStats = this.getLastProcessedStats(data.connection.id)?.video.outbound;

    if (!previousOutboundRTPVideoStreamsStats) {
      return issues;
    }

    streamsWithLimitation.forEach((streamStats) => {
      const previousStreamStats = previousOutboundRTPVideoStreamsStats.find((item) => item.ssrc === streamStats.ssrc);

      if (!previousStreamStats) {
        // can not determine current status of the stream
        return;
      }

      const statsSample = {
        qualityLimitationReason: streamStats.qualityLimitationReason,
      };

      if (streamStats.framesSent > previousStreamStats.framesSent) {
        // stream is still sending
        return;
      }

      if (streamStats.qualityLimitationReason === 'cpu') {
        issues.push({
          statsSample,
          type: IssueType.CPU,
          reason: IssueReason.EncoderCPUThrottling,
          ssrc: streamStats.ssrc,
        });
      }

      if (streamStats.qualityLimitationReason === 'bandwidth') {
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

export default QualityLimitationsIssueDetector;
