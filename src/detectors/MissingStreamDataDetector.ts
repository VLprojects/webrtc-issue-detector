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
  steps?: number; // number of last stats to check
}

export default class MissingStreamDataDetector extends BaseIssueDetector {
  readonly #lastMarkedAt = new Map<string, number>();

  readonly #timeoutMs: number;

  readonly #steps: number;

  constructor(params: MissingStreamDetectorParams = {}) {
    super();
    this.#timeoutMs = 5_000;
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

    const lastThreeProcessedStats = allLastProcessedStats.slice(-this.#steps);

    const lastThreeVideoInbound = lastThreeProcessedStats.map((stats) => stats.video.inbound);
    const lastThreeAudioInbound = lastThreeProcessedStats.map((stats) => stats.audio.inbound);

    issues.push(...this.detectMissingData(
      lastThreeAudioInbound as unknown as CommonParsedInboundStreamStats[][],
      IssueType.Stream,
      IssueReason.MissingAudioStreamData,
    ));

    issues.push(...this.detectMissingData(
      lastThreeVideoInbound,
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
    lastThreeInboundStats: CommonParsedInboundStreamStats[][],
    type: IssueType,
    reason: IssueReason,
  ): IssueDetectorResult {
    const issues: IssuePayload[] = [];

    const firstInboundStats = lastThreeInboundStats[0];
    const secondInboundStats = lastThreeInboundStats[1];
    const currentInboundStats = lastThreeInboundStats[2];

    const firstInboundItemsByTrackId = MissingStreamDataDetector.mapStatsByTrackId(firstInboundStats);
    const secondInboundItemsByTrackId = MissingStreamDataDetector.mapStatsByTrackId(secondInboundStats);

    currentInboundStats.forEach((inboundItem) => {
      const trackId = inboundItem.track.trackIdentifier;

      const firstInboundItem = firstInboundItemsByTrackId.get(trackId);
      const secondInboundItem = secondInboundItemsByTrackId.get(trackId);
      if (!firstInboundItem || !secondInboundItem) {
        return;
      }

      if (inboundItem.track.detached || inboundItem.track.ended) {
        return;
      }

      if (
        firstInboundItem.bytesReceived === secondInboundItem.bytesReceived
        && secondInboundItem.bytesReceived === inboundItem.bytesReceived
      ) {
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

  private static mapStatsByTrackId(items: CommonParsedInboundStreamStats[]) {
    return new Map<string, CommonParsedInboundStreamStats>(items
      .map((item) => [item.track.trackIdentifier, item] as const));
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
