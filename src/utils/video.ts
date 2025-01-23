import { WebRTCStatsParsed } from '../types';

export const isSvcSpatialLayerChanged = (ssrc: number, allProcessedStats: WebRTCStatsParsed[]): boolean => {
  for (let i = 1; i < allProcessedStats.length; i += 1) {
    const videoStreamStats = allProcessedStats[i].video.inbound.find(
      (stream) => stream.ssrc === ssrc,
    );

    if (!videoStreamStats) {
      continue;
    }

    const prevVideoStreamStats = allProcessedStats[i - 1].video.inbound.find(
      (stream) => stream.ssrc === ssrc,
    );

    const widthChanged = videoStreamStats.frameWidth !== prevVideoStreamStats?.frameWidth;
    const heightChanged = videoStreamStats.frameHeight !== prevVideoStreamStats?.frameHeight;
    if (widthChanged || heightChanged) {
      return true;
    }
  }

  return false;
};
