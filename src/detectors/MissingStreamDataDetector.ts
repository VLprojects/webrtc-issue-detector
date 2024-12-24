import {
  IssueDetectorResult,
  IssueReason,
  IssueType,
  ParsedInboundAudioStreamStats,
  ParsedInboundVideoStreamStats,
  WebRTCStatsParsed,
} from '../types';
import BaseIssueDetector from './BaseIssueDetector';

interface MissingStreamDetectorParams {
  timeoutMs?: number;
}

export class MissingStreamDataDetector extends BaseIssueDetector {
  readonly #lastMarkedAt = new Map<string, number>();
  readonly #timeoutMs: number;

  constructor(params: MissingStreamDetectorParams = {}) {
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

    const { video: { inbound: newVideoInbound } } = data;
    const { video: { inbound: prevVideoInbound } } = previousStats;
    const { audio: { inbound: newAudioInbound } } = data;
    const { audio: { inbound: prevAudioInbound } } = previousStats;

    const mapVideoStatsByTrackId = (items: ParsedInboundVideoStreamStats[]) => new Map<string, ParsedInboundVideoStreamStats>(
      items.map((item) => [item.track.trackIdentifier, item] as const),
    );
    const mapAudioStatsByTrackId = (items: ParsedInboundAudioStreamStats[]) => new Map<string, ParsedInboundAudioStreamStats>(
      items.map((item) => [item.track.trackIdentifier, item] as const),
    );

    const newVideoInboundByTrackId = mapVideoStatsByTrackId(newVideoInbound);
    const prevVideoInboundByTrackId = mapVideoStatsByTrackId(prevVideoInbound);
    const newAudioInboundByTrackId = mapAudioStatsByTrackId(newAudioInbound);
    const prevAudioInboundByTrackId = mapAudioStatsByTrackId(prevAudioInbound);
    const unvisitedTrackIds = new Set(this.#lastMarkedAt.keys());

    Array.from(newVideoInboundByTrackId.entries()).forEach(([trackId, newInboundItem]) => {
      unvisitedTrackIds.delete(trackId);

      const prevInboundItem = prevVideoInboundByTrackId.get(trackId);
      if (!prevInboundItem) {
        return;
      }

      const deltaFramesReceived = newInboundItem.framesReceived - prevInboundItem.framesReceived;

      if (deltaFramesReceived === 0 && !newInboundItem.track.detached && !newInboundItem.track.ended) {
        const hasIssue = this.markIssue(trackId);

        if (!hasIssue) {
          return;
        }

        const statsSample = {
          framesReceived: newInboundItem.framesReceived,
          framesDropped: newInboundItem.framesDropped,
          trackDetached: newInboundItem.track.detached,
          trackEnded: newInboundItem.track.ended,
        };

        issues.push({
          type: IssueType.Stream,
          reason: IssueReason.MissingVideoStreamData,
          statsSample,
        });
      } else {
        this.removeMarkIssue(trackId);
      }
    });

    Array.from(newAudioInboundByTrackId.entries()).forEach(([trackId, newInboundItem]) => {
      unvisitedTrackIds.delete(trackId);

      const prevInboundItem = prevAudioInboundByTrackId.get(trackId);
      if (!prevInboundItem) {
        return;
      }

      const deltaFramesReceived = newInboundItem.bytesReceived - prevInboundItem.bytesReceived;

      if (deltaFramesReceived === 0 && !newInboundItem.track.detached && !newInboundItem.track.ended) {
        const hasIssue = this.markIssue(trackId);

        if (!hasIssue) {
          return;
        }

        const statsSample = {
          bytesReceived: newInboundItem.bytesReceived,
          packetsDiscarded: newInboundItem.packetsDiscarded,
          trackDetached: newInboundItem.track.detached,
          trackEnded: newInboundItem.track.ended,
        };

        issues.push({
          type: IssueType.Stream,
          reason: IssueReason.MissingAudioStreamData,
          statsSample,
        });
      } else {
        this.removeMarkIssue(trackId);
      }
    });

    unvisitedTrackIds.forEach((trackId) => {
      const lastMarkedAt = this.#lastMarkedAt.get(trackId);
      if (lastMarkedAt && Date.now() - lastMarkedAt > this.#timeoutMs) {
        this.removeMarkIssue(trackId);
      }
    });

    return issues;
  }

  private markIssue(trackId: string): boolean {
    const now = Date.now();
    const lastMarkedAt = this.#lastMarkedAt.get(trackId);

    if (!lastMarkedAt || now - lastMarkedAt > this.#timeoutMs) {
      this.#lastMarkedAt.set(trackId, now);
      return true;
    }

    return false;
  }

  private removeMarkIssue(trackId: string): void {
    this.#lastMarkedAt.delete(trackId);
  }
}

