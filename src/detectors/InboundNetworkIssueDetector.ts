import {
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';
import BaseIssueDetector, { BaseIssueDetectorParams } from './BaseIssueDetector';

interface InboundNetworkIssueDetectorParams extends BaseIssueDetectorParams {
  highPacketLossThresholdPct?: number;
  highJitterThreshold?: number;
  highJitterBufferDelayThresholdMs?: number;
  highRttThresholdMs?: number;
}

class InboundNetworkIssueDetector extends BaseIssueDetector {
  readonly #highPacketLossThresholdPct: number;
  readonly #highJitterThreshold: number;
  readonly #highJitterBufferDelayThresholdMs: number;
  readonly #highRttThresholdMs: number;

  constructor(params: InboundNetworkIssueDetectorParams = {}) {
    super();
    this.#highPacketLossThresholdPct = params.highPacketLossThresholdPct ?? 5;
    this.#highJitterThreshold = params.highJitterThreshold ?? 200;
    this.#highJitterBufferDelayThresholdMs = params.highJitterBufferDelayThresholdMs ?? 500;
    this.#highRttThresholdMs = params.highRttThresholdMs ?? 250;
  }

  performDetection(data: WebRTCStatsParsed): IssueDetectorResult {
    const { connection: { id: connectionId } } = data;
    const issues = this.processData(data);
    this.setLastProcessedStats(connectionId, data);
    return issues;
  }

  private processData(data: WebRTCStatsParsed): IssueDetectorResult {
    const issues: IssueDetectorResult = [];
    const inboundRTPStreamsStats = [...data.audio?.inbound, ...data.video?.inbound];
    if (!inboundRTPStreamsStats.length) {
      return issues;
    }

    const previousStats = this.getLastProcessedStats(data.connection.id);
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

    const packetLossPct = deltaPacketReceived && deltaPacketLost
      ? Math.round((deltaPacketLost * 100) / (deltaPacketReceived + deltaPacketLost))
      : 0;

    const isHighPacketsLoss = packetLossPct > this.#highPacketLossThresholdPct;
    const isHighJitter = avgJitter >= this.#highJitterThreshold;
    const isHighRTT = rtt >= this.#highRttThresholdMs;
    const isHighJitterBufferDelay = avgJitterBufferDelay > this.#highJitterBufferDelayThresholdMs;
    const isNetworkIssue = isHighJitter || isHighPacketsLoss;
    const isServerIssue = isHighRTT && !isHighJitter && !isHighPacketsLoss;
    const isNetworkMediaLatencyIssue = isHighPacketsLoss && isHighJitter;
    const isNetworkMediaSyncIssue = isHighJitter && isHighJitterBufferDelay;

    const statsSample = {
      rtt,
      packetLossPct,
      avgJitter,
      avgJitterBufferDelay,
    };

    if (isNetworkIssue) {
      issues.push({
        statsSample,
        type: IssueType.Network,
        reason: IssueReason.InboundNetworkQuality,
        iceCandidate: data.connection.local.id,
      });
    }

    if (isServerIssue) {
      issues.push({
        statsSample,
        type: IssueType.Server,
        reason: IssueReason.ServerIssue,
        iceCandidate: data.connection.remote.id,
      });
    }

    if (isNetworkMediaLatencyIssue) {
      issues.push({
        statsSample,
        type: IssueType.Network,
        reason: IssueReason.InboundNetworkMediaLatency,
        iceCandidate: data.connection.local.id,
      });
    }

    if (isNetworkMediaSyncIssue) {
      issues.push({
        statsSample,
        type: IssueType.Network,
        reason: IssueReason.NetworkMediaSyncFailure,
        iceCandidate: data.connection.local.id,
      });
    }

    return issues;
  }
}

export default InboundNetworkIssueDetector;
