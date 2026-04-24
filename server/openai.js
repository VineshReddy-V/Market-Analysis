const OpenAI = require('openai');
const { SYSTEM_PROMPT } = require('./prompts/systemPrompt');
const { openaiTools } = require('./tools');

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY environment variable is required. Copy .env.example to .env and add your key.');
}

const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const openai = new OpenAI({ apiKey });

/**
 * Send a chat completion request to OpenAI with tool definitions.
 * Callers manage the messages array (conversation history) themselves.
 */
async function chatCompletion(messages) {
  return openai.chat.completions.create({
    model,
    messages,
    tools: openaiTools,
  });
}

module.exports = { chatCompletion, SYSTEM_PROMPT, model };
