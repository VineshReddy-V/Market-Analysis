/**
 * TechPulse - Reddit Source Client
 *
 * Fetches hot posts from tech-related subreddits using Reddit's public
 * JSON endpoints and normalizes them into the TechPulse article schema.
 *
 * @module sources/reddit
 */

const REDDIT_BASE = 'https://www.reddit.com';
const SOURCE_ID = 'reddit';
const POSTS_PER_SUB = 15;
const SNIPPET_MAX_LENGTH = 200;

/**
 * Mapping of topic identifiers to relevant subreddit names.
 */
const TOPIC_SUBREDDIT_MAP = {
  ai:        ['artificial', 'MachineLearning', 'deeplearning'],
  webdev:    ['webdev', 'javascript', 'reactjs'],
  cloud:     ['aws', 'googlecloud', 'devops'],
  security:  ['netsec', 'cybersecurity'],
  mobile:    ['androiddev', 'iOSProgramming'],
  devops:    ['devops', 'docker', 'kubernetes'],
  opensource:['opensource'],
  database:  ['Database', 'PostgreSQL'],
  blockchain:['CryptoCurrency', 'ethereum'],
  career:    ['cscareerquestions', 'ExperiencedDevs'],
};

/**
 * Default subreddits always fetched regardless of topics.
 */
const DEFAULT_SUBREDDITS = ['programming', 'technology'];

/**
 * Reverse-map a subreddit name to canonical tags.
 */
const SUBREDDIT_TAG_MAP = {
  artificial:        'ai',
  machinelearning:   'ai',
  deeplearning:      'ai',
  webdev:            'webdev',
  javascript:        'webdev',
  reactjs:           'webdev',
  aws:               'cloud',
  googlecloud:       'cloud',
  devops:            'devops',
  netsec:            'security',
  cybersecurity:     'security',
  androiddev:        'mobile',
  iosprogramming:    'mobile',
  docker:            'devops',
  kubernetes:        'devops',
  opensource:        'opensource',
  database:          'database',
  postgresql:        'database',
  cryptocurrency:    'blockchain',
  ethereum:          'blockchain',
  cscareerquestions: 'career',
  experienceddevs:   'career',
  programming:       'programming',
  technology:        'technology',
};

/**
 * Fetch hot posts from a single subreddit.
 *
 * @param {string} subreddit - Subreddit name (without the r/ prefix).
 * @returns {Promise<Object[]>} Array of raw Reddit post data objects.
 */
