import { EventEmitter } from 'events';
import { CompositeStatsParser, StatsReportItem } from '../types';

interface PeriodicWebRTCStatsReporterParams {
  compositeStatsParser: CompositeStatsParser;
  getStatsInterval?: number;
}

class PeriodicWebRTCStatsReporter extends EventEmitter {
  static readonly STATS_REPORT_READY_EVENT = 'stats-report-ready';

  private isStopped = false;

  private reportTimer: NodeJS.Timer | undefined;

  private readonly getStatsInterval: number;

  private readonly compositeStatsParser: CompositeStatsParser;

  constructor(params: PeriodicWebRTCStatsReporterParams) {
    super();
    this.compositeStatsParser = params.compositeStatsParser;
    this.getStatsInterval = params.getStatsInterval ?? 10000;
  }

  get isRunning(): boolean {
    return !!this.reportTimer && !this.isStopped;
  }

  startReporting(): void {
    if (this.reportTimer) {
      return;
    }

    const doExtract = () => setTimeout(() => {
      if (this.isStopped) {
        return;
      }

      this.parseReports()
        .finally(() => doExtract());
    }, this.getStatsInterval);

    this.isStopped = false;
    this.reportTimer = doExtract();
  }

  stopReporting(): void {
    this.isStopped = true;

    if (this.reportTimer) {
      clearTimeout(this.reportTimer);
      this.reportTimer = undefined;
    }
  }

  private async parseReports() {
    const reportItems = await this.compositeStatsParser.parse();

    reportItems.forEach((item: StatsReportItem) => {
      this.emit(PeriodicWebRTCStatsReporter.STATS_REPORT_READY_EVENT, item);
    });
  }
}

export default PeriodicWebRTCStatsReporter;
