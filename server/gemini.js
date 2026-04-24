const { GoogleGenerativeAI } = require('@google/generative-ai');
const { SYSTEM_PROMPT } = require('./prompts/systemPrompt');
const { toolDeclarations } = require('./tools');

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY environment variable is required. Copy .env.example to .env and add your key.');
}

const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Create a new Gemini chat session configured with the agent system prompt and tools.
 * Each call starts a fresh conversation with full function-calling support.
 */
function createAgentChat() {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ functionDeclarations: toolDeclarations }],
  });

  return model.startChat();
}

module.exports = { createAgentChat };
