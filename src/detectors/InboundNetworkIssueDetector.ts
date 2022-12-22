import {
  IssueDetector,
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';

class InboundNetworkIssueDetector implements IssueDetector {
  #lastProcessedStats: { [connectionId: string]: WebRTCStatsParsed | undefined } = {};

  detect(data: WebRTCStatsParsed): IssueDetectorResult {
    const issues = this.processData(data);
    this.#lastProcessedStats[data.connection.id] = data;
    return issues;
  }

  private processData(data: WebRTCStatsParsed): IssueDetectorResult {
    const issues: IssueDetectorResult = [];
    const inboundRTPStreamsStats = [...data.audio?.inbound, ...data.video?.inbound];
    if (!inboundRTPStreamsStats.length) {
      return issues;
    }

    const previousStats = this.#lastProcessedStats[data.connection.id];
    if (!previousStats) {
      return issues;
    }

    const previousInboundStreamStats = [...previousStats.video?.inbound, ...previousStats.audio?.inbound];
    const { packetsReceived } = data.connection;
    const lastPacketsReceived = previousStats.connection.packetsReceived;

    const rtpNetworkStats = inboundRTPStreamsStats.reduce((stats, currentStreamStats) => {
      const previousStreamStats = previousInboundStreamStats.find((stream) => stream.ssrc === currentStreamStats.ssrc);

      const lastJitterBufferDelay = previousStreamStats?.jitterBufferDelay || 0;
      const lastJitterBufferEmittedCount = previousStreamStats?.jitterBufferEmittedCount || 0;
      const delay = currentStreamStats.jitterBufferDelay - lastJitterBufferDelay;
      const emitted = currentStreamStats.jitterBufferEmittedCount - lastJitterBufferEmittedCount;
      const jitterBufferDelayMs = delay && emitted ? (1e3 * delay) / emitted : 0;

      return {
        sumJitter: stats.sumJitter + currentStreamStats.jitter,
        sumJitterBufferDelayMs: stats.sumJitterBufferDelayMs + jitterBufferDelayMs,
        packetsLost: stats.packetsLost + currentStreamStats.packetsLost,
        lastPacketsLost: stats.lastPacketsLost + (previousStreamStats?.packetsLost || 0),
      };
    }, {
      sumJitter: 0,
      sumJitterBufferDelayMs: 0,
      packetsLost: 0,
      lastPacketsLost: 0,
    });

    const rtt = (1e3 * data.connection.currentRoundTripTime) || 0;
    const { sumJitter, sumJitterBufferDelayMs } = rtpNetworkStats;
    const avgJitter = sumJitter / inboundRTPStreamsStats.length;
    const avgJitterBufferDelay = sumJitterBufferDelayMs / inboundRTPStreamsStats.length;

    const deltaPacketReceived = packetsReceived - lastPacketsReceived;
    const deltaPacketLost = rtpNetworkStats.packetsLost - rtpNetworkStats.lastPacketsLost;

    const packetsLoss = deltaPacketReceived && deltaPacketLost
      ? Math.round((deltaPacketLost * 100) / (deltaPacketReceived + deltaPacketLost))
      : 0;

    const isHighPacketsLoss = packetsLoss > 5;
    const isHighJitter = avgJitter >= 200;
    const isHighRTT = rtt >= 250;
    const isHighJitterBufferDelay = avgJitterBufferDelay > 500;
    const isNetworkIssue = (!isHighPacketsLoss && isHighJitter) || isHighJitter || isHighPacketsLoss;
    const isServerIssue = isHighRTT && !isHighJitter && !isHighPacketsLoss;
    const isNetworkMediaLatencyIssue = isHighPacketsLoss && isHighJitter;
    const isNetworkMediaSyncIssue = isHighJitter && isHighJitterBufferDelay;

    const debug = `packetLoss: ${packetsLoss}%, jitter: ${avgJitter}, rtt: ${rtt},`
      + ` jitterBuffer: ${avgJitterBufferDelay}ms`;

    if (isNetworkIssue) {
      issues.push({
        type: IssueType.Network,
        reason: IssueReason.InboundNetworkQuality,
        iceCandidate: data.connection.local.id,
        debug,
      });
    }

    if (isServerIssue) {
      issues.push({
        type: IssueType.Server,
        reason: IssueReason.ServerIssue,
        iceCandidate: data.connection.remote.id,
        debug,
      });
    }

    if (isNetworkMediaLatencyIssue) {
      issues.push({
        type: IssueType.Network,
        reason: IssueReason.InboundNetworkMediaLatency,
        iceCandidate: data.connection.local.id,
        debug,
      });
    }

    if (isNetworkMediaSyncIssue) {
      issues.push({
        type: IssueType.Network,
        reason: IssueReason.NetworkMediaSyncFailure,
        iceCandidate: data.connection.local.id,
        debug,
      });
    }

    return issues;
  }
}

export default InboundNetworkIssueDetector;
