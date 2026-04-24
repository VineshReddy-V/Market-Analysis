
# Chrome Agentic AI Plugin — Lightweight Build Spec

## 1) Project Goal
Build a **lightweight Chrome extension** that demonstrates **agentic AI behavior** for an academic assignment.

The extension should accept a natural-language request such as:

- “Fetch 1-minute candles for NIFTY and draw Fibonacci levels.”
- “Analyze intraday candles for RELIANCE and show technical levels on a chart.”
- “Get 1-minute candle data, calculate derived markers, and visualize them.”

The extension must then:

1. Send the user request to **Gemini Free API**.
2. Let the LLM decide which tool(s) to call.
3. Call custom tools one by one.
4. Feed the tool results back to the LLM with **all prior context preserved**.
5. Show the **step-by-step reasoning trace** (as a safe execution log / decision summary, not hidden internal raw chain-of-thought).
6. Render the final output as a **candlestick chart with overlays**.

This is **not** a trading bot and **not** financial advice. It is an educational demo of a **tool-using LLM agent**.

---

## 2) Assignment Alignment
The implementation must clearly satisfy the assignment conditions:

### A. Multi-step agent loop
The system should follow a pattern like:

User Query → LLM decides next action → Tool call → Tool result → LLM decides next action → Tool call → Tool result → Final explanation + chart

### B. Full conversational memory
Every new LLM call must include:

- original user request
- prior LLM responses / decision summaries
- prior tool calls
- prior tool results
- current working state

Do **not** treat each step as independent.

### C. Visible tool-use trace
The UI must show:

- Step number
- Agent decision summary
- Tool name
- Tool input summary
- Tool result summary
- Final synthesized explanation

### D. At least 3 custom tools
Use at least 3 custom tools relevant to this project.

### E. Gemini Free API
Use Gemini Free API for the LLM orchestration layer.

---

## 3) Product Scope (Keep It Lightweight)
### Build this
A **minimal but complete demo** with:

- Chrome extension UI (popup or side panel)
- one input box for user query
- one run/analyze button
- reasoning/tool trace panel
- candlestick chart output area
- 3+ tools
- Gemini-powered agent loop
- simple error states

### Do NOT build
Keep scope intentionally small. Avoid:

- user authentication
- databases
- websocket streaming
- background schedulers
- real broker integrations
- order placement
- portfolio management
- notifications/Telegram/email
- advanced options-chain analytics unless feasible with available data
- heavy backend infrastructure unless absolutely necessary
- full TradingView embedding if it complicates setup

### Design principle
The project should be easy for a coding agent to finish in a short implementation cycle.

---

## 4) Recommended Lightweight Architecture
Use a **simple 2-part architecture**:

### Part 1: Chrome Extension Frontend
Responsibilities:
- collect user prompt
- show reasoning trace
- trigger agent run
- display chart
- display final summary

Suggested pieces:
- popup or side panel UI
- local state for execution trace
- minimal styling

### Part 2: Lightweight Local/Server Backend
Responsibilities:
- call Gemini API
- run tool functions
- maintain the agent loop
- prepare chart-ready JSON

Why backend is recommended:
- keeps API keys out of the extension
- simplifies tool orchestration
- allows clean agent loop

### Keep backend lightweight
A small Node.js/Express server is enough.

Do not over-engineer. One server file + tool modules is acceptable.

---

## 5) Technology Recommendations
These are suggestions, not strict requirements.

### Frontend / Extension
- Chrome Extension Manifest V3
- Plain HTML/CSS/JS or very light React if truly needed
- Prefer simple JavaScript over heavy framework setup

### Backend
- Node.js + Express
- Fetch/Axios for API calls
- Gemini Free API client or simple HTTP calls

### Charting
Choose the lightest feasible option:

**Preferred:** browser-based chart library that supports candlesticks and overlays inside the extension UI or a local page.

Avoid a complex Streamlit dependency unless necessary. If charting in the extension is too cumbersome, a fallback is:
- backend prepares data
- frontend renders a lightweight chart

### Important note on Streamlit
Only use Streamlit if it clearly helps the demo and does not turn the project into “mainly a Streamlit app.”
The **Chrome extension must remain the primary interface**.

---

## 6) Functional Features
## 6.1 User Flow
1. User opens extension.
2. User types a prompt like:
   - “Fetch 1-minute candles for NIFTY and draw Fibonacci levels.”
