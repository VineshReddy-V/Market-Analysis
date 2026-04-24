
# Prompt for Coding Assistant

You are building a **lightweight, working academic demo** based on the attached Markdown specification.

## Your task
Read the provided `.md` spec carefully and implement the project end-to-end.

## High-level expectations
- Build a **Chrome Extension (Manifest V3)** as the main user interface.
- Use **Gemini Free API** for the LLM agent loop.
- Build a **lightweight backend** (preferred: Node.js + Express) for tool orchestration and API security.
- Implement at least **3 custom tools**.
- Preserve **all prior context** across LLM turns.
- Show a **visible execution trace** in the UI.
- Render a **candlestick chart with overlays**.
- Keep the architecture lightweight and easy to run locally.

## Very important constraints
1. Do **not** over-engineer.
2. Do **not** build unnecessary features like auth, DB, or broker integrations.
3. Do **not** fake live data or compute Greeks from candle data alone.
4. If Greeks are not realistically feasible, make them optional and document the limitation clearly.
5. The Chrome extension must remain the main interface, even if a helper local page is used for charting.
6. Prefer a small, readable codebase over a complex “enterprise” structure.

## What I want from you
Please do the following in order:

1. Read the attached spec fully.
2. Propose a concise implementation plan.
3. Create the project structure.
4. Implement the backend agent loop.
5. Implement the required tool functions.
6. Implement the Chrome extension UI.
7. Implement trace rendering.
8. Implement the chart output.
9. Create a clean README based on the spec.
10. Clearly document any limitations or assumptions.

## Output expectations while building
As you build, be explicit about:
- which files you are creating
- why each part exists
- what is feasible vs intentionally skipped
- any dependency choices

## Priority order
If trade-offs are needed, prioritize:
1. End-to-end working agent loop
2. Visible tool trace
3. 3 solid tools
4. Candlestick chart with Fibonacci overlays
5. Nice-to-have polish

## Final quality bar
The finished result should feel like a convincing course-assignment demo of an **agentic AI plugin**, not just a chatbot wrapper.

Use the attached Markdown as the source of truth for scope and architecture.
