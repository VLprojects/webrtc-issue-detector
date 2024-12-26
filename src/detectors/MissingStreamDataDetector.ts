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
  timeoutMs?: number;
}

export default class MissingStreamDataDetector extends BaseIssueDetector {
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
    const issues: IssueDetectorResult = [];

    const prevData = this.getLastProcessedStats(data.connection.id);

    const { video: { inbound: newVideoInbound } } = data;
    const { audio: { inbound: newAudioInbound } } = data;
    const prevVideoInbound = prevData?.video.inbound;
    const prevAudioInbound = prevData?.audio.inbound;


    if (prevAudioInbound) {
      issues.push(...this.detectMissingData(
        newAudioInbound as unknown as CommonParsedInboundStreamStats[],
        prevAudioInbound as unknown as CommonParsedInboundStreamStats[],
        IssueType.Stream,
        IssueReason.MissingAudioStreamData,
      ));
    }

    if (prevVideoInbound) {
      issues.push(...this.detectMissingData(
        newVideoInbound,
        prevVideoInbound,
        IssueType.Stream,
        IssueReason.MissingVideoStreamData,
      ));
    }

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
    currentCommonInboundStats: CommonParsedInboundStreamStats[],
    previousCommonInboundStats: CommonParsedInboundStreamStats[],
    // commonStreamStats: CommonParsedInboundStreamStats[],
    type: IssueType,
    reason: IssueReason,
  ): IssueDetectorResult {
    const issues: IssuePayload[] = [];

    const mapStatsByTrackId = (items: CommonParsedInboundStreamStats[]) => new Map<string, CommonParsedInboundStreamStats>(
      items.map((item) => [item.track.trackIdentifier, item] as const),
    );

    const prevInboundItemsByTrackId = mapStatsByTrackId(previousCommonInboundStats);

    currentCommonInboundStats.forEach((inboundItem) => {
      const trackId = inboundItem.track.trackIdentifier;

      const prevInboundItem = prevInboundItemsByTrackId.get(trackId);
      if (!prevInboundItem) {
        return;
      }

      const bytesReceivedDelta = inboundItem.bytesReceived - prevInboundItem.bytesReceived;


      if (bytesReceivedDelta === 0 && !inboundItem.track.detached && !inboundItem.track.ended) {
        const hasIssue = this.markIssue(trackId);

        if (!hasIssue) {
          return;
        }

        const statsSample = {
          bytesReceivedDelta,
          bytesReceived: inboundItem.bytesReceived,
          trackDetached: inboundItem.track.detached,
          trackEnded: inboundItem.track.ended,
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
