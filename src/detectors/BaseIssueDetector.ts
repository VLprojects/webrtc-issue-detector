import { IssueDetector, IssueDetectorResult, WebRTCStatsParsed } from '../types';
import { scheduleTask } from '../utils/tasks';
import { CLEANUP_PREV_STATS_TTL_MS } from '../utils/constants';

export interface PrevStatsCleanupPayload {
  connectionId: string;
  cleanupCallback?: () => void;
}

interface BaseIssueDetectorParams {
  statsCleanupTtlMs?: number;
}

abstract class BaseIssueDetector implements IssueDetector {
  protected readonly lastProcessedStats: {
    [connectionId: string]: WebRTCStatsParsed | undefined;
  } = {};

  readonly #statsCleanupDelayMs: number;

  constructor(params: BaseIssueDetectorParams = {}) {
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

    if (!this.lastProcessedStats[connectionId]) {
      return;
    }

    scheduleTask({
      taskId: connectionId,
      delayMs: this.#statsCleanupDelayMs,
      callback: () => {
        delete this.lastProcessedStats[connectionId];

        if (typeof cleanupCallback === 'function') {
          cleanupCallback();
        }
      },
    });
  }
}

export default BaseIssueDetector;
