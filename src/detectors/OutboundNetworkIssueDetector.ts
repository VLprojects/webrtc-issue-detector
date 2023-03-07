import {
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';
import BaseIssueDetector from './BaseIssueDetector';

class OutboundNetworkIssueDetector extends BaseIssueDetector {
  performDetection(data: WebRTCStatsParsed): IssueDetectorResult {
    const { connection: { id: connectionId } } = data;
    const issues = this.processData(data);
    this.setLastProcessedStats(connectionId, data);
    return issues;
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
    const avgJitter = sumJitter / remoteInboundRTPStreamsStats.length;

    const deltaPacketSent = packetsSent - lastPacketsSent;
    const deltaPacketLost = rtpNetworkStats.packetsLost - rtpNetworkStats.lastPacketsLost;

    const packetLossPct = deltaPacketSent && deltaPacketLost
      ? Math.round((deltaPacketLost * 100) / (deltaPacketSent + deltaPacketLost))
      : 0;

    const isHighPacketsLoss = packetLossPct > 5;
    const isHighJitter = avgJitter >= 200;
    const isNetworkMediaLatencyIssue = isHighPacketsLoss && isHighJitter;
    const isNetworkIssue = (!isHighPacketsLoss && isHighJitter) || isHighJitter || isHighPacketsLoss;

    const statsSample = {
      packetLossPct,
      avgJitter,
      rtt,
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
