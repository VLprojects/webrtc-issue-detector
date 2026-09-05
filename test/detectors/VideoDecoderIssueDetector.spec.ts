import faker from 'faker';
import { expect } from 'chai';
import VideoDecoderIssueDetector from '../../src/detectors/VideoDecoderIssueDetector';
import {
  IssueDetectorResult,
  NetworkScores,
  ParsedInboundVideoStreamStats,
  WebRTCStatsParsed,
} from '../../src';

/**
 * Fixture semantics. Sample 0 holds the baseline counters and no interval. Interval k (k >= 1) is the
 * time between sample k - 1 and sample k, and its per-interval values are added into sample k and every
 * later sample. So `count` samples have `count - 1` intervals, and a per-interval array has `count - 1`
 * entries. A stream with `resetAtSample: r` holds zero for every cumulative counter in sample r (the
 * timestamp is not reset) and grows from zero in later samples.
 */
interface StreamFixture {
  ssrc: number;
  receivedFps: number | number[];
  decodedFps?: number | number[];
  droppedFps?: number;
  decodeMsPerFrame: number;
  packetLossPct?: number;
  jitterMs?: number;
  powerEfficientDecoder?: boolean;
  resetAtSample?: number;
  newIdAtSample?: number;
  omit?: string[];
}

interface Baseline {
  framesReceived: number;
  framesDecoded: number;
  framesDropped: number;
  totalDecodeTime: number;
  packetsReceived: number;
  packetsLost: number;
}

interface CreateSamplesPayload {
  connectionId?: string;
  intervalMs?: number;
  count: number;
  streams: StreamFixture[];
  baseline?: Partial<Baseline>;
}

const DEFAULT_BASELINE: Baseline = {
  framesReceived: 1000,
  framesDecoded: 1000,
  framesDropped: 0,
  totalDecodeTime: 10,
  packetsReceived: 2000,
  packetsLost: 0,
};

const perInterval = (value: number | number[], intervalIndex: number): number => (
  Array.isArray(value) ? value[intervalIndex - 1] : value
);

const createInboundStream = (
  stream: StreamFixture,
  sampleIndex: number,
  intervalMs: number,
  baseline: Baseline,
): ParsedInboundVideoStreamStats => {
  const intervalSec = intervalMs / 1000;
  const decodedFps = stream.decodedFps ?? stream.receivedFps;
  const resetAt = stream.resetAtSample;
  const startsFromZero = resetAt !== undefined && sampleIndex >= resetAt;
  const counters: Baseline = startsFromZero
    ? {
      framesReceived: 0, framesDecoded: 0, framesDropped: 0, totalDecodeTime: 0, packetsReceived: 0, packetsLost: 0,
    }
    : { ...baseline };
  const firstInterval = startsFromZero ? (resetAt as number) + 1 : 1;

  for (let k = firstInterval; k <= sampleIndex; k += 1) {
    const received = perInterval(stream.receivedFps, k) * intervalSec;
    const decoded = perInterval(decodedFps, k) * intervalSec;
    const packetsReceived = received * 2;
    counters.framesReceived += received;
    counters.framesDecoded += decoded;
    counters.framesDropped += (stream.droppedFps ?? 0) * intervalSec;
    counters.totalDecodeTime += (decoded * stream.decodeMsPerFrame) / 1000;
    counters.packetsReceived += packetsReceived;
    counters.packetsLost += Math.round((packetsReceived * (stream.packetLossPct ?? 0)) / 100);
  }

  const idSuffix = stream.newIdAtSample !== undefined && sampleIndex >= stream.newIdAtSample ? '-r' : '';
  const result: Record<string, unknown> = {
    id: `IT01V${stream.ssrc}${idSuffix}`,
    ssrc: stream.ssrc,
    timestamp: sampleIndex * intervalMs,
    ...counters,
    jitter: (stream.jitterMs ?? 5) / 1000,
    framesPerSecond: perInterval(decodedFps, Math.max(sampleIndex, 1)),
  };
  if (stream.powerEfficientDecoder !== undefined) {
    result.powerEfficientDecoder = stream.powerEfficientDecoder;
  }
  (stream.omit ?? []).forEach((field) => {
    delete result[field];
  });

  return result as unknown as ParsedInboundVideoStreamStats;
};

