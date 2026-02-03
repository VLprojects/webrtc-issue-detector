/* eslint-disable class-methods-use-this */
import {
  NetworkScore,
  NetworkScores,
  INetworkScoresCalculator,
  WebRTCStatsParsed,
  NetworkQualityStatsSample,
} from './types';
import { scheduleTask } from './utils/tasks';
import { CLEANUP_PREV_STATS_TTL_MS } from './utils/constants';

type MosCalculatorResult = {
  mos: NetworkScore,
  stats: NetworkQualityStatsSample,
};

class NetworkScoresCalculator implements INetworkScoresCalculator {
  #lastProcessedStats: { [connectionId: string]: WebRTCStatsParsed } = {};

  calculate(data: WebRTCStatsParsed): NetworkScores {
    const { connection: { id: connectionId } } = data;
    const { mos: outbound, stats: outboundStatsSample } = this.calculateOutboundScore(data) || {};
    const { mos: inbound, stats: inboundStatsSample } = this.calculateInboundScore(data) || {};
    this.#lastProcessedStats[connectionId] = data;

    scheduleTask({
      taskId: connectionId,
      delayMs: CLEANUP_PREV_STATS_TTL_MS,
      callback: () => (delete this.#lastProcessedStats[connectionId]),
    });

    return {
      outbound,
      inbound,
      connectionId,
      statsSamples: {
        inboundStatsSample,
        outboundStatsSample,
      },
    };
  }

  private calculateOutboundScore(data: WebRTCStatsParsed): MosCalculatorResult | undefined {
    const remoteInboundRTPStreamsStats = [
      ...data.remote?.audio.inbound || [],
      ...data.remote?.video.inbound || [],
    ];

    if (!remoteInboundRTPStreamsStats.length) {
      return undefined;
    }

    const previousStats = this.#lastProcessedStats[data.connection.id];
    if (!previousStats) {
      return undefined;
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
    const avgJitter = (sumJitter / remoteInboundRTPStreamsStats.length) * 1e3;

    const deltaPacketSent = packetsSent - lastPacketsSent;
    const deltaPacketLost = rtpNetworkStats.packetsLost - rtpNetworkStats.lastPacketsLost;

    const packetsLoss = deltaPacketSent && deltaPacketLost
      ? Math.round((deltaPacketLost * 100) / (deltaPacketSent + deltaPacketLost))
      : 0;

    const mos = this.calculateMOS({ avgJitter, rtt, packetsLoss });
    return {
      mos,
      stats: { avgJitter, rtt, packetsLoss },
    };
  }

  private calculateInboundScore(data: WebRTCStatsParsed): MosCalculatorResult | undefined {
    const inboundRTPStreamsStats = [...data.audio?.inbound, ...data.video?.inbound];
    if (!inboundRTPStreamsStats.length) {
      return undefined;
    }

    const previousStats = this.#lastProcessedStats[data.connection.id];
    if (!previousStats) {
      return undefined;
    }

    const previousInboundStreamStats = [...previousStats.video?.inbound, ...previousStats.audio?.inbound];
    const { packetsReceived } = data.connection;
    const lastPacketsReceived = previousStats.connection.packetsReceived;

    const rtpNetworkStats = inboundRTPStreamsStats.reduce((stats, currentStreamStats) => {
      const previousStreamStats = previousInboundStreamStats.find((stream) => stream.ssrc === currentStreamStats.ssrc);
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
    const avgJitter = (sumJitter / inboundRTPStreamsStats.length) * 1e3;

    const deltaPacketReceived = packetsReceived - lastPacketsReceived;
    const deltaPacketLost = rtpNetworkStats.packetsLost - rtpNetworkStats.lastPacketsLost;

    const packetsLoss = deltaPacketReceived && deltaPacketLost
      ? Math.round((deltaPacketLost * 100) / (deltaPacketReceived + deltaPacketLost))
      : 0;

    const mos = this.calculateMOS({ avgJitter, rtt, packetsLoss });
    return {
      mos,
      stats: { avgJitter, rtt, packetsLoss },
    };
  }

  private calculateMOS(
    { avgJitter, rtt, packetsLoss }:
    { avgJitter: number, rtt: number, packetsLoss: number },
  ): number {
    const effectiveLatency = (rtt + avgJitter) * 2 + 10;
    let rFactor = effectiveLatency < 160
      ? 93.2 - (effectiveLatency / 40)
      : 93.2 - (effectiveLatency / 120) / 10;
    rFactor -= (packetsLoss * 2.5);
    return 1 + (0.035) * rFactor + (0.000007) * rFactor * (rFactor - 60) * (100 - rFactor);
  }
}

export default NetworkScoresCalculator;
