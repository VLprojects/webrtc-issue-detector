import PeriodicWebRTCStatsReporter from './parser/PeriodicWebRTCStatsReporter';
import { AddConnectionPayload } from './parser/CompositeRTCStatsParser';
import { WebRTCIssueEmitter } from './WebRTCIssueEmitter';

export interface WIDWindow {
  wid: {
    handleNewPeerConnection(pc: RTCPeerConnection): void;
  },
}

export type IssueDetectorResult = IssuePayload[];

export interface IssueDetector {
  detect(data: WebRTCStatsParsed): IssueDetectorResult;
}

export interface INetworkScoresCalculator {
  calculate(data: WebRTCStatsParsed): NetworkScores;
}

export enum EventType {
  Issue = 'issue',
  NetworkScoresUpdated = 'network-scores-updated',
  StatsParsingFinished = 'stats-parsing-finished',
}

export type EventPayload = IssueDetectorResult;

export interface StatsReportItem {
  id: string;
  stats: WebRTCStatsParsed;
  timeTaken: number;
}

export interface ConnectionInfo {
  id: string;
  pc: RTCPeerConnection;
}

export interface CompositeStatsParser {
  addPeerConnection: (payload: AddConnectionPayload) => void;
  parse: () => Promise<StatsReportItem[]>;
}

export interface StatsParser {
  parse: (info: ConnectionInfo) => Promise<StatsReportItem | undefined>;
}

export type WebRTCIssueDetectorConstructorParams = {
  issueEmitter?: WebRTCIssueEmitter;
  networkScoresCalculator?: INetworkScoresCalculator,
  detectors?: IssueDetector[],
  compositeStatsParser?: CompositeStatsParser,
  statsReporter?: PeriodicWebRTCStatsReporter,
  logger?: Logger,
  onIssues?: (payload: IssueDetectorResult) => void,
  onNetworkScoresUpdated?: (payload: NetworkScores) => void,
  ignoreSSRCList?: number[],
  getStatsInterval?: number,
  autoAddPeerConnections?: boolean,
};

export enum IssueType {
  Network = 'network',
  CPU = 'cpu',
  Server = 'server',
  Stream = 'stream',
}

export enum IssueReason {
  OutboundNetworkQuality = 'outbound-network-quality',
  InboundNetworkQuality = 'inbound-network-quality',
  OutboundNetworkMediaLatency = 'outbound-network-media-latency',
  InboundNetworkMediaLatency = 'inbound-network-media-latency',
  NetworkMediaSyncFailure = 'network-media-sync-failure',
  OutboundNetworkThroughput = 'outbound-network-throughput',
  InboundNetworkThroughput = 'inbound-network-throughput',
  EncoderCPUThrottling = 'encoder-cpu-throttling',
  DecoderCPUThrottling = 'decoder-cpu-throttling',
  ServerIssue = 'server-issue',
  UnknownVideoDecoderIssue = 'unknown-video-decoder',
  LowInboundMOS = 'low-inbound-mean-opinion-score',
  LowOutboundMOS = 'low-outbound-mean-opinion-score',
}

export type IssuePayload = {
  type: IssueType;
  reason: IssueReason;
  ssrc?: number;
  iceCandidate?: string;
  data?: number;
  statsSample?: Record<string, unknown>;
  trackIdentifier?: string;
};

export type DetectIssuesPayload = {
  data: WebRTCStatsParsed,
};

export type NetworkScore = number;

export type NetworkQualityStatsSample = {
  avgJitter: number;
  rtt: number;
  packetsLoss: number;
};

export type NetworkScores = {
  outbound?: NetworkScore,
  inbound?: NetworkScore,
  statsSamples: {
    outboundStatsSample?: NetworkQualityStatsSample,
    inboundStatsSample?: NetworkQualityStatsSample,
  },
};

export type StatsParsingFinishedPayload = {
  timeTaken: number;
  ts: number;
};

