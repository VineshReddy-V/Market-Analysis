/**
 * AI Scorer - OpenAI-powered relevance scoring for articles
 * Optionally scores articles based on user's selected topics using GPT
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Score a batch of articles using OpenAI API
 * @param {Array} articles - Articles to score
 * @param {Array} topics - User's selected topics
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<Array>} Articles with aiScore field populated (0-100)
 */
export async function scoreArticles(articles, topics, apiKey) {
  if (!apiKey || !articles.length) return articles;

  const batches = chunkArray(articles, 20);
  const scored = [];

  for (const batch of batches) {
    try {
      const result = await scoreBatch(batch, topics, apiKey);
      scored.push(...result);
    } catch (err) {
      console.warn('[TechPulse AI] Scoring batch failed:', err.message);
      scored.push(...batch.map(a => ({ ...a, aiScore: null })));
    }
  }

  return scored;
}

/**
 * Score a single batch of up to 20 articles
 */
async function scoreBatch(articles, topics, apiKey) {
  const articleList = articles.map((a, i) => (
    `${i + 1}. [${a.source}] "${a.title}" - ${a.snippet || 'No description'}`
  )).join('\n');

  const topicLabels = {
    ai: 'Artificial Intelligence & Machine Learning',
    webdev: 'Web Development & Frontend/Backend',
    cloud: 'Cloud Computing & Infrastructure',
    security: 'Cybersecurity & InfoSec',
    mobile: 'Mobile Development',
    devops: 'DevOps & CI/CD',
    opensource: 'Open Source Projects',
    database: 'Databases & Data Engineering',
    blockchain: 'Blockchain & Web3',
    career: 'Tech Career & Industry'
  };

  const topicStr = topics.map(t => topicLabels[t] || t).join(', ');

  const prompt = `You are a tech news relevance scorer. Rate each article's relevance to a developer interested in: ${topicStr}.

Score each article from 0-100 where:
- 90-100: Directly relevant, breaking news, or highly impactful
- 70-89: Relevant to interests, useful to know
- 40-69: Tangentially related or general tech
- 0-39: Not relevant to these interests

Articles:
${articleList}

Respond with ONLY a JSON array of scores in order, like: [85, 72, 45, ...]`;

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  const jsonMatch = content.match(/\[[\d\s,]+\]/);
  if (!jsonMatch) {
    throw new Error('Could not parse AI scores from response');
  }

  const scores = JSON.parse(jsonMatch[0]);

  return articles.map((article, i) => ({
    ...article,
    aiScore: typeof scores[i] === 'number' ? Math.min(100, Math.max(0, scores[i])) : null
  }));
}

/**
 * Check if OpenAI API key is valid
 * @param {string} apiKey
 * @returns {Promise<boolean>}
 */
export async function validateApiKey(apiKey) {
  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "ok"' }],
        max_tokens: 5
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
