import {
  IssueDetectorResult,
  IssueReason,
  IssueType,
  ParsedInboundVideoStreamStats,
  WebRTCStatsParsed,
} from '../types';
import BaseIssueDetector from './BaseIssueDetector';

const sumStats = (
  accessor: (stat: ParsedInboundVideoStreamStats) => number,
  stats: ParsedInboundVideoStreamStats[],
) => stats.reduce((sum, stat) => sum + accessor(stat), 0);

const sumPacketsReceived = sumStats.bind(null, (stat) => stat.packetsReceived);
const sumDecodedFrames = sumStats.bind(null, (stat) => stat.framesDecoded);

const hasNewInboundTraffic = (data: WebRTCStatsParsed, prevData: WebRTCStatsParsed): boolean => {
  const { video: { inbound: newInbound } } = data;
  const { video: { inbound: prevInbound } } = prevData;

  return sumPacketsReceived(newInbound) > sumPacketsReceived(prevInbound);
};

const hasNewDecodedFrames = (data: WebRTCStatsParsed, prevData: WebRTCStatsParsed): boolean => {
  const { video: { inbound: newInbound } } = data;
  const { video: { inbound: prevInbound } } = prevData;

  return sumDecodedFrames(newInbound) > sumDecodedFrames(prevInbound);
};

class DeadVideoTrackDetector extends BaseIssueDetector {
  #lastMarkedAt: number | undefined;

  #timeoutMs: number;

  constructor(params: { timeoutMs?: number } = {}) {
    super();
    this.#timeoutMs = params.timeoutMs ?? 10_000;
  }

  performDetection(data: WebRTCStatsParsed): IssueDetectorResult {
    const { connection: { id: connectionId } } = data;
    const issues = this.processData(data);
    this.setLastProcessedStats(connectionId, data);
    return issues;
  }

  private processData(data: WebRTCStatsParsed): IssueDetectorResult {
    const { connection: { id: connectionId } } = data;
    const previousStats = this.getLastProcessedStats(connectionId);
    const issues: IssueDetectorResult = [];

    if (!previousStats) {
      return issues;
    }

    if (hasNewInboundTraffic(data, previousStats)) {
      if (hasNewDecodedFrames(data, previousStats)) {
        this.removeMarkIssue();
      } else {
        const hasIssue = this.markIssue();

        if (hasIssue) {
          const statsSample = {
            packetsReceived: sumPacketsReceived(data.video.inbound),
            framesDecoded: sumDecodedFrames(data.video.inbound),
            deltaFramesDecoded: sumDecodedFrames(data.video.inbound) - sumDecodedFrames(previousStats.video.inbound),
            deltaPacketsReceived:
              sumPacketsReceived(data.video.inbound) - sumPacketsReceived(previousStats.video.inbound),
          };

          issues.push({
            statsSample,
            type: IssueType.Stream,
            reason: IssueReason.DeadVideoTrack,
            iceCandidate: data.connection.local.id,
          });
        }
      }
    }

    return issues;
  }

  private markIssue(): boolean {
    const now = Date.now();

    if (!this.#lastMarkedAt) {
      this.#lastMarkedAt = now;
      return false;
    }

    if (now - this.#lastMarkedAt < this.#timeoutMs) {
      return false;
    }

    return true;
  }

  private removeMarkIssue(): void {
    this.#lastMarkedAt = undefined;
  }
}

export default DeadVideoTrackDetector;
