import { expect } from 'chai';
import faker from 'faker';
import {
  calcBitrate,
  calcValueRate,
  checkIsConnectionClosed,
} from '../../src/parser/utils';
import { createPeerConnectionFake } from '../utils/rtc';

type FakeStats = Record<string, unknown> & { timestamp: number };

interface CreateStatsTestPayload {
  [key: string]: string | number | undefined | null;
  timestamp?: number;
  propName?: string;
  propValue?: string | number | undefined | null;
}

const createStats = (payload: CreateStatsTestPayload = {}): { stats: FakeStats, propName: string } => {
  const {
    propName, propValue, timestamp, ...statsProps
  } = payload;
  const name = propName ?? faker.lorem.word();
  let value: number | string | undefined;

  if (propValue === null) {
    value = undefined;
  } else {
    value = propValue ?? faker.datatype.number({ min: 10 });
  }

  return {
    propName: name,
    stats: {
      ...statsProps,
      [name]: value,
      timestamp: timestamp ?? Date.now(),
    },
  };
};

describe('wid/lib/parser/utils', () => {
  describe('checkIsConnectionClosed()', () => {
    it('should count connection as open', () => {
      const pc = createPeerConnectionFake();

      expect(checkIsConnectionClosed(pc)).to.be.false;
    });

    it('should count connection as closed if ice state is closed', () => {
      const pc = createPeerConnectionFake({ iceConnectionState: 'closed' });

      expect(checkIsConnectionClosed(pc)).to.be.true;
    });

    it('should count connection as closed if connection state is closed', () => {
      const pc = createPeerConnectionFake({ connectionState: 'closed' });

      expect(checkIsConnectionClosed(pc)).to.be.true;
    });
  });

  describe('calcValueRate()', () => {
    it('should correctly calc byte rate for high precision timestamp', () => {
      const propValue = faker.datatype.number({ min: 1, max: 1000000 });
      const valueDiff = faker.datatype.number({ min: 1, max: 1000000 });
      const timeDiff = faker.datatype.number({ min: 1, max: 1000000 });
      const tsHighPrecisionPart = 0.123;
      const { propName, stats: prevStats } = createStats({
        propValue,
        timestamp: Date.now() + tsHighPrecisionPart,
      });
      const { stats } = createStats({
        propName,
        propValue: propValue + valueDiff,
        timestamp: prevStats.timestamp + timeDiff + tsHighPrecisionPart,
      });

      const rate = calcValueRate(stats, prevStats, propName);

      expect(rate).to.eq((valueDiff / timeDiff) * 1000);
    });

    it('should return zero if no prev stats given', () => {
      const { propName, stats } = createStats();

      const rate = calcValueRate(stats, undefined, propName);

      expect(rate).to.eq(0);
    });

    it('should return zero if prev stats prop val is nil', () => {
      const { propName, stats: prevStats } = createStats({ propValue: null });
      const { stats } = createStats({ propName });

      const rate = calcValueRate(stats, prevStats, propName);

      expect(rate).to.eq(0);
    });

    it('should return zero if current stats prop val is nil', () => {
      const { propName, stats: prevStats } = createStats();
      const { stats } = createStats({ propName, propValue: null });

      const rate = calcValueRate(stats, prevStats, propName);

      expect(rate).to.eq(0);
    });

    it('should return zero if has same timestamp', () => {
      const { propName, stats: prevStats } = createStats();
      const { stats } = createStats({ propName, timestamp: prevStats.timestamp });

      const rate = calcValueRate(stats, prevStats, propName);

      expect(rate).to.eq(0);
    });
  });

  describe('calcBitrate()', () => {
    it('should correctly calc bitrate for high precision timestamp', () => {
      const propValue = faker.datatype.number({ min: 1, max: 1000000 });
      const valueDiff = faker.datatype.number({ min: 1, max: 1000000 });
      const timeDiff = faker.datatype.number({ min: 1, max: 1000000 });
      const { propName, stats: prevStats } = createStats({ propValue });
      const { stats } = createStats({
        propName,
        propValue: propValue + valueDiff,
        timestamp: prevStats.timestamp + timeDiff,
      });

      const rate = calcBitrate(stats, prevStats, propName);

      expect(rate).to.eq((valueDiff / timeDiff) * 1000 * 8);
    });
  });
});
