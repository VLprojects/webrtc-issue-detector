import sinon from 'sinon';
import { beforeEach } from 'mocha';
import faker from 'faker';
import { expect } from 'chai';
import RTCStatsParser from '../../src/parser/RTCStatsParser';
import createLogger from '../../src/utils/logger';
import { ConnectionInfo, Logger } from '../../src';
import { createPeerConnectionFake } from '../utils/rtc';

interface CreateParserTestPayload {
  logger?: Logger;
}

type CreatePayloadPayload = Partial<RTCPeerConnection & {
  id?: string;
  rtpReceivers?: RTCRtpReceiver[];
  rtpSenders?: RTCRtpSender[];
}>;

const createParser = (payload: CreateParserTestPayload = {}): RTCStatsParser => new RTCStatsParser({
  logger: payload.logger ?? createLogger(),
});

const createPayload = (payload: CreatePayloadPayload = {}): ConnectionInfo => {
  const {
    id,
    rtpReceivers,
    rtpSenders,
    ...pcPayload
  } = payload;

  const pc = createPeerConnectionFake({
    getReceivers(): RTCRtpReceiver[] {
      return rtpReceivers ?? [];
    },
    getSenders(): RTCRtpSender[] {
      return rtpSenders ?? [];
    },
    ...pcPayload,
  });

  return {
    pc,
    id: id ?? (pc as { testPcId?: string }).testPcId ?? faker.datatype.uuid(),
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

  it('should return stats even if getStats methods has no data', async () => {
    const startTime = Date.now();
    const finishTime = startTime + faker.datatype.number({ min: 1, max: 999 });

    sandbox.stub(Date, 'now')
      .onFirstCall()
      .returns(startTime)
      .returns(finishTime);

    const parser = createParser();
    const payload = createPayload();

    const result = await parser.parse(payload);

    expect(result).to.deep.eq({
      id: payload.id,
      stats: {
        audio: {
          inbound: [],
          outbound: [],
        },
        connection: {},
        remote: {
          audio: {
            inbound: [],
            outbound: [],
          },
          video: {
            inbound: [],
            outbound: [],
          },
        },
        video: {
          inbound: [],
          outbound: [],
        },
      },
      timeTaken: finishTime - startTime,
    });
  });

  it('should store parsed connection up to ttl time', async () => {
    const parser = createParser();
    const payload = createPayload();
    const clock = sandbox.useFakeTimers();

    await parser.parse(payload);
    await clock.tickAsync(54_999);

    expect(parser.previouslyParsedStatsConnectionsIds).to.deep.eq([payload.id]);
  });

  it('should cleanup parsed connection if ttl exceeded since last parse', async () => {
    const parser = createParser();
    const payload = createPayload();
    const clock = sandbox.useFakeTimers();

    await parser.parse(payload);
    await clock.tickAsync(55_000);

    expect(parser.previouslyParsedStatsConnectionsIds).to.deep.eq([]);
  });

  describe('should return undefined results', () => {
    const cases = [
      { title: 'when connection is closed', payload: createPayload({ connectionState: 'closed' }) },
      { title: 'when ice connection is closed', payload: createPayload({ iceConnectionState: 'closed' }) },
    ];

    cases.forEach(({ title, payload }) => {
      it(title, async () => {
        const parser = createParser();

        const result = await parser.parse(payload);

        expect(result).to.be.undefined;
      });
    });
  });

  it('should return undefined result if error happens during parsing', async () => {
    const logger = createLogger();
    const loggerSpy = sandbox.spy(logger);
    const parser = createParser({ logger });
    const payload = createPayload({
      getReceivers: null as unknown as undefined, // calling this method will trigger error
    });

    const result = await parser.parse(payload);

    expect(result).to.be.undefined;
    expect(loggerSpy.error).to.be.calledOnceWith('Failed to get stats for PC');
  });
});