const createSamples = (payload: CreateSamplesPayload): WebRTCStatsParsed[] => {
  const connectionId = payload.connectionId ?? faker.datatype.uuid();
  const intervalMs = payload.intervalMs ?? 5000;
  const baseline: Baseline = { ...DEFAULT_BASELINE, ...payload.baseline };
  const samples: WebRTCStatsParsed[] = [];

  for (let i = 0; i < payload.count; i += 1) {
    samples.push({
      connection: { id: connectionId },
      video: {
        inbound: payload.streams.map((stream) => createInboundStream(stream, i, intervalMs, baseline)),
      },
    } as WebRTCStatsParsed);
  }

  return samples;
};

const runDetector = (
  detector: VideoDecoderIssueDetector,
  samples: WebRTCStatsParsed[],
  networkScoresBySample: (NetworkScores | undefined)[] = [],
): IssueDetectorResult[] => samples.map((sample, index) => detector.detect(sample, networkScoresBySample[index]));

const ssrcs = () => ({
  A: faker.datatype.number({ min: 1, max: 1_000_000 }),
  B: faker.datatype.number({ min: 1_000_001, max: 2_000_000 }),
  C: faker.datatype.number({ min: 2_000_001, max: 3_000_000 }),
  D: faker.datatype.number({ min: 3_000_001, max: 4_000_000 }),
});

const healthy = (ssrc: number): StreamFixture => ({ ssrc, receivedFps: 30, decodeMsPerFrame: 4 });

const overloaded = (ssrc: number): StreamFixture => ({
  ssrc, receivedFps: 30, decodedFps: 18, droppedFps: 12, decodeMsPerFrame: 20,
});

const overloadedEntry = (ssrc: number, allFps: number[] = [18, 18, 18, 18]) => ({
  ssrc,
  decodeDemand: 0.6,
  avgDecodeTimeMs: 20,
  arrivalFps: 30,
  decodedFps: 18,
  shortfallPct: 40,
  packetLossPct: 0,
  jitterMs: 5,
  allFps,
  volatility: 0,
});

const issueWith = (statsSample: Record<string, unknown>) => ({
  type: 'cpu',
  reason: 'decoder-cpu-throttling',
  statsSample,
});

const emptyResults = (count: number): IssueDetectorResult[] => Array.from({ length: count }, () => []);

const expectFiresWithTwoStreams = (results: IssueDetectorResult[], first: number, second: number) => {
  const entries = [overloadedEntry(first), overloadedEntry(second)];
  expect(results.slice(0, 4)).to.deep.eq(emptyResults(4));
  expect(results[4]).to.deep.eq([issueWith({
    decodeDemand: 1.2,
    frameShortfallPct: 40,
    windowMs: 20000,
    affectedStreamsPercent: 66.667,
    evaluatedStreams: entries,
    throttledStreams: entries,
    throtthedStreams: entries,
  })]);
};

