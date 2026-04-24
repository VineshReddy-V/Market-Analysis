/**
 * Detect swing high and swing low points from OHLC candles using a sliding window.
 * A swing high is a candle whose high is greater than the highs of all candles
 * within `windowSize` positions on each side. Swing low is the inverse.
 */
function detectSwingHighLow({ candles, windowSize = 5 }) {
  if (!candles || candles.length < windowSize * 2 + 1) {
    return {
      success: false,
      error: `Need at least ${windowSize * 2 + 1} candles for swing detection with window size ${windowSize}`,
      swingHigh: null,
      swingLow: null,
      pivots: [],
    };
  }

  const pivots = [];

  for (let i = windowSize; i < candles.length - windowSize; i++) {
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = 1; j <= windowSize; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
        isSwingHigh = false;
      }
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
        isSwingLow = false;
      }
    }

    if (isSwingHigh) {
      pivots.push({
        type: 'high',
        price: candles[i].high,
        timestamp: candles[i].timestamp,
        index: i,
      });
    }
    if (isSwingLow) {
      pivots.push({
        type: 'low',
        price: candles[i].low,
        timestamp: candles[i].timestamp,
        index: i,
      });
    }
  }

  const swingHighs = pivots.filter(p => p.type === 'high');
  const swingLows = pivots.filter(p => p.type === 'low');

  // Pick the most significant (highest high, lowest low)
  const swingHigh = swingHighs.length > 0
    ? swingHighs.reduce((max, p) => (p.price > max.price ? p : max))
    : { price: Math.max(...candles.map(c => c.high)), timestamp: candles[0].timestamp, type: 'high' };

  const swingLow = swingLows.length > 0
    ? swingLows.reduce((min, p) => (p.price < min.price ? p : min))
    : { price: Math.min(...candles.map(c => c.low)), timestamp: candles[candles.length - 1].timestamp, type: 'low' };

  return {
    success: true,
    swingHigh: {
      price: swingHigh.price,
      timestamp: swingHigh.timestamp,
    },
    swingLow: {
      price: swingLow.price,
      timestamp: swingLow.timestamp,
    },
    pivotCount: pivots.length,
    pivots: pivots.slice(0, 20),
  };
}

module.exports = { detectSwingHighLow };
