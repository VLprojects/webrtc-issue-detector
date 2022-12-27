/* eslint-disable class-methods-use-this */
/* eslint-disable no-param-reassign */
import {
  ConnectionInfo,
  ParsedConnectionStats,
  ParsedInboundAudioStreamStats,
  ParsedInboundVideoStreamStats,
  ParsedOutboundAudioStreamStats,
  ParsedOutboundVideoStreamStats,
  ParsedRemoteInboundStreamStats,
  ParsedRemoteOutboundStreamStats,
  RemoteParsedStats, StatsParser,
  StatsReportItem,
  WebRTCStatsParsed,
  Logger,
} from '../types';
import { checkIsConnectionClosed, calcBitrate } from './utils';
import { scheduleTask } from '../utils/tasks';
import { CLEANUP_PREV_STATS_TTL_MS } from '../utils/constants';

interface PrevStatsItem {
  stats: WebRTCStatsParsed;
  ts: number;
}

interface WebRTCStatsParserParams {
  logger: Logger;
}

class RTCStatsParser implements StatsParser {
  private readonly prevStats = new Map<string, PrevStatsItem | undefined>();

  private readonly allowedReportTypes: Set<RTCStatsType> = new Set<RTCStatsType>([
    'candidate-pair',
    'inbound-rtp',
    'outbound-rtp',
    'remote-outbound-rtp',
    'remote-inbound-rtp',
    'track',
    'transport',
  ]);

  private readonly logger: Logger;

  constructor(params: WebRTCStatsParserParams) {
    this.logger = params.logger;
  }

  get previouslyParsedStatsConnectionsIds(): string[] {
    return [...this.prevStats.keys()];
  }

  async parse(connection: ConnectionInfo): Promise<StatsReportItem | undefined> {
    if (checkIsConnectionClosed(connection.pc)) {
      this.logger.debug('Skip stats parsing. Connection is closed.', { connection });
      return undefined;
    }

    return this.getConnectionStats(connection);
  }

