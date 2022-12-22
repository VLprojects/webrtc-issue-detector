import faker from 'faker';
import { expect } from 'chai';
import VideoCodecMismatchDetector from '../../src/detectors/VideoCodecMismatchDetector';
import { ParsedInboundVideoStreamStats, WebRTCStatsParsed } from '../../src';

interface CreateStatsForDetectorTestPayload {
  connectionId?: string;
  ssrc?: number;
  decoderImplementation?: string;
  mimeType?: string;
  trackIdentifier?: string;
}

interface CreateIssueDetectorResultTestPayload {
  ssrc: number;
  trackIdentifier: string;
  mimeType: string;
  decoderImplementation: string;
}

const createInboundVideoStreamStats = (
  payload: Omit<CreateStatsForDetectorTestPayload, 'connectionId'>,
): ParsedInboundVideoStreamStats => ({
  ssrc: payload.ssrc ?? faker.datatype.number({ min: 1 }),
  decoderImplementation: payload.decoderImplementation ?? faker.lorem.slug(),
  mimeType: payload.mimeType ?? faker.system.mimeType(),
  track: {
    trackIdentifier: payload.trackIdentifier ?? faker.datatype.uuid(),
  },
} as ParsedInboundVideoStreamStats);

const createStatsForDetector = (payload: CreateStatsForDetectorTestPayload = {}): WebRTCStatsParsed => ({
  connection: {
    id: payload.connectionId ?? faker.datatype.uuid(),
  },
  video: {
    inbound: [createInboundVideoStreamStats(payload)],
  },
} as WebRTCStatsParsed);

const createIssueDetectorResult = (payload: CreateIssueDetectorResultTestPayload) => ({
  ssrc: payload.ssrc,
  trackIdentifier: payload.trackIdentifier,
  debug: `mimeType: ${payload.mimeType}, decoderImplementation: ${payload.decoderImplementation}`,
  reason: 'codec-mismatch',
  type: 'stream',
});

describe('wid/detectors/VideoCodecMismatchDetector', () => {
  const detector = new VideoCodecMismatchDetector();

  it('should detect unknown decoder on the second iteration', () => {
    const mimeType = faker.lorem.slug();
    const decoderImplementation = 'unknown';
    const ssrc = faker.datatype.number({ min: 1 });
    const trackIdentifier = faker.datatype.uuid();
    const stats = createStatsForDetector({
      ssrc,
      mimeType,
      trackIdentifier,
      decoderImplementation,
    });

    detector.detect(stats);
    const results = detector.detect(stats);

    expect(results).to.deep.eq([createIssueDetectorResult({
      ssrc,
      mimeType,
      trackIdentifier,
      decoderImplementation,
    })]);
  });

  it('should detect unknown decoders for each ssrc in stats', () => {
    const mimeType = faker.lorem.slug();
    const decoderImplementation = 'unknown';
    const trackIdentifier = faker.datatype.uuid();
    const ssrc1 = faker.datatype.number({ min: 1 });
    const ssrc2 = faker.datatype.number({ min: 1 });
    const stats = createStatsForDetector({
      ssrc: ssrc1,
      mimeType,
      trackIdentifier,
      decoderImplementation,
    });
    stats.video.inbound.push(createInboundVideoStreamStats({
      ssrc: ssrc2,
      mimeType,
      trackIdentifier,
      decoderImplementation,
    }));

    detector.detect(stats);
    const results = detector.detect(stats);

    expect(results).to.deep.eq([
      createIssueDetectorResult({
        ssrc: ssrc1,
        mimeType,
        trackIdentifier,
        decoderImplementation,
      }),
      createIssueDetectorResult({
        ssrc: ssrc2,
        mimeType,
        trackIdentifier,
        decoderImplementation,
      }),
    ]);
  });

  it('should detect decoder "degradation" after the second check', () => {
    const mimeType = faker.lorem.slug();
    const ssrc = faker.datatype.number({ min: 1 });
    const trackIdentifier = faker.datatype.uuid();
    const stats = createStatsForDetector({
      ssrc,
      mimeType,
      trackIdentifier,
    });

    const firstCheckResults = detector.detect(stats);
    const secondCheckResults = detector.detect(stats);
    stats.video.inbound[0].decoderImplementation = 'unknown';
    const checkResultsWithDegradedDecoder = detector.detect(stats);

    expect(firstCheckResults).to.be.empty;
    expect(secondCheckResults).to.be.empty;
    expect(checkResultsWithDegradedDecoder).to.deep.eq([createIssueDetectorResult({
      ssrc,
      mimeType,
      trackIdentifier,
      decoderImplementation: 'unknown',
    })]);
  });

  it('should skip unknown decoder detection on the first iteration', () => {
    const stats = createStatsForDetector({
      decoderImplementation: 'unknown',
    });

    const results = detector.detect(stats);

    expect(results).to.be.empty;
  });

  it('should skip issue detection if codec is not unknown', () => {
    const stats = createStatsForDetector();

    detector.detect(stats);
    const results = detector.detect(stats);

    expect(results).to.be.empty;
  });

  it('should skip unknown decoder detection if detected previously', () => {
    const stats = createStatsForDetector({
      decoderImplementation: 'unknown',
    });

    detector.detect(stats);
    detector.detect(stats);
    const results = detector.detect(stats);

    expect(results).to.be.empty;
  });
});
