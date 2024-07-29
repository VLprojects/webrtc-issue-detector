import {
  IssueDetectorResult,
  IssueReason,
  IssueType,
  ParsedInboundVideoStreamStats,
  WebRTCStatsParsed,
} from '../types';
import BaseIssueDetector from './BaseIssueDetector';

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

    const { video: { inbound: newInbound } } = data;
    const { video: { inbound: prevInbound } } = previousStats;

    const mapByTrackId = (items: ParsedInboundVideoStreamStats[]) => new Map<string, ParsedInboundVideoStreamStats>(
      items.map((item) => [item.track.trackIdentifier, item] as const),
    );

    const newInboundByTrackId = mapByTrackId(newInbound);
    const prevInboundByTrackId = mapByTrackId(prevInbound);

    Array.from(newInboundByTrackId.entries()).forEach(([trackId, newInboundItem]) => {
      const prevInboundItem = prevInboundByTrackId.get(trackId);
      if (!prevInboundItem) {
        return;
      }

      if (
        newInboundItem.packetsReceived > prevInboundItem.packetsReceived
      ) {
        if (newInboundItem.framesDecoded > prevInboundItem.framesDecoded) {
          this.removeMarkIssue();
        } else {
          const hasIssue = this.markIssue();

          if (hasIssue) {
            const statsSample = {
              packetsReceived: newInboundItem.packetsReceived,
              framesDecoded: newInboundItem.framesDecoded,
              deltaFramesDecoded: newInboundItem.framesDecoded - prevInboundItem.framesDecoded,
              deltaPacketsReceived: newInboundItem.packetsReceived - prevInboundItem.packetsReceived,
            };

            issues.push({
              statsSample,
              type: IssueType.Stream,
              reason: IssueReason.DeadVideoTrack,
              iceCandidate: trackId,
            });
          }
        }
      }
    });

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