  private async getConnectionStats(info: ConnectionInfo): Promise<StatsReportItem | undefined> {
    const { pc, id } = info;

    try {
      const beforeGetStats = Date.now();
      const receiversStats = await Promise.all(pc.getReceivers().map((r) => r.getStats()));
      const sendersStats = await Promise.all(pc.getSenders().map((r) => r.getStats()));
      const stats = this.mapReportsStats([...receiversStats, ...sendersStats], info);

      return {
        id,
        stats,
        timeTaken: Date.now() - beforeGetStats,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to get stats for PC', { id, pc, error });
      return undefined;
    }
  }

  private mapReportsStats(reports: RTCStatsReport[], connectionData: ConnectionInfo): WebRTCStatsParsed {
    const mappedStats: WebRTCStatsParsed = {
      audio: {
        inbound: [],
        outbound: [],
      },
      video: {
        inbound: [],
        outbound: [],
      },
      connection: {} as ParsedConnectionStats,
      remote: {
        video: {
          inbound: [],
          outbound: [],
        },
        audio: {
          inbound: [],
          outbound: [],
        },
      },
    };

    reports.forEach((rtcStats: RTCStatsReport) => {
      rtcStats.forEach((reportItem: Record<string, unknown>) => {
        if (!this.allowedReportTypes.has(reportItem.type as RTCStatsType)) {
          return;
        }

        this.updateMappedStatsWithReportItemData(reportItem, mappedStats, rtcStats);
      });
    });

    const { id: connectionId } = connectionData;
    const prevStatsData = this.prevStats.get(connectionId);

    if (prevStatsData) {
      this.propagateStatsWithRateValues(mappedStats, prevStatsData.stats);
    }

    this.prevStats.set(connectionId, {
      stats: mappedStats,
      ts: Date.now(),
    });

    scheduleTask({
      taskId: connectionId,
      delayMs: CLEANUP_PREV_STATS_TTL_MS,
      callback: () => (this.prevStats.delete(connectionId)),
    });

    return mappedStats;
  }

  private updateMappedStatsWithReportItemData(
    statsItem: Record<string, unknown>,
    mappedStats: WebRTCStatsParsed,
    stats: RTCStatsReport,
  ): void {
    const type = statsItem.type as RTCStatsType;

    if (type === 'candidate-pair' && statsItem.state === 'succeeded' && statsItem.nominated) {
      mappedStats.connection = this.prepareConnectionStats(statsItem, stats);
      return;
    }

    const mediaType = this.getMediaType(statsItem);
    if (!mediaType) {
      return;
    }

    if (type === 'outbound-rtp') {
      const trackInfo = stats.get(statsItem.trackId as string)
        || stats.get(statsItem.mediaSourceId as string) || {};

      const statsToAdd = {
        ...statsItem,
        track: { ...trackInfo },
      };

      if (mediaType === 'audio') {
        mappedStats[mediaType].outbound.push(statsToAdd as ParsedOutboundAudioStreamStats);
      } else {
        mappedStats[mediaType].outbound.push(statsToAdd as ParsedOutboundVideoStreamStats);
      }
      return;
    }

    if (type === 'inbound-rtp') {
      const trackInfo = stats.get(statsItem.trackId as string)
        || stats.get(statsItem.mediaSourceId as string) || {};

      this.mapConnectionStatsIfNecessary(mappedStats, statsItem, stats);

      const statsToAdd = {
        ...statsItem,
        track: { ...trackInfo },
      };

      if (mediaType === 'audio') {
        mappedStats[mediaType].inbound.push(statsToAdd as ParsedInboundAudioStreamStats);
      } else {
        mappedStats[mediaType].inbound.push(statsToAdd as ParsedInboundVideoStreamStats);
      }
      return;
    }

    if (type === 'remote-outbound-rtp') {
      (mappedStats.remote as RemoteParsedStats)[mediaType].outbound
        .push({ ...statsItem } as ParsedRemoteOutboundStreamStats);
      return;
    }

    if (type === 'remote-inbound-rtp') {
      this.mapConnectionStatsIfNecessary(mappedStats, statsItem, stats);

      (mappedStats.remote as RemoteParsedStats)[mediaType].inbound
        .push({ ...statsItem } as ParsedRemoteInboundStreamStats);
    }
  }

  private getMediaType(reportItem: Record<string, unknown>): 'audio' | 'video' | undefined {
    const mediaType = (reportItem.mediaType || reportItem.kind) as 'audio' | 'video';

    if (!['audio', 'video'].includes(mediaType)) {
      const { id: reportId } = reportItem;

      if (!reportId) {
        return undefined;
      }

      // Check for Safari browser as it does not have kind and mediaType props
      if (String(reportId).includes('Video')) {
        return 'video';
      }

      if (String(reportId).includes('Audio')) {
        return 'audio';
      }

      return undefined;
    }

    return mediaType;
  }

  private propagateStatsWithRateValues(newStats: WebRTCStatsParsed, prevStats: WebRTCStatsParsed) {
    newStats.audio.inbound.forEach((report) => {
      const prev = prevStats.audio.inbound.find(({ id }) => id === report.id);
      report.bitrate = calcBitrate(report, prev, 'bytesReceived');
      report.packetRate = calcBitrate(report, prev, 'packetsReceived');
    });

    newStats.audio.outbound.forEach((report) => {
      const prev = prevStats.audio.outbound.find(({ id }) => id === report.id);
      report.bitrate = calcBitrate(report, prev, 'bytesSent');
      report.packetRate = calcBitrate(report, prev, 'packetsSent');
    });

    newStats.video.inbound.forEach((report) => {
      const prev = prevStats.video.inbound.find(({ id }) => id === report.id);
      report.bitrate = calcBitrate(report, prev, 'bytesReceived');
      report.packetRate = calcBitrate(report, prev, 'packetsReceived');
    });

    newStats.video.outbound.forEach((report) => {
      const prev = prevStats.video.outbound.find(({ id }) => id === report.id);
      report.bitrate = calcBitrate(report, prev, 'bytesSent');
      report.packetRate = calcBitrate(report, prev, 'packetsSent');
    });
  }

  private mapConnectionStatsIfNecessary(
    mappedStats: WebRTCStatsParsed,
    statsItem: Record<string, unknown>,
    stats: RTCStatsReport,
  ) {
    if (mappedStats.connection.id || !statsItem.transportId) {
      return;
    }

    const transportStats = stats.get(statsItem.transportId as string);

    if (transportStats && transportStats.selectedCandidatePairId) {
      const candidatePair = stats.get(transportStats.selectedCandidatePairId);
      mappedStats.connection = this.prepareConnectionStats(candidatePair, stats);
    }
  }

  private prepareConnectionStats(candidatePair: Record<string, unknown>, stats: RTCStatsReport): ParsedConnectionStats {
    if (!(candidatePair && stats)) {
      return {} as ParsedConnectionStats;
    }

    const connectionStats = { ...candidatePair };

    if (connectionStats.remoteCandidateId) {
      const candidate = stats.get(connectionStats.remoteCandidateId as string);
      connectionStats.remote = { ...candidate };
    }

    if (connectionStats.localCandidateId) {
      const candidate = stats.get(connectionStats.localCandidateId as string);
      connectionStats.local = { ...candidate };
    }

    return connectionStats as ParsedConnectionStats;
  }
}

export default RTCStatsParser;
