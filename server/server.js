require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { runAgentLoop } = require('./agent');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/api/analyze', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid query' });
    }
    console.log(`[Agent] New request: "${query}"`);
    const result = await runAgentLoop(query);
    res.json(result);
  } catch (err) {
    console.error('[Agent] Error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Market Agent server running on http://localhost:${PORT}`);
});
