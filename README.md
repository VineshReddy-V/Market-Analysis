# Market Agent — Agentic AI Chrome Extension

A lightweight Chrome extension that demonstrates **agentic AI behavior** for market-data visualization. The extension accepts natural-language requests, uses **OpenAI** to orchestrate a multi-step tool-calling loop, and renders a candlestick chart with technical overlays.

> **Disclaimer:** This is an academic demo of a tool-using LLM agent. It is **not** a trading bot and does **not** provide financial advice.

---

## Architecture

```
User ──► Chrome Extension (popup)
              │
              │  POST /api/analyze
              ▼
         Node.js + Express Server
              │
              ├─ OpenAI Chat Completions (function calling)
              │       ▲  ▼
              │   tool calls / results
              │
              ├─ fetchIntradayCandles   (Yahoo Finance)
              ├─ detectSwingHighLow     (sliding-window algorithm)
              └─ calculateFibonacciLevels (deterministic math)
```

- **Extension** — Manifest V3 popup with query input, agent trace panel, and Canvas-based chart.
- **Backend** — Lightweight Express server that hosts the agent loop and keeps the API key secure.
- **OpenAI function calling** — conversation history is manually managed across turns so every LLM call sees all prior context.

---

## Tools

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `fetchIntradayCandles` | Fetch OHLC candle data via Yahoo Finance | symbol, interval, lookbackDays | Normalized candle array |
| `detectSwingHighLow` | Find swing high/low using a sliding window | candles, windowSize | Swing points + pivot list |
| `calculateFibonacciLevels` | Compute Fibonacci retracement levels | swingHigh, swingLow | Standard Fib levels (0–100%) |

---

## Setup

### Prerequisites
- **Node.js** v18+
- **OpenAI API key** — get one at https://platform.openai.com/api-keys
- **Chrome** or **Edge** browser

### 1. Backend

```bash
cd server
npm install

# Create .env from the example
cp .env.example .env
# Edit .env and paste your OpenAI API key
```

Start the server:

```bash
npm start
# or for auto-reload during development:
npm run dev
```

The server runs on `http://localhost:3000` by default.

### 2. Chrome Extension

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (toggle in the top-right).
3. Click **Load unpacked** and select the `extension/` folder.
4. Pin the **Market Agent** extension to the toolbar.

---

## Usage

1. Click the extension icon to open the popup.
2. Type a prompt or click an example chip, e.g.:
   - *"Fetch 1-minute candles for NIFTY, detect swing points, and calculate Fibonacci retracement levels"*
3. Click **Analyze**.
4. Watch the **Agent Trace** render each step (query, tool decisions, tool results, final answer).
5. View the **candlestick chart** with Fibonacci overlays and swing markers.
6. Read the **Summary** for a concise explanation of findings.

### Supported Symbols
- **Indian NSE:** NIFTY, BANKNIFTY, RELIANCE, TCS, INFY, HDFCBANK, SBIN, ITC, WIPRO, TATAMOTORS, etc.
- **US:** AAPL, MSFT, GOOGL, AMZN, TSLA, SPY, SPX
- Any other Yahoo Finance ticker (append `.NS` for NSE, `.BO` for BSE).

### Sample Prompts

| Prompt | Tools Used |
|--------|-----------|
| Fetch 1-minute candles for NIFTY, detect swing points, and calculate Fibonacci retracement levels | All 3 |
| Analyze 5-minute candles for RELIANCE and show Fibonacci levels | All 3 |
| Get 1-minute candle data for BANKNIFTY, calculate derived markers and visualize them | All 3 |
| Fetch daily candles for AAPL and identify swing high/low | 2 |

---

## Available OpenAI Models & Pricing

You can choose any OpenAI model that supports **function calling** by setting `OPENAI_MODEL` in your `.env` file. Below are the recommended options (prices as of early 2025):

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Notes |
|-------|----------------------|------------------------|-------|
| **gpt-4o-mini** | $0.15 | $0.60 | **Default** — cheapest with function calling, great for demos |
| **gpt-4o** | $2.50 | $10.00 | Higher quality reasoning, still fast |
| **gpt-4-turbo** | $10.00 | $30.00 | Strong reasoning, larger context window |
| **o3-mini** | $1.10 | $4.40 | Reasoning model, good for complex analysis |

> **Tip:** The default is `gpt-4o-mini` — it costs ~17× less than `gpt-4o` while still handling multi-step tool calls reliably. Switch to a bigger model only if you need higher quality summaries.

To change the model, edit `server/.env`:
```
OPENAI_MODEL=gpt-4o
```

---

## Project Structure

```
Market-Analysis/
├── extension/           Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.css
│   ├── popup.js         UI logic
│   └── chart.js         Canvas-based candlestick renderer
├── server/              Backend
│   ├── package.json
│   ├── .env.example
│   ├── server.js        Express server
│   ├── openai.js        OpenAI client setup
│   ├── agent.js         Agent loop
│   ├── tools/
│   │   ├── index.js                    Tool registry + declarations
│   │   ├── fetchIntradayCandles.js     Yahoo Finance data fetch
│   │   ├── detectSwingHighLow.js       Swing-point detection
│   │   └── calculateFibonacciLevels.js Fibonacci math
│   └── prompts/
│       └── systemPrompt.js             LLM system instruction
├── README.md
├── agentic_ai_chrome_plugin_spec.md
└── coding_agent_prompt.md
```

---

## Assignment Alignment

| Requirement | How It's Met |
|------------|--------------|
| Multi-step agent loop | OpenAI is called repeatedly; each tool result feeds back into the next LLM turn |
| Full conversational memory | Conversation history array is passed with every request so the LLM sees all prior context |
| Visible tool-use trace | Every step (decision, tool call, result, final answer) is rendered as a card in the UI |
| At least 3 custom tools | fetchIntradayCandles, detectSwingHighLow, calculateFibonacciLevels |
| OpenAI API | Uses configurable model (default `gpt-4o-mini`) via the `openai` SDK |
| Chart output | Canvas-rendered candlestick chart with Fibonacci lines and swing markers |

---

## Known Limitations

- **Market hours:** 1-minute candle data is only available for the last 7 days and only when the market has been open. If you get 0 candles, try during/after market hours or use a daily interval.
- **Greeks:** Not implemented. Computing meaningful delta/gamma requires option-specific inputs (strike, expiry, IV) that are not available from candlestick data alone. This is intentionally omitted per the spec's feasibility rules.
- **Rate limits:** Yahoo Finance may throttle requests. If fetches fail, wait a moment and retry.
- **No real-time streaming:** The backend returns the full result after the agent loop completes; there is no live-streaming of individual steps.
- **Demo scope:** This is an academic demo — not suitable for production trading use.

---

## License

Academic use only.
