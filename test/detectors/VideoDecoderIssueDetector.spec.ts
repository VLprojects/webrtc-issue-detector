import { expect } from 'chai';
import VideoDecoderIssueDetector from '../../src/detectors/VideoDecoderIssueDetector';
import { IssueDetectorResult, ParsedInboundVideoStreamStats, WebRTCStatsParsed } from '../../src';

interface InboundStreamIterationPayload {
  ssrc: number;
  timestamp: number;
  framesPerSecond: number;
  framesReceived: number;
  framesDecoded: number;
  totalDecodeTime: number;
}

const createInboundVideoStreamStats = (
  payload: InboundStreamIterationPayload,
): ParsedInboundVideoStreamStats => ({
  ssrc: payload.ssrc,
  timestamp: payload.timestamp,
  framesPerSecond: payload.framesPerSecond,
  framesReceived: payload.framesReceived,
  framesDecoded: payload.framesDecoded,
  totalDecodeTime: payload.totalDecodeTime,
  packetsReceived: payload.framesReceived,
  packetsLost: 0,
  jitter: 0.001,
} as ParsedInboundVideoStreamStats);

const createStatsForDetector = (
  connectionId: string,
  streams: InboundStreamIterationPayload[],
): WebRTCStatsParsed => ({
  connection: {
    id: connectionId,
  },
  video: {
    inbound: streams.map((stream) => createInboundVideoStreamStats(stream)),
  },
} as WebRTCStatsParsed);

describe('wid/detectors/VideoDecoderIssueDetector', () => {
  it('should not report decoder cpu throttling from sender-side fps wobble', () => {
    const detector = new VideoDecoderIssueDetector();
    const connectionId = 'sender-fps-wobble';
    const timestamps = [0, 1000, 2000, 3000, 4000, 5000];
    const unstableFps = [30, 18, 30, 18, 30, 18];

    let ssrc1Received = 10;
    let ssrc1Decoded = 10;
    let ssrc1TotalDecodeTime = 0.05;
    let ssrc2Received = 10;
    let ssrc2Decoded = 10;
    let ssrc2TotalDecodeTime = 0.05;
    let ssrc3Received = 10;
    let ssrc3Decoded = 10;
    let ssrc3TotalDecodeTime = 0.05;
    let detectionResults: IssueDetectorResult = [];

    timestamps.forEach((timestamp, index) => {
      const ssrc1Fps = unstableFps[index];

      ssrc1Received += ssrc1Fps;
      ssrc1Decoded += ssrc1Fps;
      ssrc1TotalDecodeTime += ssrc1Fps * 0.002;
      ssrc2Received += 30;
      ssrc2Decoded += 30;
      ssrc2TotalDecodeTime += 30 * 0.002;
      ssrc3Received += 30;
      ssrc3Decoded += 30;
      ssrc3TotalDecodeTime += 30 * 0.002;

      detectionResults = detector.detect(createStatsForDetector(connectionId, [
        {
          ssrc: 101,
          timestamp,
          framesPerSecond: ssrc1Fps,
          framesReceived: ssrc1Received,
          framesDecoded: ssrc1Decoded,
          totalDecodeTime: ssrc1TotalDecodeTime,
        },
        {
          ssrc: 102,
          timestamp,
          framesPerSecond: 30,
          framesReceived: ssrc2Received,
          framesDecoded: ssrc2Decoded,
          totalDecodeTime: ssrc2TotalDecodeTime,
        },
        {
          ssrc: 103,
          timestamp,
          framesPerSecond: 30,
          framesReceived: ssrc3Received,
          framesDecoded: ssrc3Decoded,
          totalDecodeTime: ssrc3TotalDecodeTime,
        },
      ]));
    });

    expect(detectionResults).to.be.empty;
  });

  it('should report decoder cpu throttling when local decode shortfall and demand are high', () => {
    const detector = new VideoDecoderIssueDetector();
    const connectionId = 'local-decode-shortfall';
    const timestamps = [0, 1000, 2000, 3000, 4000];

    let ssrc1Received = 10;
    let ssrc1Decoded = 10;
    let ssrc1TotalDecodeTime = 0.05;
    let ssrc2Received = 10;
    let ssrc2Decoded = 10;
    let ssrc2TotalDecodeTime = 0.05;
    let ssrc3Received = 10;
    let ssrc3Decoded = 10;
    let ssrc3TotalDecodeTime = 0.05;
    let detectionResults: IssueDetectorResult = [];

    timestamps.forEach((timestamp) => {
      ssrc1Received += 30;
      ssrc1Decoded += 18;
      ssrc1TotalDecodeTime += 18 * 0.02;
      ssrc2Received += 30;
      ssrc2Decoded += 30;
      ssrc2TotalDecodeTime += 30 * 0.002;
      ssrc3Received += 30;
      ssrc3Decoded += 30;
      ssrc3TotalDecodeTime += 30 * 0.002;

      detectionResults = detector.detect(createStatsForDetector(connectionId, [
        {
          ssrc: 201,
          timestamp,
          framesPerSecond: 18,
          framesReceived: ssrc1Received,
          framesDecoded: ssrc1Decoded,
          totalDecodeTime: ssrc1TotalDecodeTime,
        },
        {
          ssrc: 202,
          timestamp,
          framesPerSecond: 30,
          framesReceived: ssrc2Received,
          framesDecoded: ssrc2Decoded,
          totalDecodeTime: ssrc2TotalDecodeTime,
        },
        {
          ssrc: 203,
          timestamp,
          framesPerSecond: 30,
          framesReceived: ssrc3Received,
          framesDecoded: ssrc3Decoded,
          totalDecodeTime: ssrc3TotalDecodeTime,
        },
      ]));
    });

    expect(detectionResults).to.have.length(1);
    expect(detectionResults[0].reason).to.equal('decoder-cpu-throttling');
    expect(detectionResults[0].statsSample?.decodeDemand).to.be.greaterThan(0.7);
    expect(detectionResults[0].statsSample?.affectedStreamsPercent).to.be.greaterThan(30);
    expect(detectionResults[0].statsSample?.throtthedStreams).to.have.length(1);
    expect((detectionResults[0].statsSample?.throtthedStreams as any[])[0].ssrc).to.equal(201);
  });
});
