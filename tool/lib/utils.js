/**
 * TechPulse - Utility Functions
 *
 * Pure helper functions for hashing, formatting, filtering,
 * sorting, and enriching article data.
 */

// ---------------------------------------------------------------------------
// Hashing / ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic hex-string ID from a URL using the djb2 hash.
 *
 * @param {string} url
 * @returns {string} Hex hash string (e.g. "a3f7c021").
 */
export function generateId(url) {
  if (!url) return '0';

  let hash = 5381;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) + hash + url.charCodeAt(i)) >>> 0; // force unsigned 32-bit
  }

  return hash.toString(16);
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Merge two article arrays, removing duplicates by URL.
 * When a duplicate is found the *newer* version (from `newArticles`) wins.
 *
 * @param {Object[]} existing    - Currently stored articles.
 * @param {Object[]} newArticles - Incoming articles.
 * @returns {Object[]} Merged, deduplicated array.
 */
export function deduplicateArticles(existing = [], newArticles = []) {
  const map = new Map();

  // Index existing articles first
  for (const article of existing) {
    if (article.url) {
      map.set(article.url, article);
    }
  }

  // Overwrite / add with new articles (newer wins)
  for (const article of newArticles) {
    if (article.url) {
      map.set(article.url, article);
    }
  }

  return [...map.values()];
}

// ---------------------------------------------------------------------------
// Time / date formatting
// ---------------------------------------------------------------------------

const TIME_DIVISIONS = [
  { amount: 60, unit: 's' },
  { amount: 60, unit: 'm' },
  { amount: 24, unit: 'h' },
  { amount: 30, unit: 'd' },
  { amount: 12, unit: 'mo' },
  { amount: Infinity, unit: 'y' },
];

/**
 * Convert a unix-ms timestamp to a human-friendly relative string
 * (e.g. "2h ago", "3d ago", "just now").
 *
 * @param {number} timestamp - Unix timestamp in milliseconds.
 * @returns {string}
 */
export function formatTimeAgo(timestamp) {
  if (!timestamp) return '';

  let seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 0) seconds = 0;

  if (seconds < 10) return 'just now';

  for (const { amount, unit } of TIME_DIVISIONS) {
    if (seconds < amount) {
      const value = Math.floor(seconds);
      return `${value}${unit} ago`;
    }
    seconds /= amount;
  }

  return '';
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Format a unix-ms timestamp as "Apr 10, 2026".
 *
 * @param {number} timestamp - Unix timestamp in milliseconds.
 * @returns {string}
 */
export function formatDate(timestamp) {
  if (!timestamp) return '';

  const d = new Date(timestamp);
  const month = MONTH_NAMES[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();

  return `${month} ${day}, ${year}`;
}

// ---------------------------------------------------------------------------
// Tag extraction
// ---------------------------------------------------------------------------

/**
 * Keyword map: each standard tag maps to an array of trigger words.
 * All comparisons are lower-cased.
 */
const TAG_KEYWORDS = {
  ai: [
    'ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning',
    'neural network', 'gpt', 'llm', 'large language model', 'transformer',
    'nlp', 'computer vision', 'openai', 'chatgpt', 'diffusion', 'generative',
    'reinforcement learning', 'pytorch', 'tensorflow', 'hugging face',
  ],
  webdev: [
    'webdev', 'web development', 'javascript', 'typescript', 'react', 'vue',
    'angular', 'svelte', 'nextjs', 'next.js', 'nuxt', 'html', 'css',
    'tailwind', 'frontend', 'front-end', 'backend', 'back-end', 'node',
    'nodejs', 'deno', 'bun', 'webpack', 'vite', 'remix', 'astro', 'wasm',
    'webassembly', 'pwa', 'rest api', 'graphql',
  ],
  cloud: [
    'cloud', 'aws', 'azure', 'gcp', 'google cloud', 'serverless', 'lambda',
    'kubernetes', 'k8s', 'docker', 'container', 'microservice', 'saas',
    'paas', 'iaas', 'terraform', 'cloudflare', 'edge computing', 'cdn',
  ],
  security: [
    'security', 'cybersecurity', 'vulnerability', 'exploit', 'malware',
    'ransomware', 'phishing', 'encryption', 'zero-day', 'cve', 'pentest',
    'authentication', 'oauth', 'infosec', 'firewall', 'ddos', 'breach',
    'privacy', 'ssl', 'tls', 'certificate',
  ],
  mobile: [
    'mobile', 'ios', 'android', 'swift', 'kotlin', 'react native',
    'flutter', 'xamarin', 'mobile app', 'iphone', 'ipad', 'play store',
    'app store',
  ],
  devops: [
    'devops', 'ci/cd', 'cicd', 'continuous integration', 'continuous delivery',
    'github actions', 'gitlab ci', 'jenkins', 'ansible', 'puppet', 'chef',
    'monitoring', 'observability', 'prometheus', 'grafana', 'sre',
    'infrastructure', 'deployment', 'pipeline',
  ],
  opensource: [
    'open source', 'open-source', 'opensource', 'foss', 'oss', 'github',
    'gitlab', 'contribution', 'mit license', 'apache license', 'gpl',
    'maintainer', 'repository',
  ],
  database: [
    'database', 'sql', 'nosql', 'postgres', 'postgresql', 'mysql', 'mongodb',
    'redis', 'sqlite', 'dynamodb', 'cassandra', 'elasticsearch', 'supabase',
    'prisma', 'orm', 'query', 'index', 'schema migration',
  ],
  blockchain: [
    'blockchain', 'crypto', 'cryptocurrency', 'bitcoin', 'ethereum',
    'solidity', 'smart contract', 'web3', 'nft', 'defi', 'token',
    'decentralized',
  ],
  career: [
    'career', 'hiring', 'interview', 'resume', 'salary', 'remote work',
    'layoff', 'job market', 'developer experience', 'burnout', 'tech lead',
    'engineering manager', 'promotion', 'freelance',
  ],
};

/**
 * Extract standard topic tags from a title and snippet by keyword matching.
 *
 * @param {string} title
 * @param {string} snippet
 * @returns {string[]} Array of matched tag ids.
 */
export function extractTags(title = '', snippet = '') {
  const text = `${title} ${snippet}`.toLowerCase();
  const matched = [];

  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        matched.push(tag);
        break; // one match is enough for this tag
      }
    }
  }

  return matched;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/**
 * Truncate text to a maximum length, appending an ellipsis if truncated.
 *
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function truncateText(text, maxLength = 150) {
  if (!text) return '';
  if (text.length <= maxLength) return text;

  // Avoid cutting mid-word: find the last space within the limit
  const trimmed = text.slice(0, maxLength);
  const lastSpace = trimmed.lastIndexOf(' ');
  const breakPoint = lastSpace > maxLength * 0.6 ? lastSpace : maxLength;

  return trimmed.slice(0, breakPoint) + '\u2026';
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * Sort articles by the chosen strategy.
 *
 * @param {Object[]} articles
 * @param {'newest'|'score'|'aiScore'} sortBy
 * @returns {Object[]} New sorted array (does not mutate input).
 */
