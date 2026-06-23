import sinon from 'sinon';
import { beforeEach } from 'mocha';
import faker from 'faker';
import { expect } from 'chai';
import RTCStatsParser from '../../src/parser/RTCStatsParser';
import createLogger from '../../src/utils/logger';
import { ConnectionInfo, Logger } from '../../src';
import { createPeerConnectionFake, createOutboundAudioRtcStatsReport, createMediaStreamTrack, createRTCRtpSender } from '../utils/rtc';

interface CreateParserTestPayload {
  logger?: Logger;
  includeDisabledAudioSenders?: boolean;
}

type CreatePayloadPayload = Partial<RTCPeerConnection & {
  id?: string;
  rtpReceivers?: RTCRtpReceiver[];
  rtpSenders?: RTCRtpSender[];
}>;

const createParser = (payload: CreateParserTestPayload = {}): RTCStatsParser => new RTCStatsParser({
  logger: payload.logger ?? createLogger(),
  includeDisabledAudioSenders: payload.includeDisabledAudioSenders,
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
    await clock.tickAsync(34_999);

    expect(parser.previouslyParsedStatsConnectionsIds).to.deep.eq([payload.id]);
  });

  it('should cleanup parsed connection if ttl exceeded since last parse', async () => {
    const parser = createParser();
    const payload = createPayload();
    const clock = sandbox.useFakeTimers();

    await parser.parse(payload);
    await clock.tickAsync(35_000);

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

  describe('sender selection for getStats()', () => {
    const mutedAudioTrack = createMediaStreamTrack('audio', false);
    const mutedVideoTrack = createMediaStreamTrack('video', false);
    const audioBytesSent = faker.datatype.number({ min: 1000, max: 99999 });

    const mutedAudioSender = createRTCRtpSender({
      track: mutedAudioTrack,
      getStats: async () => createOutboundAudioRtcStatsReport(audioBytesSent),
    });

    const mutedVideoSender = createRTCRtpSender({
      track: mutedVideoTrack,
      getStats: async () => createOutboundAudioRtcStatsReport(audioBytesSent),
    });

    it('should skip disabled audio sender by default', async () => {
      const parser = createParser();
      const getStatsSpy = sandbox.spy(mutedAudioSender, 'getStats');
      const payload = createPayload({
        rtpSenders: [mutedAudioSender],
      });

      const result = await parser.parse(payload);

      expect(getStatsSpy).to.not.be.called;
      expect(result?.stats.audio.outbound).to.deep.eq([]);
    });

    it('should poll disabled audio sender when includeDisabledAudioSenders is true', async () => {
      const parser = createParser({ includeDisabledAudioSenders: true });
      const getStatsSpy = sandbox.spy(mutedAudioSender, 'getStats');
      const payload = createPayload({
        rtpSenders: [mutedAudioSender],
      });

      const result = await parser.parse(payload);

      expect(getStatsSpy).to.be.calledOnce;
      expect(result?.stats.audio.outbound).to.have.length(1);
      expect(result?.stats.audio.outbound[0].bytesSent).to.eq(audioBytesSent);
    });

    it('should still skip disabled video sender when includeDisabledAudioSenders is true', async () => {
      const parser = createParser({ includeDisabledAudioSenders: true });
      const getStatsSpy = sandbox.spy(mutedVideoSender, 'getStats');
      const payload = createPayload({
        rtpSenders: [mutedVideoSender],
      });

      const result = await parser.parse(payload);

      expect(getStatsSpy).to.not.be.called;
      expect(result?.stats.video.outbound).to.deep.eq([]);
    });
  });
});