3. User clicks Analyze.
4. Extension sends request to backend agent endpoint.
5. Backend starts agent loop.
6. Extension progressively receives or fetches:
   - execution steps
   - tool results
   - final chart data
   - final explanation
7. UI renders trace and chart.

---

## 6.2 Minimum Tool Set (3+ tools)
Implement at least these tools:

### Tool 1: fetchIntradayCandles
Purpose:
- fetch recent 1-minute OHLC candle data for a stock or index

Input:
- symbol
- market/index name if needed
- interval (default 1m)
- lookback window

Output:
- normalized candle array with timestamp, open, high, low, close, volume if available

### Tool 2: calculateFibonacciLevels
Purpose:
- compute Fibonacci retracement levels from selected high and low

Input:
- candles OR explicit swing high + swing low

Output:
- levels such as 23.6%, 38.2%, 50%, 61.8%, 78.6%

### Tool 3: detectSwingHighLow OR identifySupportResistance
Purpose:
- derive the meaningful anchor points needed for Fibonacci

Input:
- candle array

Output:
- swing high, swing low, timestamps, optional local pivots

### Optional Tool 4: calculateGreeks
Purpose:
- calculate delta/gamma **only if valid inputs are available**

Important feasibility rule:
Do **not** fake Greeks from candle data alone.
Greeks require option-specific inputs such as:
- underlying price
- strike
- expiry
- implied volatility
- option type
- time to expiry
- risk-free rate (or default assumption if explicitly documented)

If those inputs are unavailable, the agent should:
- either ask the user for required option parameters,
- or skip Greeks with a clear message.

### Optional Tool 5: prepareChartPayload
Purpose:
- combine candles + markers + Fibonacci levels into a single output payload for the frontend chart

---

## 7) Feasibility Rules (Very Important)
The coding agent must follow these rules to keep the project realistic and shippable.

### Rule 1: No fake real-time intelligence
Do not claim live or exact market analysis unless data is actually fetched from an API.

### Rule 2: Do not compute Greeks from candles only
Candlestick data alone is insufficient for meaningful delta/gamma.
If an options data source is not available, keep Greeks as an optional or user-supplied feature.

### Rule 3: Prefer deterministic calculations
Fibonacci, swing points, support/resistance are feasible from candle data.
Use the LLM for orchestration and explanation, not numerical guesswork.

### Rule 4: Keep the agent loop inspectable
Every step must be serializable as JSON and visible in the UI.

### Rule 5: Avoid hidden complexity
No need for:
- distributed systems
- message queues
- persistent memory databases
- multi-user architecture

### Rule 6: Fail gracefully
If data fetch fails or symbol is invalid, show an error in the trace and final response.

---

## 8) Agent Behavior Design
The agent should behave like a **planner + tool orchestrator**.

### Agent responsibilities
- interpret user intent
- decide which tool to call next
- read tool result
- decide whether another tool is needed
- produce a final explanation grounded in tool results

### Agent should NOT
- fabricate prices
- fabricate chart levels
- pretend Greeks exist when required inputs are absent
- give trading advice or buy/sell recommendations

### Execution pattern
For each step, the backend should maintain a trace item with fields like:
- step number
- type (`llm_decision`, `tool_call`, `tool_result`, `final_answer`, `error`)
- summary text
- raw structured payload if useful

This trace can be directly rendered in the UI.

---

## 9) Suggested Prompting Strategy for Gemini
Use Gemini to do these tasks:

1. Parse the user request into structured intent.
2. Decide the next tool.
3. Interpret tool outputs.
4. Decide whether enough information exists.
5. Generate a concise final explanation.

### Important prompt rules
- Instruct Gemini to respond with structured JSON when selecting tools.
- Include full conversation history and all prior tool outputs in each turn.
- Ask for “decision summary” rather than revealing hidden private reasoning.
- Force the model to choose among allowed tools only.
- Require it to state when data is insufficient.

### Good agent policy
Gemini should output something like:
- current goal
- selected tool
- reason summary
- tool arguments
- stop/continue flag

---

## 10) UI Requirements
The UI should have 3 simple sections.

### Section A: Query input
- text area
- Analyze button
- optional examples below input

### Section B: Agent trace
Display each step as a card/list item:
- Step 1: decision summary
- Step 2: tool call
- Step 3: tool result
- etc.

This trace is a key grading point.

### Section C: Final output
Show:
- candlestick chart
- Fibonacci overlays
- swing markers
- optional Greek markers if available
- concise written summary

