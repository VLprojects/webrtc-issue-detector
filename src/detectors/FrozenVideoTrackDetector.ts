import {
  IssueDetectorResult,
  IssueReason,
  IssueType,
  ParsedInboundVideoStreamStats,
  WebRTCStatsParsed,
} from '../types';
import BaseIssueDetector from './BaseIssueDetector';

interface FrozenVideoTrackDetectorParams {
  timeoutMs?: number;
  framesDroppedThreshold?: number;
}

class FrozenVideoTrackDetector extends BaseIssueDetector {
  readonly #lastMarkedAt = new Map<string, number>();

  readonly #timeoutMs: number;

  readonly #framesDroppedThreshold: number;

  constructor(params: FrozenVideoTrackDetectorParams = {}) {
    super();
    this.#timeoutMs = params.timeoutMs ?? 10_000;
    this.#framesDroppedThreshold = params.framesDroppedThreshold ?? 0.5;
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
    const unvisitedTrackIds = new Set(this.#lastMarkedAt.keys());

    Array.from(newInboundByTrackId.entries()).forEach(([trackId, newInboundItem]) => {
      unvisitedTrackIds.delete(trackId);

      const prevInboundItem = prevInboundByTrackId.get(trackId);
      if (!prevInboundItem) {
        return;
      }

      const deltaFramesReceived = newInboundItem.framesReceived - prevInboundItem.framesReceived;
      const deltaFramesDropped = newInboundItem.framesDropped - prevInboundItem.framesDropped;
      const deltaFramesDecoded = newInboundItem.framesDecoded - prevInboundItem.framesDecoded;
      const ratioFramesDropped = deltaFramesDropped / deltaFramesReceived;

      if (deltaFramesReceived === 0) {
        return;
      }

      // We skip it when ratio is too low because it should be handled by VideoDecoderIssueDetector
      if (ratioFramesDropped >= this.#framesDroppedThreshold) {
        return;
      }

      // It seems that track is alive and we can remove mark if it was marked
      if (deltaFramesDecoded > 0) {
        this.removeMarkIssue(trackId);
        return;
      }

      const hasIssue = this.markIssue(trackId);

      if (!hasIssue) {
        return;
      }

      const statsSample = {
        framesReceived: newInboundItem.framesReceived,
        framesDropped: newInboundItem.framesDropped,
        framesDecoded: newInboundItem.framesDecoded,
        deltaFramesReceived,
        deltaFramesDropped,
        deltaFramesDecoded,
      };

      issues.push({
        statsSample,
        type: IssueType.Stream,
        reason: IssueReason.FrozenVideoTrack,
        trackIdentifier: trackId,
      });
    });

    // just clear unvisited tracks from memory
    unvisitedTrackIds.forEach((trackId) => {
      this.removeMarkIssue(trackId);
    });

    return issues;
  }

  private markIssue(trackId: string): boolean {
    const now = Date.now();

    const lastMarkedAt = this.#lastMarkedAt.get(trackId);

    if (!lastMarkedAt) {
      this.#lastMarkedAt.set(trackId, now);
      return false;
    }

    if (now - lastMarkedAt < this.#timeoutMs) {
      return false;
    }

    return true;
  }

  private removeMarkIssue(trackId: string): void {
    this.#lastMarkedAt.delete(trackId);
  }
}

export default FrozenVideoTrackDetector;