async function fetchSubreddit(subreddit) {
  const url = `${REDDIT_BASE}/r/${encodeURIComponent(subreddit)}/hot.json?limit=${POSTS_PER_SUB}&raw_json=1`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[${SOURCE_ID}] HTTP ${response.status} for r/${subreddit}`);
      return [];
    }
    const json = await response.json();
    const children = json?.data?.children;
    return Array.isArray(children) ? children : [];
  } catch (error) {
    console.warn(`[${SOURCE_ID}] Fetch failed for r/${subreddit}:`, error);
    return [];
  }
}

/**
 * Infer tags from subreddit name and post title.
 *
 * @param {string} subreddit - The subreddit name.
 * @param {string} title - The post title.
 * @returns {string[]} Array of inferred tags.
 */
function inferTags(subreddit, title) {
  const tags = new Set();

  // Tag from subreddit
  const subTag = SUBREDDIT_TAG_MAP[subreddit.toLowerCase()];
  if (subTag) tags.add(subTag);

  // Basic keyword scan on title
  const lower = (title || '').toLowerCase();
  const keywordMap = {
    ai:         ['ai', 'machine learning', 'deep learning', 'neural', 'gpt', 'llm', 'openai'],
    webdev:     ['react', 'vue', 'angular', 'javascript', 'typescript', 'css', 'frontend', 'next.js', 'node'],
    cloud:      ['aws', 'azure', 'gcp', 'cloud', 'serverless', 'kubernetes', 'k8s'],
    security:   ['security', 'vulnerability', 'exploit', 'cve', 'ransomware', 'breach', 'zero-day'],
    mobile:     ['ios', 'android', 'swift', 'kotlin', 'flutter', 'react native'],
    devops:     ['devops', 'ci/cd', 'terraform', 'docker', 'pipeline', 'deploy'],
    opensource: ['open source', 'open-source', 'foss', 'oss'],
    database:   ['database', 'sql', 'postgres', 'mongodb', 'redis', 'sqlite'],
    blockchain: ['blockchain', 'crypto', 'bitcoin', 'ethereum', 'web3', 'nft'],
    career:     ['hiring', 'interview', 'salary', 'layoff', 'remote work', 'job', 'career'],
  };

  for (const [tag, keywords] of Object.entries(keywordMap)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        tags.add(tag);
        break;
      }
    }
  }

  return [...tags];
}

/**
 * Truncate text to a maximum length, appending ellipsis if needed.
 *
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
function truncate(text, max) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '\u2026';
}

/**
 * Determine whether a URL points to a Reddit-internal page.
 *
 * @param {string} url
 * @returns {boolean}
 */
function isRedditUrl(url) {
  if (!url) return true;
  try {
    const host = new URL(url).hostname;
    return host.endsWith('reddit.com') || host.endsWith('redd.it');
  } catch {
    return false;
  }
}

/**
 * Normalize a raw Reddit post into the TechPulse article schema.
 *
 * @param {Object} child - A child object from Reddit's listing (has `kind` and `data`).
 * @returns {Object|null} Normalized article or null if invalid.
 */
function normalizePost(child) {
  const d = child?.data;
  if (!d || d.stickied || d.is_self === undefined) return null;

  const permalink = `${REDDIT_BASE}${d.permalink}`;
  const externalUrl = d.url || permalink;
  const url = isRedditUrl(externalUrl) ? permalink : externalUrl;

  const snippet = d.selftext
    ? truncate(d.selftext, SNIPPET_MAX_LENGTH)
    : (d.title || '');

  const thumbnail =
    typeof d.thumbnail === 'string' && d.thumbnail.startsWith('http')
      ? d.thumbnail
      : null;

  return {
    title:        d.title || '(untitled)',
    url,
    source:       SOURCE_ID,
    timestamp:    Math.round((d.created_utc || 0) * 1000),
    snippet,
    tags:         inferTags(d.subreddit || '', d.title || ''),
    thumbnail,
    score:        d.score ?? 0,
    commentUrl:   permalink,
    commentCount: d.num_comments ?? null,
  };
}

/**
 * Resolve the full set of subreddits to fetch based on requested topics.
 *
 * @param {string[]} topics
 * @returns {string[]} Deduplicated subreddit list.
 */
function resolveSubreddits(topics) {
  const subs = new Set(DEFAULT_SUBREDDITS);

  for (const topic of topics) {
    const mapped = TOPIC_SUBREDDIT_MAP[topic.toLowerCase()];
    if (Array.isArray(mapped)) {
      for (const sub of mapped) subs.add(sub);
    }
  }

  return [...subs];
}

/**
 * Fetch hot posts from relevant subreddits and return normalized articles.
 *
 * @param {string[]} topics - Array of topic strings (e.g. ['ai', 'webdev']).
 * @returns {Promise<Object[]>} Array of normalized article objects.
 */
export async function fetchArticles(topics = []) {
  try {
    const subreddits = resolveSubreddits(topics);

    // Fetch all subreddits in parallel
    const results = await Promise.all(subreddits.map(fetchSubreddit));
    const allPosts = results.flat();

    // Normalize and deduplicate by URL
    const seen = new Set();
    const articles = [];

    for (const child of allPosts) {
      const article = normalizePost(child);
      if (!article) continue;
      if (seen.has(article.url)) continue;
      seen.add(article.url);
      articles.push(article);
    }

    return articles;
  } catch (error) {
    console.error(`[${SOURCE_ID}] Unexpected error fetching articles:`, error);
    return [];
  }
}
