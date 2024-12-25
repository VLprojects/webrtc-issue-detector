import {
  CommonParsedInboundStreamStats,
  IssueDetectorResult,
  IssuePayload,
  IssueReason,
  IssueType,
  WebRTCStatsParsed
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
    this.#timeoutMs = params.timeoutMs ?? 5_000;
  }

  performDetection(data: WebRTCStatsParsed): IssueDetectorResult {
    const { connection: { id: connectionId } } = data;
    const issues = this.processData(data);
    this.setLastProcessedStats(connectionId, data);
    return issues;
  }

  private processData(data: WebRTCStatsParsed): IssueDetectorResult {
    const issues: IssueDetectorResult = [];

    const { video: { inbound: newVideoInbound } } = data;
    const { audio: { inbound: newAudioInbound } } = data;

    issues.push(...this.detectMissingData(
      newAudioInbound as unknown as CommonParsedInboundStreamStats[],
      IssueType.Stream,
      IssueReason.MissingAudioStreamData,
    ));
    issues.push(...this.detectMissingData(
      newVideoInbound,
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

  private detectMissingData(commonStreamStats: CommonParsedInboundStreamStats[], type: IssueType, reason: IssueReason): IssueDetectorResult {
    const issues: IssuePayload[] = [];

    commonStreamStats.forEach((inboundItem) => {
      const trackId = inboundItem.track.trackIdentifier

      if (inboundItem.bytesReceived === 0 && !inboundItem.track.detached && !inboundItem.track.ended) {
        const hasIssue = this.markIssue(trackId);

        if (!hasIssue) {
          return;
        }

        const statsSample = {
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

    return issues
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

