import {
  IssueDetector,
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';

class AvailableOutgoingBitrateIssueDetector implements IssueDetector {
  #availableOutgoingBitrateTreshhold = 300000; // 300 kbit/s

  detect(data: WebRTCStatsParsed): IssueDetectorResult {
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

    if (audioStreamsTotalTargetBitrate > availableOutgoingBitrate) {
      issues.push({
        type: IssueType.Network,
        reason: IssueReason.OutboundNetworkThroughput,
        debug: `availableOutgoingBitrate: ${availableOutgoingBitrate}`
          + `, audioStreamsTotalTargetBitrate: ${audioStreamsTotalTargetBitrate}`,
      });

      return issues;
    }

    if (videoStreamsTotalBitrate > 0 && availableOutgoingBitrate < this.#availableOutgoingBitrateTreshhold) {
      issues.push({
        type: IssueType.Network,
        reason: IssueReason.OutboundNetworkThroughput,
        debug: `availableOutgoingBitrate: ${availableOutgoingBitrate}`
          + `, videoStreamsTotalBitrate: ${videoStreamsTotalBitrate}`,
      });

      return issues;
    }

    return issues;
  }
}

export default AvailableOutgoingBitrateIssueDetector;
