const { createAgentChat } = require('./gemini');
const { toolFunctions } = require('./tools');

const MAX_STEPS = 10;

/**
 * Run the multi-step agent loop: send user query to Gemini, execute tool calls,
 * feed results back, and repeat until the LLM produces a final text answer.
 * Returns the full execution trace, chart-ready data, and a summary.
 */
async function runAgentLoop(userQuery) {
  const trace = [];
  let chartData = null;
  let step = 0;

  const chat = createAgentChat();

  step++;
  trace.push({
    step,
    type: 'user_query',
    summary: `User query: "${userQuery}"`,
  });

  let result;
  try {
    result = await chat.sendMessage(userQuery);
  } catch (err) {
    trace.push({ step: ++step, type: 'error', summary: `Gemini API error: ${err.message}` });
    return { trace, chartData: null, summary: 'Failed to communicate with the AI model.' };
  }

  while (step < MAX_STEPS) {
    const response = result.response;
    const functionCalls = response.functionCalls();

    if (!functionCalls || functionCalls.length === 0) {
      const finalText = response.text();
      step++;
      trace.push({
        step,
        type: 'final_answer',
        summary: finalText,
      });

      chartData = buildChartData(trace);
      return { trace, chartData, summary: finalText };
    }

    const functionResponses = [];

    for (const call of functionCalls) {
      step++;
      trace.push({
        step,
        type: 'llm_decision',
        summary: `Agent decided to call tool: ${call.name}`,
        toolName: call.name,
        toolInput: summarizeInput(call.args),
      });

      const toolFn = toolFunctions[call.name];
      let toolResult;

      if (!toolFn) {
        toolResult = { success: false, error: `Unknown tool: ${call.name}` };
      } else {
        try {
          toolResult = await toolFn(call.args);
        } catch (err) {
          toolResult = { success: false, error: `Tool execution error: ${err.message}` };
        }
      }

      step++;
      trace.push({
        step,
        type: 'tool_result',
        toolName: call.name,
        summary: summarizeToolResult(call.name, toolResult),
        data: toolResult,
      });

      functionResponses.push({
        functionResponse: {
          name: call.name,
          response: toolResult,
        },
      });
    }

    try {
      result = await chat.sendMessage(functionResponses);
    } catch (err) {
      trace.push({ step: ++step, type: 'error', summary: `Gemini API error: ${err.message}` });
      chartData = buildChartData(trace);
      return { trace, chartData, summary: 'Agent loop interrupted by an API error.' };
    }
  }

  trace.push({
    step: ++step,
    type: 'error',
    summary: 'Maximum agent steps reached. Returning partial results.',
  });
  chartData = buildChartData(trace);
  return { trace, chartData, summary: 'Analysis incomplete — max steps reached.' };
}

/**
 * Produce a concise summary of a tool input, truncating large arrays.
 */
function summarizeInput(args) {
  const summary = {};
  for (const [key, value] of Object.entries(args)) {
    if (Array.isArray(value) && value.length > 3) {
      summary[key] = `[Array of ${value.length} items]`;
    } else {
      summary[key] = value;
    }
  }
  return summary;
}

/**
 * Produce a human-readable summary of a tool result.
 */
function summarizeToolResult(toolName, result) {
  if (!result.success && result.error) {
    return `Error: ${result.error}`;
  }

  switch (toolName) {
    case 'fetchIntradayCandles':
      return `Fetched ${result.candleCount} candles for ${result.symbol} (${result.interval}) from ${result.timeRange?.from || 'N/A'} to ${result.timeRange?.to || 'N/A'}`;
    case 'detectSwingHighLow':
      return `Swing High: ${result.swingHigh?.price} at ${result.swingHigh?.timestamp || 'N/A'}, Swing Low: ${result.swingLow?.price} at ${result.swingLow?.timestamp || 'N/A'}, ${result.pivotCount} pivots detected`;
    case 'calculateFibonacciLevels':
      return `Fibonacci levels from ${result.swingLow} to ${result.swingHigh}: ${result.levels?.map(l => `${l.label}=${l.price}`).join(', ')}`;
    default:
      return JSON.stringify(result).substring(0, 200);
  }
}

/**
 * Extract chart-ready data from the execution trace.
 */
function buildChartData(trace) {
  let candles = null;
  let fibLevels = null;
  let swingPoints = null;

  for (const item of trace) {
    if (item.type !== 'tool_result' || !item.data) continue;

    if (item.toolName === 'fetchIntradayCandles' && item.data.success) {
      candles = item.data.candles;
    }
    if (item.toolName === 'detectSwingHighLow' && item.data.success) {
      swingPoints = {
        high: item.data.swingHigh,
        low: item.data.swingLow,
        pivots: item.data.pivots,
      };
    }
    if (item.toolName === 'calculateFibonacciLevels' && item.data.success) {
      fibLevels = item.data.levels;
    }
  }

  if (!candles) return null;
  return { candles, fibLevels, swingPoints };
}

module.exports = { runAgentLoop };
