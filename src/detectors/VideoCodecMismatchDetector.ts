import {
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';
import BaseIssueDetector, { PrevStatsCleanupPayload } from './BaseIssueDetector';

class VideoCodecMismatchDetector extends BaseIssueDetector {
  readonly UNKNOWN_DECODER = 'unknown';

  #lastDecoderWithIssue: {
    [connectionId: string]: { [ssrc: string]: string | undefined } | undefined;
  } = {};

  performDetection(data: WebRTCStatsParsed): IssueDetectorResult {
    const { connection: { id: connectionId } } = data;
    const issues = this.processData(data);
    this.lastProcessedStats[connectionId] = data;
    return issues;
  }

  protected performPrevStatsCleanup(payload: PrevStatsCleanupPayload) {
    const { connectionId, cleanupCallback } = payload;
    super.performPrevStatsCleanup({
      ...payload,
      cleanupCallback: () => {
        delete this.#lastDecoderWithIssue[connectionId];

        if (typeof cleanupCallback === 'function') {
          cleanupCallback();
        }
      },
    });
  }

  private processData(data: WebRTCStatsParsed): IssueDetectorResult {
    const issues: IssueDetectorResult = [];
    const { id: connectionId } = data.connection;
    const previousInboundRTPVideoStreamsStats = this.lastProcessedStats[connectionId]?.video.inbound;

    data.video.inbound.forEach((streamStats) => {
      const { decoderImplementation: currentDecoder, ssrc } = streamStats;
      const prevStats = previousInboundRTPVideoStreamsStats?.find((item) => item.ssrc === ssrc);

      // skipping the first iteration on purpose
      if (!prevStats) {
        return;
      }

      if (currentDecoder !== this.UNKNOWN_DECODER) {
        this.setLastDecoderWithIssue(connectionId, ssrc, undefined);
        return;
      }

      if (!this.hadLastDecoderWithIssue(connectionId, ssrc)) {
        this.setLastDecoderWithIssue(connectionId, ssrc, this.UNKNOWN_DECODER);

        issues.push({
          ssrc,
          type: IssueType.Stream,
          reason: IssueReason.VideoCodecMismatchIssue,
          trackIdentifier: streamStats.track.trackIdentifier,
          debug: `mimeType: ${streamStats.mimeType}, decoderImplementation: ${currentDecoder}`,
        });
      }
    });

    return issues;
  }

  private setLastDecoderWithIssue(connectionId: string, ssrc: number, decoder: string | undefined): void {
    const issues = this.#lastDecoderWithIssue[connectionId] ?? {};

    if (decoder === undefined) {
      delete issues[ssrc];
    } else {
      issues[ssrc] = decoder;
    }

    this.#lastDecoderWithIssue[connectionId] = issues;
  }

  private hadLastDecoderWithIssue(connectionId: string, ssrc: number): boolean {
    const issues = this.#lastDecoderWithIssue[connectionId];
    const decoder = issues && issues[ssrc];
    return decoder === this.UNKNOWN_DECODER;
  }
}

export default VideoCodecMismatchDetector;
