import {
  CommonParsedInboundStreamStats,
  IssueDetectorResult,
  IssuePayload,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';
import BaseIssueDetector from './BaseIssueDetector';

interface MissingStreamDetectorParams {
  timeoutMs?: number; // delay to report the issue no more often then once specified value
  steps?: number; // number of last stats to check
}

export default class MissingStreamDataDetector extends BaseIssueDetector {
  readonly #lastMarkedAt = new Map<string, number>();

  readonly #timeoutMs: number;

  readonly #steps: number;

  constructor(params: MissingStreamDetectorParams = {}) {
    super();
    this.#timeoutMs = params.timeoutMs ?? 15_000;
    this.#steps = params.steps ?? 3;
  }

  performDetection(data: WebRTCStatsParsed): IssueDetectorResult {
    const { connection: { id: connectionId } } = data;
    const issues = this.processData(data);
    this.setLastProcessedStats(connectionId, data);
    return issues;
  }

  private processData(data: WebRTCStatsParsed): IssueDetectorResult {
    const issues: IssueDetectorResult = [];

    const allLastProcessedStats = [...this.getAllLastProcessedStats(data.connection.id), data];
    if (allLastProcessedStats.length < this.#steps) {
      return issues;
    }

    const lastNProcessedStats = allLastProcessedStats.slice(-this.#steps);

    const lastNVideoInbound = lastNProcessedStats.map((stats) => stats.video.inbound);
    const lastNAudioInbound = lastNProcessedStats.map((stats) => stats.audio.inbound);

    issues.push(...this.detectMissingData(
      lastNAudioInbound as unknown as CommonParsedInboundStreamStats[][],
      IssueType.Stream,
      IssueReason.MissingAudioStreamData,
    ));

    issues.push(...this.detectMissingData(
      lastNVideoInbound,
      IssueType.Stream,
      IssueReason.MissingVideoStreamData,
    ));

    const unvisitedTrackIds = new Set(this.#lastMarkedAt.keys());

    unvisitedTrackIds.forEach((trackId) => {
      const lastMarkedAt = this.#lastMarkedAt.get(trackId);
      if (lastMarkedAt && Date.now() - lastMarkedAt > this.#timeoutMs) {
        this.removeMarkIssue(trackId);
      }
    });

    return issues;
  }

  private detectMissingData(
    lastNInboundStats: CommonParsedInboundStreamStats[][],
    type: IssueType,
    reason: IssueReason,
  ): IssueDetectorResult {
    const issues: IssuePayload[] = [];

    const currentInboundStats = lastNInboundStats.pop()!;
    const prevInboundItemsByTrackId = MissingStreamDataDetector.mapStatsByTrackId(lastNInboundStats);

    currentInboundStats.forEach((inboundItem) => {
      const trackId = inboundItem.track.trackIdentifier;

      const prevInboundItems = prevInboundItemsByTrackId.get(trackId);

      if (!Array.isArray(prevInboundItems) || prevInboundItems.length === 0) {
        return;
      }

      if (inboundItem.track.detached || inboundItem.track.ended) {
        return;
      }

      if (MissingStreamDataDetector.isAllBytesReceivedDidntChange(inboundItem.bytesReceived, prevInboundItems)) {
        const hasIssue = this.markIssue(trackId);

        if (!hasIssue) {
          return;
        }

        const statsSample = {
          bytesReceivedDelta: 0,
          bytesReceived: inboundItem.bytesReceived,
          trackDetached: Boolean(inboundItem.track.detached),
          trackEnded: Boolean(inboundItem.track.ended),
        };

        issues.push({
          type,
          reason,
          statsSample,
          trackIdentifier: trackId,
        });
      } else {
        this.removeMarkIssue(trackId);
      }
    });

    return issues;
  }

  private static mapStatsByTrackId(
    items: CommonParsedInboundStreamStats[][],
  ): Map<string, CommonParsedInboundStreamStats[]> {
    const statsById = new Map<string, CommonParsedInboundStreamStats[]>();
    items.forEach((inboundItems) => {
      inboundItems.forEach((inbountItem) => {
        const accumulatedItems = statsById.get(inbountItem.track.trackIdentifier) || [];
        accumulatedItems.push(inbountItem);
        statsById.set(inbountItem.track.trackIdentifier, accumulatedItems);
      });
    });

    return statsById;
  }

  private static isAllBytesReceivedDidntChange(
    bytesReceived: number, inboundItems: CommonParsedInboundStreamStats[],
  ): boolean {
    for (let i = 0; i < inboundItems.length; i += 1) {
      const inboundItem = inboundItems[i];
      if (inboundItem.bytesReceived !== bytesReceived) {
        return false;
      }
    }

    return true;
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
