import faker from 'faker';
import {
  ParsedConnectionStats,
  ParsedInboundAudioStreamStats,
  ParsedInboundVideoStreamStats,
  ParsedOutboundAudioStreamStats,
  ParsedOutboundVideoStreamStats, ParsedRemoteInboundStreamStats, ParsedRemoteOutboundStreamStats,
  StatsReportItem,
} from '../../src/types';

interface CreatePeerConnectionTestPayload {
  iceConnectionState?: RTCIceConnectionState,
  connectionState?: RTCPeerConnectionState,
}

interface CreateStatsReportItemTestPayload {
  id?: string;
  timeTaken?: number;
  connectionStats?: Partial<ParsedConnectionStats>;
  audioInboundStats?: Partial<ParsedInboundAudioStreamStats>[];
  audioOutboundStats?: Partial<ParsedOutboundAudioStreamStats>[];
  videoInboundStats?: Partial<ParsedInboundVideoStreamStats>[];
  videoOutboundStats?: Partial<ParsedOutboundVideoStreamStats>[];
  remoteAudioInboundStats?: Partial<ParsedRemoteInboundStreamStats>[];
  remoteAudioOutboundStats?: Partial<ParsedRemoteOutboundStreamStats>[];
  remoteVideoInboundStats?: Partial<ParsedRemoteInboundStreamStats>[];
  remoteVideoOutboundStats?: Partial<ParsedRemoteOutboundStreamStats>[];
}

export const createPeerConnectionFake = (payload: CreatePeerConnectionTestPayload = {}): RTCPeerConnection => {
  const originalConnection = {
    iceConnectionState: payload.iceConnectionState ?? 'connected',
    connectionState: payload.connectionState ?? 'connected',
  } as RTCPeerConnection;

  return {
    testPcId: faker.datatype.uuid(), // just to distinguish PCs in tests
    ...originalConnection,
  } as unknown as RTCPeerConnection;
};

export const createStatsReportItem = (payload: CreateStatsReportItemTestPayload = {}): StatsReportItem => ({
  id: payload.id ?? faker.datatype.uuid(),
  timeTaken: payload.timeTaken ?? faker.datatype.number({ min: 1 }),
  stats: {
    connection: {
      ...payload.connectionStats ?? {},
    } as ParsedConnectionStats,
    audio: {
      inbound: [...(payload.audioInboundStats ?? []) as ParsedInboundAudioStreamStats[]],
      outbound: [...(payload.audioOutboundStats ?? []) as ParsedOutboundAudioStreamStats[]],
    },
    video: {
      inbound: [...(payload.videoInboundStats ?? []) as ParsedInboundVideoStreamStats[]],
      outbound: [...(payload.videoOutboundStats ?? []) as ParsedOutboundVideoStreamStats[]],
    },
    remote: {
      audio: {
        inbound: [...(payload.remoteAudioInboundStats ?? []) as ParsedRemoteInboundStreamStats[]],
        outbound: [...(payload.remoteAudioOutboundStats ?? []) as ParsedRemoteOutboundStreamStats[]],
      },
      video: {
        inbound: [...(payload.remoteVideoInboundStats ?? []) as ParsedRemoteInboundStreamStats[]],
        outbound: [...(payload.remoteVideoOutboundStats ?? []) as ParsedRemoteOutboundStreamStats[]],
      },
    },
  },
});