export function sortArticles(articles, sortBy = 'newest') {
  const sorted = [...articles];

  switch (sortBy) {
    case 'score':
      sorted.sort((a, b) => (b.score || 0) - (a.score || 0));
      break;

    case 'aiScore':
      // Articles without an AI score sink to the bottom
      sorted.sort((a, b) => {
        const aScore = a.aiScore ?? -1;
        const bScore = b.aiScore ?? -1;
        return bScore - aScore;
      });
      break;

    case 'newest':
    default:
      sorted.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      break;
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/**
 * Filter articles by multiple criteria.
 *
 * @param {Object[]} articles
 * @param {Object}   criteria
 * @param {string[]} [criteria.topics]         - Keep articles matching any of these tags.
 * @param {string[]} [criteria.sources]        - Keep articles from any of these source ids.
 * @param {string}   [criteria.searchQuery]    - Free-text search in title + snippet.
 * @param {boolean}  [criteria.bookmarkedOnly] - If true, keep only bookmarked articles.
 * @param {boolean}  [criteria.unreadOnly]     - If true, keep only unread articles.
 * @returns {Object[]}
 */
export function filterArticles(articles, criteria = {}) {
  const { topics, sources, searchQuery, bookmarkedOnly, unreadOnly } = criteria;

  return articles.filter((article) => {
    // Source filter
    if (sources && sources.length > 0) {
      if (!sources.includes(article.source)) return false;
    }

    // Topic / tag filter
    if (topics && topics.length > 0) {
      const articleTags = article.tags || [];
      if (!topics.some((t) => articleTags.includes(t))) return false;
    }

    // Free-text search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const haystack = `${article.title || ''} ${article.snippet || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    // Bookmark filter
    if (bookmarkedOnly && !article.isBookmarked) return false;

    // Unread filter
    if (unreadOnly && article.isRead) return false;

    return true;
  });
}

// ---------------------------------------------------------------------------
// Source metadata
// ---------------------------------------------------------------------------

const SOURCE_META = {
  hackernews: { name: 'Hacker News', color: '#FF6600', icon: 'Y' },
  devto: { name: 'Dev.to', color: '#0A0A0A', icon: 'DEV' },
  reddit: { name: 'Reddit', color: '#FF4500', icon: 'r/' },
  medium: { name: 'Medium', color: '#000000', icon: 'M' },
  techcrunch: { name: 'TechCrunch', color: '#00A562', icon: 'TC' },
  github: { name: 'GitHub', color: '#333333', icon: 'GH' },
  arxiv: { name: 'ArXiv', color: '#B31B1B', icon: 'arX' },
};

/**
 * Return display metadata for a source.
 *
 * @param {string} sourceId - e.g. 'hackernews', 'reddit'.
 * @returns {{ name: string, color: string, icon: string }}
 */
export function getSourceMeta(sourceId) {
  return (
    SOURCE_META[sourceId] || {
      name: sourceId,
      color: '#888888',
      icon: '?',
    }
  );
}
