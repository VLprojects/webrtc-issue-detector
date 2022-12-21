import { beforeEach } from 'mocha';
import sinon from 'sinon';
import { expect } from 'chai';
import { createPeerConnectionFake, createStatsReportItem } from '../helpers/rtc';
import { StatsParser, StatsReportItem } from '../../src';
import CompositeRTCStatsParser from '../../src/parser/CompositeRTCStatsParser';

const createStatsParserFake = (): StatsParser => ({
  parse(): Promise<StatsReportItem | undefined> {
    return Promise.resolve(undefined);
  },
});

const createCompositeStatsParser = (
  statsParser?: StatsParser,
): CompositeRTCStatsParser => new CompositeRTCStatsParser({
  statsParser: statsParser ?? createStatsParserFake(),
});

describe('wid/lib/parser/CompositeRTCStatsParser', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => {
    sandbox.restore();
  });

  after(() => {
    sandbox.restore();
  });

  it('should parse empty stats when no PC added', async () => {
    const statsParser = createStatsParserFake();
    const compositeParser = createCompositeStatsParser(statsParser);
    sandbox.stub(statsParser, 'parse');

    const reportItems = await compositeParser.parse();

    expect(statsParser.parse).not.to.be.called;
    expect(reportItems).to.deep.eq([]);
  });

  it('should get stats for each PC added', async () => {
    const pc1 = createPeerConnectionFake();
    const pc1Stats = createStatsReportItem();
    const pc2 = createPeerConnectionFake();
    const pc2Stats = createStatsReportItem();
    const statsParser = createStatsParserFake();
    const compositeParser = createCompositeStatsParser(statsParser);
    compositeParser.addPeerConnection({ pc: pc1 });
    compositeParser.addPeerConnection({ pc: pc2 });
    sandbox.stub(statsParser, 'parse')
      .onFirstCall()
      .resolves(pc1Stats)
      .onSecondCall()
      .resolves(pc2Stats);

    const reportItems = await compositeParser.parse();

    expect(statsParser.parse).to.be.calledTwice;
    expect(reportItems).to.deep.eq([pc1Stats, pc2Stats]);
  });

  it('should remove connection from list', async () => {
    const pc = createPeerConnectionFake();
    const compositeParser = createCompositeStatsParser();
    compositeParser.addPeerConnection({ pc });
    const connectionsBeforeRemoval = compositeParser.listConnections();

    compositeParser.removePeerConnection({ pc });

    expect(connectionsBeforeRemoval).to.have.length(1);
    expect(connectionsBeforeRemoval[0].pc).to.eq(pc);
    expect(compositeParser.listConnections()).to.deep.eq([]);
  });

  it('should not get stats for closed PCs', async () => {
    const pc1 = createPeerConnectionFake();
    const pc2 = createPeerConnectionFake({ connectionState: 'closed' });
    const pc3 = createPeerConnectionFake();
    const pc1Stats = createStatsReportItem();
    const pc3Stats = createStatsReportItem();
    const statsParser = createStatsParserFake();
    const compositeParser = createCompositeStatsParser(statsParser);
    compositeParser.addPeerConnection({ pc: pc1 });
    compositeParser.addPeerConnection({ pc: pc2 });
    compositeParser.addPeerConnection({ pc: pc3 });
    const parseDouble = sandbox.stub(statsParser, 'parse')
      .onFirstCall()
      .resolves(pc1Stats)
      .onSecondCall()
      .resolves(pc3Stats);

    const reportItems = await compositeParser.parse();

    expect(statsParser.parse).to.be.calledTwice;
    const connectionInfo1 = parseDouble.getCall(0).firstArg;
    expect(connectionInfo1?.pc).to.eq(pc1);
    const connectionInfo2 = parseDouble.getCall(1).firstArg;
    expect(connectionInfo2?.pc).to.eq(pc3);
    expect(reportItems).to.deep.eq([pc1Stats, pc3Stats]);
  });

  it('should remove closed PCs after parsing', async () => {
    const pc1 = createPeerConnectionFake({ connectionState: 'closed' });
    const pc2 = createPeerConnectionFake();
    const compositeParser = createCompositeStatsParser();
    compositeParser.addPeerConnection({ pc: pc1 });
    compositeParser.addPeerConnection({ pc: pc2 });
    const connectionsBeforeParsing = compositeParser.listConnections();

    await compositeParser.parse();
    const connectionsAfterParsing = compositeParser.listConnections();

    expect(connectionsBeforeParsing).to.have.length(2);
    expect(connectionsAfterParsing).to.have.length(1);
    expect(connectionsAfterParsing[0].pc).to.eq(pc2);
  });

  it('should not return undefined stats in stats results', async () => {
    const pc1 = createPeerConnectionFake();
    const pc1Stats = undefined;
    const pc2 = createPeerConnectionFake();
    const pc2Stats = createStatsReportItem();
    const statsParser = createStatsParserFake();
    const compositeParser = createCompositeStatsParser(statsParser);
    compositeParser.addPeerConnection({ pc: pc1 });
    compositeParser.addPeerConnection({ pc: pc2 });
    sandbox.stub(statsParser, 'parse')
      .onFirstCall()
      .resolves(pc1Stats)
      .onSecondCall()
      .resolves(pc2Stats);

    const reportItems = await compositeParser.parse();

    expect(statsParser.parse).to.be.calledTwice;
    expect(reportItems).to.deep.eq([pc2Stats]);
  });
});