export type ParsedInboundAudioStreamStats = {
  audioLevel: number,
  bitrate: number,
  bytesReceived: number,
  clockRate: number,
  codecId: string,
  concealedSamples: number,
  concealmentEvents: number,
  fecPacketsDiscarded: number,
  fecPacketsReceived: number,
  headerBytesReceived: number,
  id: string,
  insertedSamplesForDeceleration: number,
  jitter: number,
  jitterBufferDelay: number,
  jitterBufferEmittedCount: number,
  kind: 'audio',
  lastPacketReceivedTimestamp: number,
  mediaType: string,
  mimeType: string,
  packetRate: number,
  packetsDiscarded: number,
  packetsLost: number,
  packetsReceived: number,
  payloadType: number,
  remoteId: string,
  removedSamplesForAcceleration: number,
  silentConcealedSamples: number,
  ssrc: number,
  timestamp: number,
  totalAudioEnergy: number,
  totalSamplesDuration: number,
  totalSamplesReceived: number,
  track: {
    audioLevel: number,
    concealedSamples: number,
    concealmentEvents: number,
    detached: boolean,
    ended: boolean,
    id: string,
    insertedSamplesForDeceleration: number,
    jitterBufferDelay: number,
    jitterBufferEmittedCount: number,
    kind: 'audio',
    remoteSource: boolean,
    removedSamplesForAcceleration: number,
    silentConcealedSamples: number,
    timestamp: number,
    totalAudioEnergy: number,
    totalSamplesDuration: number,
    totalSamplesReceived: number,
    trackIdentifier: string,
    type: string,
  },
  trackId: string,
  transportId: string,
};

export type ParsedOutboundAudioStreamStats = {
  bitrate: number,
  bytesSent: number,
  clockRate: number,
  codecId: string,
  headerBytesSent: number,
  id: string,
  kind: string,
  mediaSourceId: string,
  mediaType: string,
  mimeType: string,
  nackCount: number,
  packetRate: number,
  packetsSent: number,
  payloadType: number,
  remoteId: string,
  retransmittedBytesSent: number,
  retransmittedPacketsSent: number,
  ssrc: number,
  timestamp: number,
  targetBitrate: number,
  track: {
    audioLevel: number,
    echoReturnLoss: number,
    echoReturnLossEnhancement: number,
    id: string,
    kind: string,
    timestamp: number,
    totalAudioEnergy: number,
    totalSamplesDuration: number,
    trackIdentifier: string,
    type: string,
  }
  trackId: string,
  transportId: string,
};

export type ParsedInboundVideoStreamStats = {
  bitrate: number,
  bytesReceived: number,
  clockRate: number,
  codecId: string,
  decoderImplementation: string,
  firCount: number,
  frameHeight: number,
  frameWidth: number,
  framesDecoded: number,
  framesDropped: number,
  framesPerSecond: number,
  framesReceived: number,
  headerBytesReceived: number,
  id: string,
  jitter: number,
  jitterBufferDelay: number,
  jitterBufferEmittedCount: number,
  keyFramesDecoded: number,
  kind: 'video',
  mediaType: string,
  mimeType: string,
  nackCount: number,
  packetRate: number,
  packetsLost: number,
  packetsReceived: number,
  payloadType: number,
  pliCount: number,
  ssrc: number,
  timestamp: number,
  totalDecodeTime: number,
  totalInterFrameDelay: number,
  totalSquaredInterFrameDelay: number,
  track: {
    detached: boolean,
    ended: boolean,
    frameHeight: number,
    frameWidth: number,
    framesDecoded: number,
    framesDropped: number,
    framesReceived: number,
    id: string,
    jitterBufferDelay: number,
    jitterBufferEmittedCount: number,
    kind: 'video',
    remoteSource: boolean,
    timestamp: number,
    trackIdentifier: string,
    type: string,
  }
  trackId: string,
  transportId: string,
};

