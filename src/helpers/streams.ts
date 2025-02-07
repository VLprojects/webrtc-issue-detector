import { WebRTCStatsParsedWithNetworkScores } from '../types';
import { calculateStandardDeviation } from './calc';

export const isDtxLikeBehavior = (
  ssrc: number,
  allProcessedStats: WebRTCStatsParsedWithNetworkScores[],
  stdDevThreshold = 30,
): boolean => {
  const frameIntervals: number[] = [];
  for (let i = 1; i < allProcessedStats.length - 1; i += 1) {
    const videoStreamStats = allProcessedStats[i]?.video?.inbound.find(
      (stream) => stream.ssrc === ssrc,
    );

    if (!videoStreamStats) {
      continue;
    }

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

  const stdDev = calculateStandardDeviation(frameIntervals);
  return stdDev > stdDevThreshold;
};
