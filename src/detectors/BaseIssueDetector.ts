import { IssueDetector, IssueDetectorResult, WebRTCStatsParsed } from '../types';
import { scheduleTask } from '../utils/tasks';
import { CLEANUP_PREV_STATS_TTL_MS } from '../utils/constants';

export interface PrevStatsCleanupPayload {
  connectionId: string;
  cleanupCallback?: () => void;
}

export interface BaseIssueDetectorParams {
  statsCleanupTtlMs?: number;
}

abstract class BaseIssueDetector implements IssueDetector {
  readonly #lastProcessedStats: Map<string, WebRTCStatsParsed | undefined>;

  readonly #statsCleanupDelayMs: number;

  constructor(params: BaseIssueDetectorParams = {}) {
    this.#lastProcessedStats = new Map();
    this.#statsCleanupDelayMs = params.statsCleanupTtlMs ?? CLEANUP_PREV_STATS_TTL_MS;
  }

  abstract performDetection(data: WebRTCStatsParsed): IssueDetectorResult;

  detect(data: WebRTCStatsParsed): IssueDetectorResult {
    const result = this.performDetection(data);

    this.performPrevStatsCleanup({
      connectionId: data.connection.id,
    });

    return result;
  }

  protected performPrevStatsCleanup(payload: PrevStatsCleanupPayload): void {
    const { connectionId, cleanupCallback } = payload;

    if (!this.#lastProcessedStats.has(connectionId)) {
      return;
    }

    scheduleTask({
      taskId: connectionId,
      delayMs: this.#statsCleanupDelayMs,
      callback: () => {
        this.deleteLastProcessedStats(connectionId);

        if (typeof cleanupCallback === 'function') {
          cleanupCallback();
        }
      },
    });
  }

  protected setLastProcessedStats(connectionId: string, parsedStats: WebRTCStatsParsed): void {
    this.#lastProcessedStats.set(connectionId, parsedStats);
  }

  protected getLastProcessedStats(connectionId: string): WebRTCStatsParsed | undefined {
    return this.#lastProcessedStats.get(connectionId);
  }

  private deleteLastProcessedStats(connectionId: string): void {
    this.#lastProcessedStats.delete(connectionId);
  }
}

export default BaseIssueDetector;
