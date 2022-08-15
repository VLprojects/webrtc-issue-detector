interface WithTS {
  timestamp: number;
}

export const checkIsConnectionClosed = (
  pc: RTCPeerConnection,
): boolean => pc.iceConnectionState === 'closed' || pc.connectionState === 'closed';

export const calcValueRate = <T extends WithTS>(
  stats: T,
  prevStats: T | undefined,
  statPropName: keyof T,
): number => {
  if (!prevStats) {
    return 0;
  }

  const currentVal = stats[statPropName];
  const prevVal = prevStats[statPropName];

  if (currentVal == null || prevVal == null) {
    return 0;
  }

  // Time is in such format: 1657105307362.007 (mcs after dot)
  const timeDiffMs = (Math.floor(stats.timestamp) - Math.floor(prevStats.timestamp));

  if (timeDiffMs === 0) {
    return 0;
  }

  const valDiff = Number(currentVal) - Number(prevVal);
  return (valDiff / timeDiffMs) * 1000;
};

export const calcBitrate = <T extends WithTS>(
  stats: T,
  prevStats: T | undefined,
  statPropName: keyof T,
): number => 8 * calcValueRate(stats, prevStats, statPropName);
