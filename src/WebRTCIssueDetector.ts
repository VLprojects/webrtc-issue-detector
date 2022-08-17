import { WebRTCIssueEmitter } from './WebRTCIssueEmitter';
import {
  CompositeStatsParser,
  DetectIssuesPayload,
  EventType,
  IssueDetector,
  IssuePayload,
  INetworkScoresCalculator,
  StatsReportItem,
  WebRTCIssueDetectorConstructorParams,
  WebRTCStatsParsed,
  WIDWindow,
  Logger,
} from './types';
import PeriodicWebRTCStatsReporter from './parser/PeriodicWebRTCStatsReporter';

class WebRTCIssueDetector {
  readonly eventEmitter: WebRTCIssueEmitter;

  #running = false;

  private readonly detectors: IssueDetector[] = [];

  private readonly networkScoresCalculator: INetworkScoresCalculator;

  private readonly statsReporter: PeriodicWebRTCStatsReporter;

  private readonly compositeStatsParser: CompositeStatsParser;

  private readonly logger: Logger;

  constructor(params: WebRTCIssueDetectorConstructorParams) {
    this.eventEmitter = params.issueEmitter;

    if (params.onIssues) {
      this.eventEmitter.on(EventType.Issue, params.onIssues);
    }

    if (params.onNetworkScoresUpdated) {
      this.eventEmitter.on(EventType.NetworkScoresUpdated, params.onNetworkScoresUpdated);
    }

    this.networkScoresCalculator = params.networkScoresCalculator;
    this.detectors = params.detectors;
    this.compositeStatsParser = params.compositeStatsParser;
    this.statsReporter = params.statsReporter;
    this.logger = params.logger;

    (window as unknown as WIDWindow).wid = this;
    this.wrapRTCPeerConnection();

    this.statsReporter.on(PeriodicWebRTCStatsReporter.STATS_REPORT_READY_EVENT, (report: StatsReportItem) => {
      this.detectIssues({
        data: report.stats,
        ignoreSSRCList: params.ignoreSSRCList,
      });

      this.calculateNetworkScores(report.stats);
    });
  }

  public watchNewPeerConnections(): void {
    if (this.#running) {
      throw new Error('WebRTCIssueDetector is already started');
    }

    this.#running = true;
    this.statsReporter.startReporting();
  }

  public stopWatchingNewPeerConnections(): void {
    if (!this.#running) {
      throw new Error('WebRTCIssueDetector is already stopped');
    }

    this.#running = false;
    this.statsReporter.stopReporting();
  }

  public handleNewPeerConnection(pc: RTCPeerConnection): void {
    if (!this.#running) {
      this.logger.debug('Skip handling new peer connection. Detector is not running', pc);
      return;
    }

    this.logger.debug('Handling new peer connection', pc);

    this.compositeStatsParser.addPeerConnection({ pc });
  }

  private emitIssues(issues: IssuePayload[]): void {
    this.eventEmitter.emit(EventType.Issue, issues);
  }

  private detectIssues({ data, ignoreSSRCList }: DetectIssuesPayload): void {
    let issues = this.detectors.reduce<IssuePayload[]>((acc, detector) => [...acc, ...detector.detect(data)], []);
    if (ignoreSSRCList?.length) {
      issues = issues.filter((issue) => {
        if (!issue.ssrc) {
          return true;
        }

        return !ignoreSSRCList.includes(issue.ssrc);
      });
    }

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
