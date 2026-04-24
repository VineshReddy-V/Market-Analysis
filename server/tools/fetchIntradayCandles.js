const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

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

  const p1 = Math.floor(period1.getTime() / 1000);
  const p2 = Math.floor(now.getTime() / 1000);
  const url = `${YAHOO_CHART_URL}/${encodeURIComponent(yahooSymbol)}?period1=${p1}&period2=${p2}&interval=${interval}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) {
      return {
        success: false,
        error: `Yahoo Finance returned HTTP ${res.status} for ${symbol} (${yahooSymbol}).`,
        symbol: yahooSymbol,
        candles: [],
      };
    }

    const json = await res.json();
    const chartResult = json.chart?.result?.[0];

    if (!chartResult) {
      return {
        success: false,
        error: `No candle data returned for ${symbol} (${yahooSymbol}). Market may be closed or symbol invalid.`,
        symbol: yahooSymbol,
        candles: [],
      };
    }

    const timestamps = chartResult.timestamp || [];
    const quote = chartResult.indicators?.quote?.[0] || {};
    const opens = quote.open || [];
    const highs = quote.high || [];
    const lows = quote.low || [];
    const closes = quote.close || [];
    const volumes = quote.volume || [];

    const candles = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (opens[i] == null || highs[i] == null || lows[i] == null || closes[i] == null) continue;
      candles.push({
        timestamp: new Date(timestamps[i] * 1000).toISOString(),
        open: parseFloat(opens[i].toFixed(2)),
        high: parseFloat(highs[i].toFixed(2)),
        low: parseFloat(lows[i].toFixed(2)),
        close: parseFloat(closes[i].toFixed(2)),
        volume: volumes[i] || 0,
      });
    }

    if (candles.length === 0) {
      return {
        success: false,
        error: `No valid candle data for ${symbol} (${yahooSymbol}). Market may be closed.`,
        symbol: yahooSymbol,
        candles: [],
      };
    }

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
