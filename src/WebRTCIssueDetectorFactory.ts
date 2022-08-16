import { WebRTCIssueEmitter } from './WebRTCIssueEmitter';
import {
  CreateWIDPayload,
  Logger,
  NetworkScoresCalculator,
  WebRTCIssueDetectorFactoryConstructorParams,
} from './types';
import PeriodicWebRTCStatsReporter from './parser/PeriodicWebRTCStatsReporter';
import WebRTCIssueDetector from './WebRTCIssueDetector';
import DefaultNetworkScoresCalculator from './NetworkScoresCalculator';
import { CompositeRTCStatsParser, RTCStatsParser } from './parser';

class WebRTCIssueDetectorFactory {
  private readonly defaultIssueEmitter: WebRTCIssueEmitter;

  private readonly defaultNetworkScoresCalculator: NetworkScoresCalculator;

  private readonly defaultCompositeStatsParser: CompositeRTCStatsParser;

  private readonly logger: Logger;

  private readonly defaultPeriodicStatsReported: PeriodicWebRTCStatsReporter;

  constructor(params: WebRTCIssueDetectorFactoryConstructorParams = {}) {
    this.logger = params.logger ?? {
      debug: () => {
      },
      info: () => {
      },
      warn: () => {
      },
      error: () => {
      },
    };

    this.defaultIssueEmitter = new WebRTCIssueEmitter();
    this.defaultNetworkScoresCalculator = new DefaultNetworkScoresCalculator();
    const statsParser = new RTCStatsParser({ logger: this.logger });
    this.defaultCompositeStatsParser = new CompositeRTCStatsParser({
      statsParser,
    });
    this.defaultPeriodicStatsReported = new PeriodicWebRTCStatsReporter({
      compositeStatsParser: this.defaultCompositeStatsParser,
      getStatsInterval: 5000,
    });
  }

  createWID(params: CreateWIDPayload = {}): WebRTCIssueDetector {
    const issueEmitter = params.issueEmitter ?? this.defaultIssueEmitter;
    const networkScoresCalculator = params.networkScoresCalculator ?? this.defaultNetworkScoresCalculator;
    const compositeStatsParser = params.compositeStatsParser ?? this.defaultCompositeStatsParser;
    const statsReporter = params.statsReporter ?? this.defaultPeriodicStatsReported;

    return new WebRTCIssueDetector({
      issueEmitter,
      networkScoresCalculator,
      compositeStatsParser,
      statsReporter,
      logger: this.logger,
      ignoreSSRCList: params.ignoreSSRCList ?? [],
      detectors: params.detectors ?? [],
      onIssues: params.onIssues,
      onNetworkScoresUpdated: params.onNetworkScoresUpdated,
    });
  }
}

export default WebRTCIssueDetectorFactory;
