import {
  IssueDetector,
  IssueDetectorResult,
  NetworkScores,
  WebRTCStatsParsed,
  WebRTCStatsParsedWithNetworkScores,
} from '../types';
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
  readonly #parsedStatsStorage: Map<string, WebRTCStatsParsedWithNetworkScores[]> = new Map();

  readonly #statsCleanupDelayMs: number;

  readonly #maxParsedStatsStorageSize: number;

  constructor(params: BaseIssueDetectorParams = {}) {
    this.#statsCleanupDelayMs = params.statsCleanupTtlMs ?? CLEANUP_PREV_STATS_TTL_MS;
    this.#maxParsedStatsStorageSize = params.maxParsedStatsStorageSize ?? MAX_PARSED_STATS_STORAGE_SIZE;
  }

  abstract performDetection(data: WebRTCStatsParsedWithNetworkScores): IssueDetectorResult;

  detect(data: WebRTCStatsParsed, networkScores?: NetworkScores): IssueDetectorResult {
    const parsedStatsWithNetworkScores = {
      ...data,
      networkScores: {
        ...networkScores,
        statsSamples: networkScores?.statsSamples || {},
      },
    };
    const result = this.performDetection(parsedStatsWithNetworkScores);

    this.setLastProcessedStats(data.connection.id, parsedStatsWithNetworkScores);
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

  protected setLastProcessedStats(connectionId: string, parsedStats: WebRTCStatsParsedWithNetworkScores): void {
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

  protected getLastProcessedStats(connectionId: string): WebRTCStatsParsedWithNetworkScores | undefined {
    const connectionStats = this.#parsedStatsStorage.get(connectionId);
    return connectionStats?.[connectionStats.length - 1];
  }

  protected getAllLastProcessedStats(connectionId: string): WebRTCStatsParsedWithNetworkScores[] {
    return this.#parsedStatsStorage.get(connectionId) ?? [];
  }

  protected deleteLastProcessedStats(connectionId: string): void {
    this.#parsedStatsStorage.delete(connectionId);
  }
}

export default BaseIssueDetector;
