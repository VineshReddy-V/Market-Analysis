const { fetchIntradayCandles } = require('./fetchIntradayCandles');
const { detectSwingHighLow } = require('./detectSwingHighLow');
const { calculateFibonacciLevels } = require('./calculateFibonacciLevels');

/**
 * Gemini function declarations — defines the tools the LLM can call.
 */
const toolDeclarations = [
  {
    name: 'fetchIntradayCandles',
    description:
      'Fetch recent intraday OHLC candle data for a stock or index. Supports Indian markets (NSE: NIFTY, RELIANCE, TCS, etc.) and major US symbols (AAPL, MSFT, SPY, etc.).',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description:
            'Stock/index symbol, e.g. NIFTY, RELIANCE, BANKNIFTY, TCS, INFY, AAPL, MSFT',
        },
        interval: {
          type: 'string',
          description: 'Candle interval. Options: 1m, 5m, 15m, 1h, 1d. Default: 1m',
          enum: ['1m', '5m', '15m', '1h', '1d'],
        },
        lookbackDays: {
          type: 'number',
          description: 'Number of days to look back. Default: 1. Max 7 for 1m candles.',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'detectSwingHighLow',
    description:
      'Detect swing high and swing low points from an array of OHLC candles using a sliding window approach. Returns the most significant swing high/low and all detected pivots.',
    parameters: {
      type: 'object',
      properties: {
        candles: {
          type: 'array',
          description:
            'Array of candle objects with timestamp, open, high, low, close fields',
          items: {
            type: 'object',
            properties: {
              timestamp: { type: 'string' },
              open: { type: 'number' },
              high: { type: 'number' },
              low: { type: 'number' },
              close: { type: 'number' },
            },
          },
        },
        windowSize: {
          type: 'number',
          description:
            'Number of candles on each side to compare for swing detection. Default: 5',
        },
      },
      required: ['candles'],
    },
  },
  {
    name: 'calculateFibonacciLevels',
    description:
      'Calculate Fibonacci retracement levels (0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%) given a swing high and swing low price.',
    parameters: {
      type: 'object',
      properties: {
        swingHigh: {
          type: 'number',
          description: 'The swing high price',
        },
        swingLow: {
          type: 'number',
          description: 'The swing low price',
        },
      },
      required: ['swingHigh', 'swingLow'],
    },
  },
];

/**
 * Map of tool names to their implementation functions.
 */
const toolFunctions = {
  fetchIntradayCandles,
  detectSwingHighLow,
  calculateFibonacciLevels,
};

module.exports = { toolDeclarations, toolFunctions };
