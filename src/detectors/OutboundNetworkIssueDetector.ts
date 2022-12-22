import {
  IssueDetector,
  IssueDetectorResult,
  IssueReason,
  IssueType,
  WebRTCStatsParsed,
} from '../types';
import { scheduleTask } from '../utils/tasks';
import { CLEANUP_PREV_STATS_TTL_MS } from '../utils/constants';

class OutboundNetworkIssueDetector implements IssueDetector {
  #lastProcessedStats: { [connectionId: string]: WebRTCStatsParsed | undefined } = {};

  detect(data: WebRTCStatsParsed): IssueDetectorResult {
    const { connection: { id: connectionId } } = data;
    const issues = this.processData(data);
    this.#lastProcessedStats[connectionId] = data;

    scheduleTask({
      taskId: connectionId,
      delayMs: CLEANUP_PREV_STATS_TTL_MS,
      callback: () => (delete this.#lastProcessedStats[connectionId]),
    });

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

    const previousStats = this.#lastProcessedStats[data.connection.id];
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

    const packetsLoss = deltaPacketSent && deltaPacketLost
      ? Math.round((deltaPacketLost * 100) / (deltaPacketSent + deltaPacketLost))
      : 0;

    const isHighPacketsLoss = packetsLoss > 5;
    const isHighJitter = avgJitter >= 200;
    const isNetworkMediaLatencyIssue = isHighPacketsLoss && isHighJitter;
    const isNetworkIssue = (!isHighPacketsLoss && isHighJitter) || isHighJitter || isHighPacketsLoss;
    const debug = `packetLoss: ${packetsLoss}%, jitter: ${avgJitter}, rtt: ${rtt}`;

    if (isNetworkMediaLatencyIssue) {
      issues.push({
        type: IssueType.Network,
        reason: IssueReason.OutboundNetworkMediaLatency,
        iceCandidate: data.connection.local.id,
        debug,
      });
    }

    if (isNetworkIssue) {
      issues.push({
        type: IssueType.Network,
        reason: IssueReason.OutboundNetworkQuality,
        iceCandidate: data.connection.local.id,
        debug,
      });
    }

    return issues;
  }
}

export default OutboundNetworkIssueDetector;
