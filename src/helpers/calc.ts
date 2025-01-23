export const calculateMean = (values: number[]) => values.reduce((acc, val) => acc + val, 0) / values.length;

export const calculateVolatility = (values: number[]) => {
  if (values.length === 0) {
    throw new Error('Cannot calculate volatility for empty array');
  }

  const mean = calculateMean(values);
  const meanAbsoluteDeviationFps = values.reduce((acc, val) => acc + Math.abs(val - mean), 0) / values.length;
  return (meanAbsoluteDeviationFps * 100) / mean;
};
