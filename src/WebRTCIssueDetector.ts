import { WebRTCIssueEmitter } from './WebRTCIssueEmitter';
import {
  CompositeStatsParser,
  DetectIssuesPayload,
  EventType,
  INetworkScoresCalculator,
  IssueDetector,
  IssuePayload,
  Logger,
  StatsReportItem,
  WebRTCIssueDetectorConstructorParams,
  WebRTCStatsParsed,
  WIDWindow,
} from './types';
import PeriodicWebRTCStatsReporter from './parser/PeriodicWebRTCStatsReporter';
import DefaultNetworkScoresCalculator from './NetworkScoresCalculator';
import {
  AvailableOutgoingBitrateIssueDetector,
  FramesDroppedIssueDetector,
  FramesEncodedSentIssueDetector,
  InboundNetworkIssueDetector,
  NetworkMediaSyncIssueDetector,
  OutboundNetworkIssueDetector,
  QualityLimitationsIssueDetector,
  UnknownVideoDecoderImplementationDetector,
} from './detectors';
import { CompositeRTCStatsParser, RTCStatsParser } from './parser';
import createLogger from './utils/logger';

class WebRTCIssueDetector {
  readonly eventEmitter: WebRTCIssueEmitter;

  #running = false;

  private readonly detectors: IssueDetector[] = [];

  private readonly networkScoresCalculator: INetworkScoresCalculator;

  private readonly statsReporter: PeriodicWebRTCStatsReporter;

  private readonly compositeStatsParser: CompositeStatsParser;

  private readonly logger: Logger;

  private readonly autoAddPeerConnections: boolean;

  constructor(params: WebRTCIssueDetectorConstructorParams) {
    this.logger = params.logger ?? createLogger();
    this.eventEmitter = params.issueEmitter ?? new WebRTCIssueEmitter();

    if (params.onIssues) {
      this.eventEmitter.on(EventType.Issue, params.onIssues);
    }

    if (params.onNetworkScoresUpdated) {
      this.eventEmitter.on(EventType.NetworkScoresUpdated, params.onNetworkScoresUpdated);
    }

    this.detectors = params.detectors ?? [
      new QualityLimitationsIssueDetector(),
      new FramesDroppedIssueDetector(),
      new FramesEncodedSentIssueDetector(),
      new InboundNetworkIssueDetector(),
      new OutboundNetworkIssueDetector(),
      new NetworkMediaSyncIssueDetector(),
      new AvailableOutgoingBitrateIssueDetector(),
      new UnknownVideoDecoderImplementationDetector(),
    ];

    this.networkScoresCalculator = params.networkScoresCalculator ?? new DefaultNetworkScoresCalculator();
    this.compositeStatsParser = params.compositeStatsParser ?? new CompositeRTCStatsParser({
      statsParser: new RTCStatsParser({
        ignoreSSRCList: params.ignoreSSRCList,
        logger: this.logger,
      }),
    });
    this.statsReporter = params.statsReporter ?? new PeriodicWebRTCStatsReporter({
      compositeStatsParser: this.compositeStatsParser,
      getStatsInterval: params.getStatsInterval ?? 5000,
    });

    (window as unknown as WIDWindow).wid = this;
    this.autoAddPeerConnections = params.autoAddPeerConnections ?? true;
    if (this.autoAddPeerConnections) {
      this.wrapRTCPeerConnection();
    }

    this.statsReporter.on(PeriodicWebRTCStatsReporter.STATS_REPORT_READY_EVENT, (report: StatsReportItem) => {
      this.detectIssues({
        data: report.stats,
      });

      this.calculateNetworkScores(report.stats);
    });

    this.statsReporter.on(PeriodicWebRTCStatsReporter.STATS_REPORTS_PARSED, (data: { timeTaken: number }) => {
      const payload = {
        timeTaken: data.timeTaken,
        ts: Date.now(),
      };

      this.eventEmitter.emit(EventType.StatsParsingFinished, payload);
    });
  }

  public watchNewPeerConnections(): void {
    if (this.#running) {
      this.logger.warn('WebRTCIssueDetector is already started. Skip processing');
      return;
    } else if (!this.autoAddPeerConnections) {
      this.logger.warn('Auto add peer connections is disabled. Skip processing');
      return;
    }

    this.logger.info('Start watching peer connections');

    this.#running = true;
    this.statsReporter.startReporting();
  }

  public stopWatchingNewPeerConnections(): void {
    if (!this.#running) {
      this.logger.warn('WebRTCIssueDetector is already stopped. Skip processing');
      return;
    }

    this.logger.info('Stop watching peer connections');

    this.#running = false;
    this.statsReporter.stopReporting();
  }

  public handleNewPeerConnection(pc: RTCPeerConnection): void {
    if (!this.#running) {
      this.logger.debug('Skip handling new peer connection. Detector is not running', pc);
      return;
    } else if (!this.autoAddPeerConnections) {
      this.logger.info("Starting stats reporting for new peer connection");
      this.#running = true;
      this.statsReporter.startReporting();
    }

    this.logger.debug('Handling new peer connection', pc);

    this.compositeStatsParser.addPeerConnection({ pc });
  }

  private emitIssues(issues: IssuePayload[]): void {
    this.eventEmitter.emit(EventType.Issue, issues);
  }

  private detectIssues({ data }: DetectIssuesPayload): void {
    const issues = this.detectors.reduce<IssuePayload[]>((acc, detector) => [...acc, ...detector.detect(data)], []);
    if (issues.length > 0) {
      this.emitIssues(issues);
    }
  }

  private calculateNetworkScores(data: WebRTCStatsParsed): void {
    const networkScores = this.networkScoresCalculator.calculate(data);
    this.eventEmitter.emit(EventType.NetworkScoresUpdated, networkScores);
  }

  private wrapRTCPeerConnection(): void {
    if (!window.RTCPeerConnection) {
      this.logger.warn('No RTCPeerConnection found in browser window. Skipping');
      return;
    }

    const OriginalRTCPeerConnection = window.RTCPeerConnection;
    const onConnectionCreated = (pc: RTCPeerConnection) => this.handleNewPeerConnection(pc);

    function WIDRTCPeerConnection(rtcConfig?: RTCConfiguration) {
      const connection = new OriginalRTCPeerConnection(rtcConfig);
      onConnectionCreated(connection);
      return connection;
    }

    WIDRTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
    (window.RTCPeerConnection as unknown) = WIDRTCPeerConnection;
  }
}

export default WebRTCIssueDetector;
