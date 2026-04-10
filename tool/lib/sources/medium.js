/**
 * TechPulse - Medium Source Client
 *
 * Fetches articles from Medium tag-based RSS feeds via the rss2json proxy
 * (to avoid CORS issues in extension context) and normalizes them into
 * the TechPulse article schema.
 *
 * @module sources/medium
 */

const RSS2JSON_BASE = 'https://api.rss2json.com/v1/api.json';
const SOURCE_ID = 'medium';
const SNIPPET_MAX_LENGTH = 200;

/**
 * Topic-to-Medium RSS feed URL mapping.
 */
const TOPIC_FEED_MAP = {
  ai:          'https://medium.com/feed/tag/artificial-intelligence',
  webdev:      'https://medium.com/feed/tag/web-development',
  cloud:       'https://medium.com/feed/tag/cloud-computing',
  security:    'https://medium.com/feed/tag/cybersecurity',
  devops:      'https://medium.com/feed/tag/devops',
  opensource:  'https://medium.com/feed/tag/open-source',
  mobile:      'https://medium.com/feed/tag/mobile-development',
  database:    'https://medium.com/feed/tag/database',
  programming: 'https://medium.com/feed/tag/programming',
};

/**
 * Strip HTML tags from a string, leaving only text content.
 *
 * @param {string} html - The HTML string to strip.
 * @returns {string} Plain text with HTML tags removed.
 */
function stripHtml(html) {
  if (!html) return '';
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, '');
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
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
 * Fetch and parse a Medium RSS feed via the rss2json proxy.
 *
 * @param {string} feedUrl - The original Medium RSS feed URL.
 * @returns {Promise<Object[]>} Array of raw feed item objects or empty array on failure.
 */
async function fetchFeed(feedUrl) {
  const proxyUrl = `${RSS2JSON_BASE}?rss_url=${encodeURIComponent(feedUrl)}`;
  try {
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      console.warn(`[${SOURCE_ID}] HTTP ${response.status} for ${feedUrl}`);
      return [];
    }
    const json = await response.json();
    if (json.status !== 'ok' || !Array.isArray(json.items)) {
      console.warn(`[${SOURCE_ID}] Unexpected response format for ${feedUrl}`);
      return [];
    }
    return json.items;
  } catch (error) {
    console.warn(`[${SOURCE_ID}] Fetch failed for ${feedUrl}:`, error);
    return [];
  }
}

/**
 * Parse a date string into unix milliseconds, returning 0 on failure.
 *
 * @param {string} dateStr - Date string (e.g. from pubDate).
 * @returns {number} Unix timestamp in milliseconds.
 */
function parseTimestamp(dateStr) {
  if (!dateStr) return 0;
  try {
    const ms = new Date(dateStr).getTime();
    return Number.isFinite(ms) ? ms : 0;
  } catch {
    return 0;
  }
}

/**
 * Build a deduplicated tags array from feed item categories and the topic.
 *
 * @param {Object} item - The raw feed item.
 * @param {string} topic - The topic this feed was fetched for.
 * @returns {string[]} Array of tag strings.
 */
function buildTags(item, topic) {
  const tags = new Set();

  // Add the topic itself
  if (topic) tags.add(topic);

  // Add categories from the feed item
  if (Array.isArray(item.categories)) {
    for (const cat of item.categories) {
      if (typeof cat === 'string' && cat.trim()) {
        tags.add(cat.trim().toLowerCase());
      }
    }
  }

  return [...tags];
}

/**
 * Normalize a raw rss2json item into the TechPulse article schema.
 *
 * @param {Object} item - A single item from the rss2json response.
 * @param {string} topic - The topic this item was fetched under.
 * @returns {Object} Normalized article object.
 */
function normalizeItem(item, topic) {
  const rawSnippet = stripHtml(item.description || item.content || '');

  return {
    title:        item.title || '(untitled)',
    url:          item.link || item.guid || '',
    source:       SOURCE_ID,
    timestamp:    parseTimestamp(item.pubDate),
    snippet:      truncate(rawSnippet, SNIPPET_MAX_LENGTH),
    tags:         buildTags(item, topic),
    thumbnail:    item.thumbnail || item.enclosure?.link || null,
    score:        0,  // Medium RSS does not expose clap counts
    commentUrl:   null,
    commentCount: null,
  };
}

/**
 * Fetch articles from Medium for the given topics and return normalized articles.
 *
 * @param {string[]} topics - Array of topic strings (e.g. ['ai', 'webdev']).
 * @returns {Promise<Object[]>} Array of normalized article objects.
 */
export async function fetchArticles(topics = []) {
  try {
    // Determine which feeds to fetch
    const feedEntries = [];

    for (const topic of topics) {
      const key = topic.trim().toLowerCase();
      const feedUrl = TOPIC_FEED_MAP[key];
      if (feedUrl) {
        feedEntries.push({ topic: key, url: feedUrl });
      }
    }

    // If no recognized topics, fall back to programming
    if (feedEntries.length === 0) {
      feedEntries.push({
        topic: 'programming',
        url: TOPIC_FEED_MAP.programming,
      });
    }

    // Fetch all feeds in parallel
    const results = await Promise.all(
      feedEntries.map(async ({ topic, url }) => {
        const items = await fetchFeed(url);
        return items.map((item) => normalizeItem(item, topic));
      })
    );

    // Flatten and deduplicate by URL
    const allArticles = results.flat();
    const seen = new Set();
    const unique = [];

    for (const article of allArticles) {
      if (!article.url || seen.has(article.url)) continue;
      seen.add(article.url);
      unique.push(article);
    }

    return unique;
  } catch (error) {
    console.error(`[${SOURCE_ID}] Unexpected error fetching articles:`, error);
    return [];
  }
}
