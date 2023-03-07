import {
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';
import BaseIssueDetector, { BaseIssueDetectorParams } from './BaseIssueDetector';

interface AvailableOutgoingBitrateIssueDetectorParams extends BaseIssueDetectorParams {
  availableOutgoingBitrateThreshold?: number;
}

class AvailableOutgoingBitrateIssueDetector extends BaseIssueDetector {
  readonly #availableOutgoingBitrateThreshold: number;

  constructor(params: AvailableOutgoingBitrateIssueDetectorParams = {}) {
    super(params);
    this.#availableOutgoingBitrateThreshold = params.availableOutgoingBitrateThreshold ?? 100_000; // 100 KBit/s
  }

  performDetection(data: WebRTCStatsParsed): IssueDetectorResult {
    const issues: IssueDetectorResult = [];
    const { availableOutgoingBitrate } = data.connection;
    if (availableOutgoingBitrate === undefined) {
      // availableOutgoingBitrate is not measured yet
      return issues;
    }

    const audioStreamsTotalTargetBitrate = data.audio.outbound
      .reduce((totalBitrate, streamStat) => totalBitrate + streamStat.targetBitrate, 0);

    const videoStreamsTotalBitrate = data.video.outbound
      .reduce((totalBitrate, streamStat) => totalBitrate + streamStat.bitrate, 0);

    if (!audioStreamsTotalTargetBitrate && !videoStreamsTotalBitrate) {
      // there are no streams sending through this connection
      return issues;
    }

    const statsSample = {
      availableOutgoingBitrate,
      videoStreamsTotalBitrate,
      audioStreamsTotalTargetBitrate,
    };

    if (audioStreamsTotalTargetBitrate > availableOutgoingBitrate) {
      issues.push({
        statsSample,
        type: IssueType.Network,
        reason: IssueReason.OutboundNetworkThroughput,
      });

      return issues;
    }

    if (videoStreamsTotalBitrate > 0 && availableOutgoingBitrate < this.#availableOutgoingBitrateThreshold) {
      issues.push({
        statsSample,
        type: IssueType.Network,
        reason: IssueReason.OutboundNetworkThroughput,
      });

      return issues;
    }

    return issues;
  }
}

export default AvailableOutgoingBitrateIssueDetector;
