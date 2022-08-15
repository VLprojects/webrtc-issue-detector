/* eslint-disable class-methods-use-this */
import {
  NetworkScore,
  NetworkScores,
  NetworkScoresCalculator as INetworkScoresCalculator,
  WebRTCStatsParsed,
} from './types';

class NetworkScoresCalculator implements INetworkScoresCalculator {
  #lastProcessedStats: { [connectionId: string]: WebRTCStatsParsed } = {};

  calculate(data: WebRTCStatsParsed): NetworkScores {
    const outbound = this.calcucateOutboundScore(data);
    const inbound = this.calculateInboundScore(data);
    this.#lastProcessedStats[data.connection.id] = data;
    return { outbound, inbound };
  }

  private calcucateOutboundScore(data: WebRTCStatsParsed): NetworkScore | undefined {
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
    const avgJitter = sumJitter / remoteInboundRTPStreamsStats.length;

    const deltaPacketSent = packetsSent - lastPacketsSent;
    const deltaPacketLost = rtpNetworkStats.packetsLost - rtpNetworkStats.lastPacketsLost;

    const packetsLoss = deltaPacketSent && deltaPacketLost
      ? Math.round((deltaPacketLost * 100) / (deltaPacketSent + deltaPacketLost))
      : 0;

    return this.calculateMOS({ avgJitter, rtt, packetsLoss });
  }

  private calculateInboundScore(data: WebRTCStatsParsed): NetworkScore | undefined {
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
    const avgJitter = sumJitter / inboundRTPStreamsStats.length;

    const deltaPacketReceived = packetsReceived - lastPacketsReceived;
    const deltaPacketLost = rtpNetworkStats.packetsLost - rtpNetworkStats.lastPacketsLost;

    const packetsLoss = deltaPacketReceived && deltaPacketLost
      ? Math.round((deltaPacketLost * 100) / (deltaPacketReceived + deltaPacketLost))
      : 0;

    return this.calculateMOS({ avgJitter, rtt, packetsLoss });
  }

  private calculateMOS(
    { avgJitter, rtt, packetsLoss }:
    { avgJitter: number, rtt: number, packetsLoss: number },
  ): number {
    const effectiveLatency = rtt + (avgJitter * 2) + 10;
    let rFactor = effectiveLatency < 160
      ? 93.2 - (effectiveLatency / 40)
      : 93.2 - (effectiveLatency / 120) - 10;
    rFactor -= (packetsLoss * 2.5);
    return 1 + (0.035) * rFactor + (0.000007) * rFactor * (rFactor - 60) * (100 - rFactor);
  }
}

export default NetworkScoresCalculator;
