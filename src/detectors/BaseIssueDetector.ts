import { IssueDetector, IssueDetectorResult, WebRTCStatsParsed } from '../types';
import { scheduleTask } from '../utils/tasks';
import { CLEANUP_PREV_STATS_TTL_MS, MAX_PARSED_STATS_STORAGE_SIZE } from '../utils/constants';

export interface PrevStatsCleanupPayload {
  connectionId: string;
  cleanupCallback?: () => void;
}

export interface BaseIssueDetectorParams {
  statsCleanupTtlMs?: number;
  maxParsedStatsStorageSize?: number;
}

abstract class BaseIssueDetector implements IssueDetector {
  readonly #parsedStatsStorage: Map<string, WebRTCStatsParsed[]> = new Map();

  readonly #statsCleanupDelayMs: number;

  readonly #maxParsedStatsStorageSize: number;

  constructor(params: BaseIssueDetectorParams = {}) {
    this.#statsCleanupDelayMs = params.statsCleanupTtlMs ?? CLEANUP_PREV_STATS_TTL_MS;
    this.#maxParsedStatsStorageSize = params.maxParsedStatsStorageSize ?? MAX_PARSED_STATS_STORAGE_SIZE;
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

    if (!this.#parsedStatsStorage.has(connectionId)) {
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
    if (!connectionId || parsedStats.connection.id !== connectionId) {
      return;
    }

    const connectionStats = this.#parsedStatsStorage.get(connectionId) ?? [];
    connectionStats.push(parsedStats);

    if (connectionStats.length > this.#maxParsedStatsStorageSize) {
      connectionStats.shift();
    }

    this.#parsedStatsStorage.set(connectionId, connectionStats);
  }

  protected getLastProcessedStats(connectionId: string): WebRTCStatsParsed | undefined {
    const connectionStats = this.#parsedStatsStorage.get(connectionId);
    return connectionStats?.[connectionStats.length - 1];
  }

  protected getAllLastProcessedStats(connectionId: string): WebRTCStatsParsed[] {
    return this.#parsedStatsStorage.get(connectionId) ?? [];
  }

  private deleteLastProcessedStats(connectionId: string): void {
    this.#parsedStatsStorage.delete(connectionId);
  }
}

export default BaseIssueDetector;
