import faker from 'faker';
import {
  ParsedConnectionStats,
  ParsedInboundAudioStreamStats,
  ParsedInboundVideoStreamStats,
  ParsedOutboundAudioStreamStats,
  ParsedOutboundVideoStreamStats,
  ParsedRemoteInboundStreamStats,
  ParsedRemoteOutboundStreamStats,
  StatsReportItem,
} from '../../src';

export type CreatePeerConnectionTestPayload = Partial<RTCPeerConnection>;

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

const stubFn = (): any => {};

export const createPeerConnectionFake = (payload: CreatePeerConnectionTestPayload = {}): RTCPeerConnection => {
  const pc: RTCPeerConnection = {
    canTrickleIceCandidates: payload.canTrickleIceCandidates ?? null,
    connectionState: payload.connectionState ?? 'connected',
    currentLocalDescription: payload.currentLocalDescription ?? null,
    currentRemoteDescription: payload.currentRemoteDescription ?? null,
    iceConnectionState: payload.iceConnectionState ?? 'connected',
    iceGatheringState: payload.iceGatheringState ?? 'complete',
    localDescription: payload.localDescription ?? null,
    pendingLocalDescription: payload.pendingLocalDescription ?? null,
    pendingRemoteDescription: payload.pendingRemoteDescription ?? null,
    remoteDescription: payload.remoteDescription ?? null,
    sctp: payload.sctp ?? null,
    signalingState: payload.signalingState ?? 'stable',
    onconnectionstatechange: payload.onconnectionstatechange ?? null,
    ondatachannel: payload.ondatachannel ?? null,
    onicecandidate: payload.onicecandidate ?? null,
    onicecandidateerror: payload.onicecandidateerror ?? null,
    oniceconnectionstatechange: payload.oniceconnectionstatechange ?? null,
    onicegatheringstatechange: payload.onicegatheringstatechange ?? null,
    onnegotiationneeded: payload.onnegotiationneeded ?? null,
    onsignalingstatechange: payload.onsignalingstatechange ?? null,
    ontrack: payload.ontrack ?? null,
    addIceCandidate: payload.addIceCandidate ?? stubFn,
    addTrack: payload.addTrack ?? stubFn,
    addTransceiver: payload.addTransceiver ?? stubFn,
    close: payload.close ?? stubFn,
    createAnswer: payload.createAnswer ?? stubFn,
    createDataChannel: payload.createDataChannel ?? stubFn,
    createOffer: payload.createOffer ?? stubFn,
    getConfiguration: payload.getConfiguration ?? stubFn,
    getReceivers: payload.getReceivers ?? stubFn,
    getSenders: payload.getSenders ?? stubFn,
    getStats: payload.getStats ?? stubFn,
    getTransceivers: payload.getTransceivers ?? stubFn,
    removeTrack: payload.removeTrack ?? stubFn,
    restartIce: payload.restartIce ?? stubFn,
    setConfiguration: payload.setConfiguration ?? stubFn,
    setLocalDescription: payload.setLocalDescription ?? stubFn,
    setRemoteDescription: payload.setRemoteDescription ?? stubFn,
    addEventListener: payload.addEventListener ?? stubFn,
    removeEventListener: payload.removeEventListener ?? stubFn,
    dispatchEvent: payload.dispatchEvent ?? stubFn,
  };

  (pc as unknown as { testPcId: string }).testPcId = faker.datatype.uuid();

  return pc;
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
