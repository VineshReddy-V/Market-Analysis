/**
 * Calculate Fibonacci retracement levels given a swing high and swing low price.
 * Returns standard levels: 0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%.
 */
function calculateFibonacciLevels({ swingHigh, swingLow }) {
  if (swingHigh == null || swingLow == null) {
    return {
      success: false,
      error: 'Both swingHigh and swingLow are required',
      levels: [],
    };
  }

  if (swingHigh <= swingLow) {
    return {
      success: false,
      error: `swingHigh (${swingHigh}) must be greater than swingLow (${swingLow})`,
      levels: [],
    };
  }

  const range = swingHigh - swingLow;
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];

  const levels = ratios.map(ratio => ({
    ratio,
    label: `${(ratio * 100).toFixed(1)}%`,
    price: parseFloat((swingHigh - range * ratio).toFixed(2)),
  }));

  return {
    success: true,
    swingHigh,
    swingLow,
    range: parseFloat(range.toFixed(2)),
    levels,
  };
}

module.exports = { calculateFibonacciLevels };
