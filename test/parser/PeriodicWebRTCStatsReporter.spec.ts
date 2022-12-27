import faker from 'faker';
import sinon, { SinonFakeTimers } from 'sinon';
import { expect } from 'chai';
import { StatsReportItem, CompositeStatsParser } from '../../src';
import { createStatsReportItem } from '../utils/rtc';
import PeriodicWebRTCStatsReporter from '../../src/parser/PeriodicWebRTCStatsReporter';

const createCompositeStatsParserFake = (): CompositeStatsParser => ({
  addPeerConnection(): void {
  },
  async parse(): Promise<StatsReportItem[]> {
    return Promise.resolve([]);
  },
});

interface CreateReporterTestParams {
  compositeStatsParser?: CompositeStatsParser;
  getStatsInterval?: number;
}

const createPeriodicStatsReporter = (
  params: CreateReporterTestParams = {},
): PeriodicWebRTCStatsReporter => new PeriodicWebRTCStatsReporter({
  compositeStatsParser: params.compositeStatsParser ?? createCompositeStatsParserFake(),
  getStatsInterval: params.getStatsInterval,
});

describe('wid/lib/PeriodicWebRTCStatsReporter', () => {
  const sandbox = sinon.createSandbox();
  let clock: SinonFakeTimers;

  beforeEach(() => {
    clock = sandbox.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  after(() => {
    sandbox.restore();
  });

  it('should not be running by default', async () => {
    const reporter = createPeriodicStatsReporter();

    expect(reporter.isRunning).to.be.false;
  });

  it('should be in running state after start reporting called', async () => {
    const reporter = createPeriodicStatsReporter();

    reporter.startReporting();

    expect(reporter.isRunning).to.be.true;
  });

  it('should not parse stats immediately', async () => {
    const getStatsInterval = faker.datatype.number({ min: 1, max: 9999 });
    const compositeStatsParser = createCompositeStatsParserFake();
    const reporter = createPeriodicStatsReporter({ compositeStatsParser, getStatsInterval });
    sandbox.stub(compositeStatsParser, 'parse');

    reporter.startReporting();
    await clock.tickAsync(getStatsInterval - 1);

    expect(compositeStatsParser.parse).not.to.be.called;
  });

  it('should parse stats after specific period of time', async () => {
    const getStatsInterval = faker.datatype.number({ min: 1, max: 9999 });
    const compositeStatsParser = createCompositeStatsParserFake();
    const reporter = createPeriodicStatsReporter({ compositeStatsParser, getStatsInterval });
    sandbox.stub(compositeStatsParser, 'parse');

    reporter.startReporting();
    await clock.tickAsync(getStatsInterval);

    expect(compositeStatsParser.parse).to.be.calledOnce;
  });

  it('should delay stats parsing after the first parse attempt', async () => {
    const getStatsInterval = faker.datatype.number({ min: 1, max: 9999 });
    const compositeStatsParser = createCompositeStatsParserFake();
    const reporter = createPeriodicStatsReporter({ compositeStatsParser, getStatsInterval });
    const parseMethodDouble = sandbox.stub(compositeStatsParser, 'parse');
    const numberOfIntervals = faker.datatype.number({ min: 1, max: 10 });

    reporter.startReporting();
    await clock.tickAsync(getStatsInterval * numberOfIntervals);

    expect(parseMethodDouble.getCalls()).to.have.length(numberOfIntervals);
  });

  it('should emit stats parsed event', async () => {
    const getStatsInterval = faker.datatype.number({ min: 1, max: 9999 });
    const compositeStatsParser = createCompositeStatsParserFake();
    const reporter = createPeriodicStatsReporter({ compositeStatsParser, getStatsInterval });
    sandbox.stub(compositeStatsParser, 'parse');
    const emitSpy = sandbox.spy(reporter, 'emit');

    reporter.startReporting();
    await clock.tickAsync(getStatsInterval);

    expect(emitSpy).to.be.calledWith(PeriodicWebRTCStatsReporter.STATS_REPORTS_PARSED, { timeTaken: 0 });
  });

  it('should emit stats report ready event for each stats report item', async () => {
    const getStatsInterval = faker.datatype.number({ min: 1, max: 9999 });
    const compositeStatsParser = createCompositeStatsParserFake();
    const reporter = createPeriodicStatsReporter({ compositeStatsParser, getStatsInterval });
    const firstReportItem = createStatsReportItem();
    const secondReportItem = createStatsReportItem();
    sandbox.stub(compositeStatsParser, 'parse')
      .resolves([firstReportItem, secondReportItem]);
    const emitSpy = sandbox.spy(reporter, 'emit');

    reporter.startReporting();
    await clock.tickAsync(getStatsInterval);

    expect(emitSpy).to.be.calledWith(PeriodicWebRTCStatsReporter.STATS_REPORT_READY_EVENT, firstReportItem);
    expect(emitSpy).to.be.calledWith(PeriodicWebRTCStatsReporter.STATS_REPORT_READY_EVENT, secondReportItem);
  });

  it('should be be in stopped state', async () => {
    const reporter = createPeriodicStatsReporter();

    reporter.startReporting();
    reporter.stopReporting();

    expect(reporter.isRunning).to.be.false;
  });

  it('should stop stats parsing if stop method was called before timeout callback called', async () => {
    const getStatsInterval = faker.datatype.number({ min: 1, max: 9999 });
    const compositeStatsParser = createCompositeStatsParserFake();
    const reporter = createPeriodicStatsReporter({ compositeStatsParser, getStatsInterval });
    sandbox.stub(compositeStatsParser, 'parse');

    reporter.startReporting();
    await clock.tickAsync(getStatsInterval * 2 - 1);
    reporter.stopReporting();
    await clock.tickAsync(1);

    expect(compositeStatsParser.parse).to.be.calledOnce;
  });
});