export type ParsedOutboundVideoStreamStats = {
  bitrate: number,
  bytesSent: number,
  clockRate: number,
  codecId: string,
  encoderImplementation: string,
  firCount: number,
  frameHeight: number,
  frameWidth: number,
  framesEncoded: number,
  framesPerSecond: number,
  framesSent: number,
  headerBytesSent: number,
  hugeFramesSent: number,
  id: string,
  keyFramesEncoded: number,
  kind: string,
  mediaSourceId: string,
  mediaType: string,
  mimeType: string,
  nackCount: number,
  packetRate: number,
  packetsSent: number,
  payloadType: number,
  pliCount: number,
  qpSum: number,
  qualityLimitationDurations: {
    other: number,
    cpu: number,
    bandwidth: number,
    none: number,
  },
  qualityLimitationReason: 'none' | 'bandwidth' | 'cpu' | 'other',
  qualityLimitationResolutionChanges: number,
  remoteId: string,
  retransmittedBytesSent: number,
  retransmittedPacketsSent: number,
  rid: string,
  ssrc: number,
  timestamp: number,
  totalEncodeTime: number,
  totalEncodedBytesTarget: number,
  totalPacketSendDelay: number,
  track: {
    id: string,
    frames: number,
    framesPerSecond: number,
    height: number,
    timestamp: number,
    type: string,
    trackIdentifier: string,
    kind: string,
    width: number,
  }
  trackId: string,
  transportId: string,
  type: string,
};

export type ParsedConnectionStats = {
  availableOutgoingBitrate: number,
  bytesReceived: number,
  bytesSent: number,
  currentRoundTripTime: number,
  id: string,
  transportId: string,
  packetsReceived: number,
  packetsSent: number,
  state: string,
  totalRoundTripTime: number,
  type: string,
  local: IceCandidateConnectionStats,
  remote: IceCandidateConnectionStats,
};

export type IceCandidateConnectionStats = {
  address: string,
  candidateType: string,
  id: string,
  ip: string,
  isRemote: boolean
  networkType?: string,
  port: number,
  priority: number
  protocol: 'udp' | 'tcp'
  timestamp: number,
  transportId: string,
  type: 'local-candidate' | 'remote-candidate',
};

export type ParsedRemoteInboundStreamStats = {
  clockRate: number,
  codecId: string,
  fractionLost: number,
  id: string,
  jitter: number,
  kind: string,
  localId: string,
  mimeType: string,
  packetsLost: number,
  payloadType: number,
  roundTripTime: number,
  roundTripTimeMeasurements: number,
  ssrc: number,
  timestamp: number,
  totalRoundTripTime: number,
  transportId: string,
  type: string,
};

export type ParsedRemoteOutboundStreamStats = {
  bytesSent: number,
  clockRate: number,
  codecId: string,
  id: string,
  kind: string,
  localId: string,
  mimeType: string,
  packetsSent: number,
  payloadType: number,
  remoteTimestamp: number,
  reportsSent: number,
  roundTripTimeMeasurements: number,
  ssrc: number,
  timestamp: number,
  totalRoundTripTime: number,
  transportId: string,
  type: string,
};

export type RemoteParsedStats = {
  video: {
    inbound: ParsedRemoteInboundStreamStats[],
    outbound: ParsedRemoteOutboundStreamStats[],
  },
  audio: {
    inbound: ParsedRemoteInboundStreamStats[],
    outbound: ParsedRemoteOutboundStreamStats[],
  },
};

export type WebRTCStatsParsed = {
  audio: {
    inbound: ParsedInboundAudioStreamStats[],
    outbound: ParsedOutboundAudioStreamStats[],
  },
  video: {
    inbound: ParsedInboundVideoStreamStats[],
    outbound: ParsedOutboundVideoStreamStats[],
  },
  connection: ParsedConnectionStats,
  remote: RemoteParsedStats,
};

export interface Logger {
  debug: (msg: any, ...meta: any[]) => void;
  info: (msg: any, ...meta: any[]) => void;
  warn: (msg: any, ...meta: any[]) => void;
  error: (msg: any, ...meta: any[]) => void;
}
