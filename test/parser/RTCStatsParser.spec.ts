import sinon from 'sinon';
import { beforeEach } from 'mocha';
import faker from 'faker';
import { expect } from 'chai';
import RTCStatsParser from '../../src/parser/RTCStatsParser';
import createLogger from '../../src/utils/logger';
import { ConnectionInfo } from '../../src';
import { createPeerConnectionFake } from '../utils/rtc';

const createParser = (): RTCStatsParser => new RTCStatsParser({
  logger: createLogger(),
});

const createParserPayload = (payload: Partial<RTCPeerConnection & { id: string }> = {}): ConnectionInfo => {
  const pcPayload = payload;
  pcPayload.getReceivers = () => [];
  pcPayload.getSenders = () => [];

  const pc = createPeerConnectionFake(pcPayload);

  return {
    pc,
    id: payload.id ?? (pc as { testPcId?: string }).testPcId ?? faker.datatype.uuid(),
  };
};

describe('wid/lib/parser/RTCStatsParser', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => {
    sandbox.restore();
  });

  after(() => {
    sandbox.restore();
  });

  it('should store parsed connection up to ttl time', async () => {
    const parser = createParser();
    const payload = createParserPayload();
    const clock = sandbox.useFakeTimers();

    await parser.parse(payload);
    await clock.tickAsync(54_999);

    expect(parser.previouslyParsedStatsConnectionsIds).to.deep.eq([payload.id]);
  });

  it('should cleanup parsed connection if ttl exceeded since last parse', async () => {
    const parser = createParser();
    const payload = createParserPayload();
    const clock = sandbox.useFakeTimers();

    await parser.parse(payload);
    await clock.tickAsync(55_000);

    expect(parser.previouslyParsedStatsConnectionsIds).to.deep.eq([]);
  });

  describe('should return undefined results', () => {
    const cases = [
      { title: 'when connection is closed', payload: createParserPayload({ connectionState: 'closed' }) },
      { title: 'when ice connection is closed', payload: createParserPayload({ iceConnectionState: 'closed' }) },
    ];

    cases.forEach(({ title, payload }) => {
      it(title, async () => {
        const parser = createParser();

        const result = await parser.parse(payload);

        expect(result).to.be.undefined;
      });
    });
  });
});
