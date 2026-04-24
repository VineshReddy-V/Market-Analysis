const yahooFinance = require('yahoo-finance2').default;

const SYMBOL_MAP = {
  'NIFTY': '^NSEI',
  'NIFTY50': '^NSEI',
  'NIFTY 50': '^NSEI',
  'BANKNIFTY': '^NSEBANK',
  'BANK NIFTY': '^NSEBANK',
  'RELIANCE': 'RELIANCE.NS',
  'TCS': 'TCS.NS',
  'INFY': 'INFY.NS',
  'INFOSYS': 'INFY.NS',
  'HDFC': 'HDFCBANK.NS',
  'HDFCBANK': 'HDFCBANK.NS',
  'ICICIBANK': 'ICICIBANK.NS',
  'SBIN': 'SBIN.NS',
  'ITC': 'ITC.NS',
  'WIPRO': 'WIPRO.NS',
  'TATAMOTORS': 'TATAMOTORS.NS',
  'BHARTIARTL': 'BHARTIARTL.NS',
  'AAPL': 'AAPL',
  'MSFT': 'MSFT',
  'GOOGL': 'GOOGL',
  'AMZN': 'AMZN',
  'TSLA': 'TSLA',
  'SPY': 'SPY',
  'SPX': '^GSPC',
};

/**
 * Resolve a user-friendly symbol name to a Yahoo Finance ticker.
 */
function resolveSymbol(input) {
  const upper = input.toUpperCase().trim();
  if (SYMBOL_MAP[upper]) return SYMBOL_MAP[upper];
  if (upper.includes('.') || upper.startsWith('^')) return upper;
  return `${upper}.NS`;
}

/**
 * Fetch recent intraday OHLC candle data for a stock or index via Yahoo Finance.
 */
async function fetchIntradayCandles({ symbol, interval = '1m', lookbackDays = 1 }) {
  const yahooSymbol = resolveSymbol(symbol);

  const maxDays = interval === '1m' ? 7 : interval === '5m' ? 60 : 365;
  const days = Math.min(lookbackDays || 1, maxDays);

  const now = new Date();
  const period1 = new Date(now);
  period1.setDate(period1.getDate() - days);

  try {
    const result = await yahooFinance.chart(yahooSymbol, {
      period1,
      period2: now,
      interval,
    });

    if (!result.quotes || result.quotes.length === 0) {
      return {
        success: false,
        error: `No candle data returned for ${symbol} (${yahooSymbol}). Market may be closed or symbol invalid.`,
        symbol: yahooSymbol,
        candles: [],
      };
    }

    const candles = result.quotes
      .filter(q => q.open != null && q.high != null && q.low != null && q.close != null)
      .map(q => ({
        timestamp: q.date.toISOString(),
        open: parseFloat(q.open.toFixed(2)),
        high: parseFloat(q.high.toFixed(2)),
        low: parseFloat(q.low.toFixed(2)),
        close: parseFloat(q.close.toFixed(2)),
        volume: q.volume || 0,
      }));

    return {
      success: true,
      symbol: yahooSymbol,
      originalSymbol: symbol,
      interval,
      candleCount: candles.length,
      timeRange: {
        from: candles[0]?.timestamp,
        to: candles[candles.length - 1]?.timestamp,
      },
      candles,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch data for ${symbol} (${yahooSymbol}): ${err.message}`,
      symbol: yahooSymbol,
      candles: [],
    };
  }
}

module.exports = { fetchIntradayCandles };