### UX constraints
Keep it clean and minimal.
Do not spend time on fancy animations.

---

## 11) Chart Requirements
The final chart should include, where feasible:

- candlesticks
- detected swing high / low markers
- horizontal Fibonacci retracement lines
- optional labels on important levels
- optional annotations for delta/gamma only if truly computed

### Keep charting practical
The goal is not to fully recreate TradingView.
The goal is to show a **TradingView-like analyst visualization** that is good enough for the demo.

A simplified chart is acceptable if:
- candlesticks render correctly
- overlays are visible
- labels are understandable

---

## 12) API/Data Strategy
Choose **one reliable candle data source** that is realistic for the assignment.

### Data layer expectations
- normalize API responses into one internal candle format
- handle symbol mapping carefully
- document supported symbols/markets clearly

### If a data source is limited
The app should clearly say:
- which symbols are supported
- whether equities, indices, or only a demo set are supported

### Good fallback behavior
If live data is difficult, support:
- delayed data
- demo-compatible symbols
- or a documented mock mode only for UI development

But the final build should prefer real API data if possible.

---

## 13) Non-Goals / Explicit Exclusions
The coding agent must avoid implementing the following unless specifically required later:

- automated trade execution
- investment advice
- “best stock to buy” suggestions
- P&L forecasting
- predictive price targets
- sentiment trading engine
- account login or secrets sync
- production deployment hardening
- cloud-native microservices

This is a course assignment demo, not a fintech product.

---

## 14) Suggested Folder Structure
The exact structure can vary, but keep it simple and readable.

Recommended high-level organization:

- `extension/` → Chrome extension UI and manifest
- `server/` → backend API and agent loop
- `server/tools/` → custom tool functions
- `server/prompts/` → Gemini system/developer prompts
- `shared/` → common types or schemas if needed
- `README.md` → setup, architecture, demo usage

Do not create unnecessary folders.

---

## 15) Minimum Deliverables
The finished project should include:

1. A working Chrome extension UI
2. Gemini-powered multi-step tool orchestration
3. At least 3 custom tools
4. Full visible trace of tool use and agent decisions
5. A chart rendered from fetched/processed data
6. A concise README explaining setup and demo flow

---

## 16) README Expectations
The coding agent should generate a README from this spec.
The README should include:

- project overview
- assignment alignment
- architecture summary
- tool descriptions
- setup instructions
- how to get Gemini API key
- how to load Chrome extension locally
- how to run backend
- sample prompts
- known limitations
- screenshots/gif placeholders

### Important README note
Be honest about limitations, especially around Greeks and live data availability.

---

## 17) Suggested Demo Scenario
Use one clean demo path such as:

**Prompt:**
“Fetch 1-minute candles for NIFTY, detect swing high/low, calculate Fibonacci retracement levels, and show them on a candlestick chart.”

### Why this is a good demo
- fully feasible
- clearly multi-step
- requires external data
- shows at least 3 tools
- produces a visual result
- easy to explain in viva/demo

### Optional advanced demo
If options inputs are available:
“Using these option parameters, calculate delta and gamma and annotate the chart.”

But do not make Greeks mandatory if reliable inputs are missing.

---

## 18) Acceptance Criteria
The build is successful if:

- the extension accepts a natural language request
- Gemini is called multiple times during one run
- tool calls are visible in order
- all previous steps are preserved in subsequent LLM calls
- at least 3 tools are implemented
- a candle chart with overlays is rendered
- errors are handled clearly
- the app remains lightweight and understandable

---

## 19) Implementation Priorities
Build in this order:

### Phase 1
- backend skeleton
- Gemini call wrapper
- one hardcoded tool test
- trace structure

### Phase 2
- candle fetch tool
- swing detection tool
- Fibonacci tool
- end-to-end agent loop

### Phase 3
- Chrome extension UI
- trace rendering
- chart rendering

### Phase 4
- polish
- README
- optional Greeks support if feasible

If time is limited, prioritize a robust 3-tool demo over ambitious extra features.

---

## 20) Final Guidance to the Coding Agent
Build the smallest version that clearly demonstrates:

- multi-step LLM orchestration
- external tool usage
- visible execution trace
- chart-based output

Prefer correctness, simplicity, and transparency over feature count.

If a feature is technically weak or data is unavailable, explicitly limit the scope rather than inventing behavior.

The final result should look like a serious academic demo of an **agentic AI Chrome extension for market-data visualization**, not a production trading platform.
