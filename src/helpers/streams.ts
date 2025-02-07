import { WebRTCStatsParsedWithNetworkScores } from '../types';

export const isDtxLikeBehavior = (
  ssrc: number,
  allProcessedStats: WebRTCStatsParsedWithNetworkScores[],
  stdDevThreshold = 30,
): boolean => {
  const frameIntervals: number[] = [];
  for (let i = 0; i < allProcessedStats.length - 1; i += 1) {
    const videoStreamStats = allProcessedStats[i].video.inbound.find(
      (stream) => stream.ssrc === ssrc,
    );

    const previousVideoStreamStats = allProcessedStats[i - 1]?.video?.inbound?.find(
      (stream) => stream.ssrc === ssrc,
    );

    if (!videoStreamStats || !previousVideoStreamStats) {
      continue;
    }

    const deltaTime = videoStreamStats.timestamp - previousVideoStreamStats.timestamp;
    const deltaFrames = videoStreamStats.framesDecoded - previousVideoStreamStats.framesDecoded;

    if (deltaFrames > 0) {
      const frameInterval = deltaTime / deltaFrames; // Average time per frame
      frameIntervals.push(frameInterval);
    }
  }

  if (frameIntervals.length <= 1) {
    return false;
  }

  const mean = frameIntervals.reduce((a, b) => a + b, 0) / frameIntervals.length;
  const variance = frameIntervals
    .reduce((sum, val) => sum + (val - mean) ** 2, 0) / frameIntervals.length;
  const stdDev = Math.sqrt(variance);
  return stdDev > stdDevThreshold;
};
