import {
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';
import BaseIssueDetector, { BaseIssueDetectorParams } from './BaseIssueDetector';

interface OutboundNetworkIssueDetectorParams extends BaseIssueDetectorParams {
  highPacketLossThresholdPct?: number;
  highJitterThreshold?: number;
}

class OutboundNetworkIssueDetector extends BaseIssueDetector {
  readonly #highPacketLossThresholdPct: number;

  readonly #highJitterThreshold: number;

  constructor(params: OutboundNetworkIssueDetectorParams = {}) {
    super();
    this.#highPacketLossThresholdPct = params.highPacketLossThresholdPct ?? 5;
    this.#highJitterThreshold = params.highJitterThreshold ?? 200;
  }

  performDetection(data: WebRTCStatsParsed): IssueDetectorResult {
    return this.processData(data);
  }

  private processData(data: WebRTCStatsParsed): IssueDetectorResult {
    const issues: IssueDetectorResult = [];
    const remoteInboundRTPStreamsStats = [
      ...data.remote?.audio.inbound || [],
      ...data.remote?.video.inbound || [],
    ];

    if (!remoteInboundRTPStreamsStats.length) {
      return issues;
    }

    const previousStats = this.getLastProcessedStats(data.connection.id);
    if (!previousStats) {
      return issues;
    }

    const previousRemoteInboundRTPStreamsStats = [
      ...previousStats.remote?.audio.inbound || [],
      ...previousStats.remote?.video.inbound || [],
    ];

    const { packetsSent } = data.connection;
    const lastPacketsSent = previousStats.connection.packetsSent;

    const rtpNetworkStats = remoteInboundRTPStreamsStats.reduce((stats, currentStreamStats) => {
      const previousStreamStats = previousRemoteInboundRTPStreamsStats
        .find((stream) => stream.ssrc === currentStreamStats.ssrc);

      return {
        sumJitter: stats.sumJitter + currentStreamStats.jitter,
        packetsLost: stats.packetsLost + currentStreamStats.packetsLost,
        lastPacketsLost: stats.lastPacketsLost + (previousStreamStats?.packetsLost || 0),
      };
    }, {
      sumJitter: 0,
      packetsLost: 0,
      lastPacketsLost: 0,
    });

    const rtt = (1e3 * data.connection.currentRoundTripTime) || 0;
    const { sumJitter } = rtpNetworkStats;
    const avgJitter = (1e3 * sumJitter) / remoteInboundRTPStreamsStats.length;

    const deltaPacketSent = packetsSent - lastPacketsSent;
    const deltaPacketLost = rtpNetworkStats.packetsLost - rtpNetworkStats.lastPacketsLost;

    const packetLossPct = deltaPacketSent && deltaPacketLost
      ? Math.round((deltaPacketLost * 100) / (deltaPacketSent + deltaPacketLost))
      : 0;

    const isHighPacketsLoss = packetLossPct > this.#highPacketLossThresholdPct;
    const isHighJitter = avgJitter >= this.#highJitterThreshold;
    const isNetworkMediaLatencyIssue = isHighPacketsLoss && isHighJitter;
    const isNetworkIssue = (!isHighPacketsLoss && isHighJitter) || isHighJitter || isHighPacketsLoss;

    const statsSample = {
      rtt,
      avgJitter,
      packetLossPct,
    };

    if (isNetworkMediaLatencyIssue) {
      issues.push({
        statsSample,
        type: IssueType.Network,
        reason: IssueReason.OutboundNetworkMediaLatency,
        iceCandidate: data.connection.local.id,
      });
    }

    if (isNetworkIssue) {
      issues.push({
        statsSample,
        type: IssueType.Network,
        reason: IssueReason.OutboundNetworkQuality,
        iceCandidate: data.connection.local.id,
      });
    }

    return issues;
  }
}

export default OutboundNetworkIssueDetector;
