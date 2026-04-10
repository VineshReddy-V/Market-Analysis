/**
 * TechPulse - Hacker News Source Client
 *
 * Fetches top stories from the Hacker News Firebase API and normalizes
 * them into the TechPulse article schema.
 *
 * @module sources/hackernews
 */

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';
const HN_WEB_BASE = 'https://news.ycombinator.com/item?id=';
const SOURCE_ID = 'hackernews';
const BATCH_SIZE = 30;

/**
 * Keyword-to-tag mapping for inferring tags from HN titles.
 * Keys are lowercased keywords; values are the canonical tag(s) they map to.
 */
const KEYWORD_TAG_MAP = {
  // AI / ML
  'ai':               'ai',
  'artificial intelligence': 'ai',
  'machine learning':  'ai',
  'deep learning':     'ai',
  'neural net':        'ai',
  'gpt':              'ai',
  'llm':              'ai',
  'chatgpt':          'ai',
  'openai':           'ai',
  'transformer':      'ai',
  'diffusion':        'ai',
  'generative':       'ai',
  'copilot':          'ai',
  'langchain':        'ai',

  // Web Development
  'react':            'webdev',
  'vue':              'webdev',
  'angular':          'webdev',
  'svelte':           'webdev',
  'javascript':       'webdev',
  'typescript':       'webdev',
  'css':              'webdev',
  'html':             'webdev',
  'frontend':         'webdev',
  'front-end':        'webdev',
  'nextjs':           'webdev',
  'next.js':          'webdev',
  'webpack':          'webdev',
  'node.js':          'webdev',
  'nodejs':           'webdev',
  'deno':             'webdev',
  'bun':              'webdev',
  'web assembly':     'webdev',
  'wasm':             'webdev',

  // Cloud
  'aws':              'cloud',
  'azure':            'cloud',
  'gcp':              'cloud',
  'google cloud':     'cloud',
  'cloud':            'cloud',
  'serverless':       'cloud',
  'lambda':           'cloud',
  'kubernetes':       'cloud',
  'k8s':              'cloud',
  'docker':           'cloud',

  // Security
  'security':         'security',
  'vulnerability':    'security',
  'exploit':          'security',
  'cve':              'security',
  'ransomware':       'security',
  'malware':          'security',
  'phishing':         'security',
  'encryption':       'security',
  'zero-day':         'security',
  'breach':           'security',
  'cybersecurity':    'security',

  // Mobile
  'ios':              'mobile',
  'android':          'mobile',
  'swift':            'mobile',
  'kotlin':           'mobile',
  'mobile':           'mobile',
  'flutter':          'mobile',
  'react native':     'mobile',

  // DevOps
  'devops':           'devops',
  'ci/cd':            'devops',
  'terraform':        'devops',
  'ansible':          'devops',
  'jenkins':          'devops',
  'github actions':   'devops',
  'monitoring':       'devops',
  'observability':    'devops',
  'sre':              'devops',

  // Open Source
  'open source':      'opensource',
  'open-source':      'opensource',
  'oss':              'opensource',
  'foss':             'opensource',
  'mit license':      'opensource',
  'gpl':              'opensource',

  // Database
  'database':         'database',
  'sql':              'database',
  'postgres':         'database',
  'postgresql':       'database',
  'mysql':            'database',
  'mongodb':          'database',
  'redis':            'database',
  'sqlite':           'database',
  'nosql':            'database',
  'dynamodb':         'database',

  // Blockchain
  'blockchain':       'blockchain',
  'crypto':           'blockchain',
  'bitcoin':          'blockchain',
  'ethereum':         'blockchain',
  'web3':             'blockchain',
  'solidity':         'blockchain',
  'nft':              'blockchain',
  'defi':             'blockchain',

  // Career
  'hiring':           'career',
  'interview':        'career',
  'salary':           'career',
  'layoff':           'career',
  'remote work':      'career',
  'job':              'career',
  'career':           'career',
  'resume':           'career',
};

/**
 * Infer topic tags from a title string by scanning for known keywords.
 *
 * @param {string} title - The article title to scan.
 * @returns {string[]} Deduplicated array of matched tag identifiers.
 */
function inferTags(title) {
  if (!title) return [];

  const lower = title.toLowerCase();
  const tags = new Set();

  for (const [keyword, tag] of Object.entries(KEYWORD_TAG_MAP)) {
    if (lower.includes(keyword)) {
      tags.add(tag);
    }
  }

  return [...tags];
}

/**
 * Fetch a single HN item by ID with a timeout.
 *
 * @param {number} id - The HN item ID.
 * @returns {Promise<Object|null>} The item object or null on failure.
 */
async function fetchItem(id) {
  try {
    const response = await fetch(`${HN_API_BASE}/item/${id}.json`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Normalize a raw HN item into the TechPulse article schema.
 *
 * @param {Object} item - Raw item from the HN API.
 * @returns {Object} Normalized article object.
 */
function normalizeItem(item) {
  const hnUrl = `${HN_WEB_BASE}${item.id}`;

  return {
    title:        item.title || '(untitled)',
    url:          item.url || hnUrl,
    source:       SOURCE_ID,
    timestamp:    (item.time || 0) * 1000,
    snippet:      item.title || '',
    tags:         inferTags(item.title),
    thumbnail:    null,
    score:        item.score ?? 0,
    commentUrl:   hnUrl,
    commentCount: item.descendants ?? null,
  };
}

/**
 * Fetch top stories from Hacker News and return normalized articles.
 *
 * @param {string[]} _topics - Topic strings (used for filtering relevance but
 *                             HN has no topic-based API, so we fetch top stories).
 * @returns {Promise<Object[]>} Array of normalized article objects.
 */
export async function fetchArticles(_topics = []) {
  try {
    // 1. Fetch the top story IDs
    const topRes = await fetch(`${HN_API_BASE}/topstories.json`);
    if (!topRes.ok) {
      console.warn(`[${SOURCE_ID}] Failed to fetch top stories: ${topRes.status}`);
      return [];
    }

    const allIds = await topRes.json();
    if (!Array.isArray(allIds)) return [];

    // Take only the first BATCH_SIZE IDs
    const ids = allIds.slice(0, BATCH_SIZE);

    // 2. Fetch all item details in parallel
    const items = await Promise.all(ids.map(fetchItem));

    // 3. Filter out nulls / deleted / dead items, then normalize
    const articles = items
      .filter((item) => item && !item.deleted && !item.dead && item.type === 'story')
      .map(normalizeItem);

    return articles;
  } catch (error) {
    console.error(`[${SOURCE_ID}] Unexpected error fetching articles:`, error);
    return [];
  }
}