describe('wid/detectors/VideoDecoderIssueDetector', () => {
  it('does not report a sender whose frame rate wobbles', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({
      count: 6,
      streams: [
        {
          ssrc: A, receivedFps: [30, 15, 30, 15, 30], decodeMsPerFrame: 4,
        },
        healthy(B),
        healthy(C),
      ],
    });

    const results = runDetector(new VideoDecoderIssueDetector(), samples);

    expect(results).to.deep.eq([[], [], [], [], [], []]);
  });
  it('reports a saturated local decoder that drops frames', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({ count: 6, streams: [overloaded(A), overloaded(B), overloaded(C)] });

    const results = runDetector(new VideoDecoderIssueDetector(), samples);

    const entries = [overloadedEntry(A), overloadedEntry(B), overloadedEntry(C)];
    expect(results.slice(0, 4)).to.deep.eq(emptyResults(4));
    expect(results[4]).to.deep.eq([issueWith({
      decodeDemand: 1.8,
      frameShortfallPct: 40,
      windowMs: 20000,
      affectedStreamsPercent: 100,
      evaluatedStreams: entries,
      throttledStreams: entries,
      throtthedStreams: entries,
    })]);
    const { statsSample } = results[4][0];
    expect(statsSample?.throtthedStreams).to.eq(statsSample?.throttledStreams);
    expect(results[5]).to.deep.eq([]);
  });

  it('does not report a costly decoder that keeps up', () => {
    const {
      A, B, C, D,
    } = ssrcs();
    const samples = createSamples({
      count: 6,
      streams: [A, B, C, D].map((ssrc) => ({ ssrc, receivedFps: 30, decodeMsPerFrame: 10 })),
    });

    expect(runDetector(new VideoDecoderIssueDetector(), samples)).to.deep.eq(emptyResults(6));
  });

  it('does not report a shortfall when decode is cheap', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({
      count: 6,
      streams: [A, B, C].map((ssrc) => ({
        ssrc, receivedFps: 30, decodedFps: 24, decodeMsPerFrame: 1,
      })),
    });

    expect(runDetector(new VideoDecoderIssueDetector(), samples)).to.deep.eq(emptyResults(6));
  });

  it('does not report frames dropped after a successful decode', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({
      count: 6,
      streams: [A, B, C].map((ssrc) => ({
        ssrc, receivedFps: 30, decodedFps: 30, droppedFps: 12, decodeMsPerFrame: 20,
      })),
    });

    expect(runDetector(new VideoDecoderIssueDetector(), samples)).to.deep.eq(emptyResults(6));
  });

  it('does not report while the inbound network is bad', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({ count: 6, streams: [overloaded(A), overloaded(B), overloaded(C)] });
    const scores = [undefined, undefined, { inbound: 2.0 } as NetworkScores];

    expect(runDetector(new VideoDecoderIssueDetector(), samples, scores)).to.deep.eq(emptyResults(6));
  });

  it('excludes a stream with packet loss even when the network score is good', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({
      count: 6,
      streams: [{ ...overloaded(A), packetLossPct: 10 }, healthy(B), healthy(C)],
    });
    const scores = samples.map(() => ({ inbound: 3.5 } as NetworkScores));

    expect(runDetector(new VideoDecoderIssueDetector(), samples, scores)).to.deep.eq(emptyResults(6));
  });

  it('excludes a stream without packet counters', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({
      count: 6,
      streams: [{ ...overloaded(A), omit: ['packetsLost', 'packetsReceived'] }, healthy(B), healthy(C)],
    });

    expect(runDetector(new VideoDecoderIssueDetector(), samples)).to.deep.eq(emptyResults(6));
  });

  it('excludes a stream with high RTP jitter', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({
      count: 6,
      streams: [{ ...overloaded(A), jitterMs: 80 }, healthy(B), healthy(C)],
    });

    expect(runDetector(new VideoDecoderIssueDetector(), samples)).to.deep.eq(emptyResults(6));
  });

  it('skips a hardware-decoded stream', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({
      count: 6,
      streams: [{ ...overloaded(A), powerEfficientDecoder: true }, overloaded(B), overloaded(C)],
    });

    expectFiresWithTwoStreams(runDetector(new VideoDecoderIssueDetector(), samples), B, C);
  });

  it('does not report a received track that is not decoded', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({
      count: 6,
      streams: [{
        ssrc: A, receivedFps: 30, decodedFps: 0, decodeMsPerFrame: 0,
      }, healthy(B), healthy(C)],
    });

    expect(runDetector(new VideoDecoderIssueDetector(), samples)).to.deep.eq(emptyResults(6));
  });

  it('does not report when the affected streams decode cheaply', () => {
    const {
      A, B, C, D,
    } = ssrcs();
    const cheapShortfall = (ssrc: number): StreamFixture => ({
      ssrc, receivedFps: 30, decodedFps: 15, decodeMsPerFrame: 2,
    });
    const costlyHealthy = (ssrc: number): StreamFixture => ({ ssrc, receivedFps: 30, decodeMsPerFrame: 10 });
    const samples = createSamples({
      count: 6,
      streams: [cheapShortfall(A), cheapShortfall(B), costlyHealthy(C), costlyHealthy(D)],
    });

    expect(runDetector(new VideoDecoderIssueDetector(), samples)).to.deep.eq(emptyResults(6));
  });

  it('does not report when too few streams show a shortfall', () => {
    const {
      A, B, C, D,
    } = ssrcs();
    const samples = createSamples({
      count: 6,
      streams: [{
        ssrc: A, receivedFps: 30, decodedFps: 6, decodeMsPerFrame: 20,
      }, healthy(B), healthy(C), healthy(D)],
    });

    expect(runDetector(new VideoDecoderIssueDetector(), samples)).to.deep.eq(emptyResults(6));
  });

  it('keeps affectedStreamsPercentThreshold effective', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({ count: 6, streams: [overloaded(A), overloaded(B), overloaded(C)] });
    const detector = new VideoDecoderIssueDetector({ affectedStreamsPercentThreshold: 100 });

    expect(runDetector(detector, samples)).to.deep.eq(emptyResults(6));
  });

  it('needs five samples', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({ count: 4, streams: [overloaded(A), overloaded(B), overloaded(C)] });

    expect(runDetector(new VideoDecoderIssueDetector(), samples)).to.deep.eq(emptyResults(4));
  });

  it('needs the window to span minWindowMs', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({
      count: 6, intervalMs: 1000, streams: [overloaded(A), overloaded(B), overloaded(C)],
    });

    expect(runDetector(new VideoDecoderIssueDetector(), samples)).to.deep.eq(emptyResults(6));
  });

  it('evaluates a fast poll interval when the storage is large enough', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({
      count: 20, intervalMs: 1000, streams: [overloaded(A), overloaded(B), overloaded(C)],
    });
    const detector = new VideoDecoderIssueDetector({ maxParsedStatsStorageSize: 20 });

    const results = runDetector(detector, samples);

    const allFps = Array.from({ length: 15 }, () => 18);
    const entries = [overloadedEntry(A, allFps), overloadedEntry(B, allFps), overloadedEntry(C, allFps)];
    expect(results.slice(0, 15)).to.deep.eq(emptyResults(15));
    expect(results[15]).to.deep.eq([issueWith({
      decodeDemand: 1.8,
      frameShortfallPct: 40,
      windowMs: 15000,
      affectedStreamsPercent: 100,
      evaluatedStreams: entries,
      throttledStreams: entries,
      throtthedStreams: entries,
    })]);
    expect(results.slice(16)).to.deep.eq(emptyResults(4));
  });

  it('skips streams without totalDecodeTime', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({
      count: 6,
      streams: [A, B, C].map((ssrc) => ({ ...overloaded(ssrc), omit: ['totalDecodeTime'] })),
    });

    expect(runDetector(new VideoDecoderIssueDetector(), samples)).to.deep.eq(emptyResults(6));
  });

  it('skips a stream whose counters reset below the oldest sample', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({
      count: 6,
      streams: [{ ...overloaded(A), resetAtSample: 3, newIdAtSample: 3 }, overloaded(B), overloaded(C)],
    });

    expectFiresWithTwoStreams(runDetector(new VideoDecoderIssueDetector(), samples), B, C);
  });

  it('skips a stream whose counters reset and regrow past the oldest sample', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({
      count: 6,
      baseline: {
        framesReceived: 100, framesDecoded: 100, totalDecodeTime: 1, packetsReceived: 200,
      },
      streams: [{ ...overloaded(A), resetAtSample: 1 }, overloaded(B), overloaded(C)],
    });

    expectFiresWithTwoStreams(runDetector(new VideoDecoderIssueDetector(), samples), B, C);
  });

  it('accepts the deprecated volatilityThreshold', () => {
    const {
      A, B, C, D,
    } = ssrcs();
    const samples = createSamples({
      count: 6,
      streams: [A, B, C, D].map((ssrc) => ({ ssrc, receivedFps: 30, decodeMsPerFrame: 10 })),
    });
    const detector = new VideoDecoderIssueDetector({ volatilityThreshold: 1 });

    expect(runDetector(detector, samples)).to.deep.eq(emptyResults(6));
  });

  it('respects a custom demand threshold', () => {
    const { A, B, C } = ssrcs();
    const samples = createSamples({ count: 6, streams: [overloaded(A), overloaded(B), overloaded(C)] });
    const detector = new VideoDecoderIssueDetector({ decodeDemandThreshold: 2 });

    expect(runDetector(detector, samples)).to.deep.eq(emptyResults(6));
  });
});
