/**
 * TechPulse - TechCrunch source client
 *
 * Fetches articles from TechCrunch's RSS feed via the rss2json proxy
 * to avoid CORS restrictions in the Chrome Extension context.
 *
 * @module sources/techcrunch
 */

const SOURCE_ID = 'techcrunch';

const RSS2JSON_ENDPOINT = 'https://api.rss2json.com/v1/api.json';
const TECHCRUNCH_FEED = 'https://techcrunch.com/feed/';

const SNIPPET_MAX_LENGTH = 200;

/**
 * Standard tag aliases: maps common RSS category strings (lowercased)
 * to the normalised TechPulse tag vocabulary.
 */
const TAG_ALIASES = Object.freeze({
  'artificial intelligence': 'ai',
  'ai':                      'ai',
  'machine learning':        'ai',
  'ml':                      'ai',
  'deep learning':           'ai',
  'generative ai':           'ai',
  'chatgpt':                 'ai',
  'openai':                  'ai',
  'web development':         'webdev',
  'webdev':                  'webdev',
  'javascript':              'webdev',
  'frontend':                'webdev',
  'react':                   'webdev',
  'cloud':                   'cloud',
  'cloud computing':         'cloud',
  'aws':                     'cloud',
  'azure':                   'cloud',
  'google cloud':            'cloud',
  'saas':                    'cloud',
  'security':                'security',
  'cybersecurity':           'security',
  'privacy':                 'security',
  'crypto':                  'crypto',
  'cryptocurrency':          'crypto',
  'blockchain':              'crypto',
  'web3':                    'crypto',
  'startups':                'startups',
  'venture':                 'startups',
  'funding':                 'startups',
  'apps':                    'apps',
  'mobile':                  'mobile',
  'gadgets':                 'hardware',
  'hardware':                'hardware',
});

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Strip HTML tags and decode the most common HTML entities.
 *
 * @param {string} html - Raw HTML string.
 * @returns {string} Plain-text string.
 */
function stripHtml(html) {
  if (typeof html !== 'string') return '';

  let text = html
    .replace(/<[^>]*>/g, '')   // remove tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/**
 * Truncate a string to `max` characters, adding an ellipsis when clipped.
 *
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max).trimEnd() + '\u2026';
}

/**
 * Try to extract the first <img> src from an HTML string.
 *
 * @param {string} html
 * @returns {string|null}
 */
function extractFirstImage(html) {
  if (typeof html !== 'string') return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

/**
 * Map an array of raw RSS category strings to normalised TechPulse tags.
 * Unknown categories are kept as-is (lowercased) so no information is lost.
 *
 * @param {string[]} categories
 * @returns {string[]} Deduplicated tag list.
 */
function normaliseTags(categories) {
  if (!Array.isArray(categories)) return [];

  const tags = new Set();

  for (const cat of categories) {
    const key = String(cat).toLowerCase().trim();
    if (!key) continue;
    tags.add(TAG_ALIASES[key] ?? key);
  }

  return [...tags];
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Fetch recent TechCrunch articles.
 *
 * @param {string[]} _topics - Topic strings (currently unused for TechCrunch
 *   because the RSS feed is a single general feed, but accepted for API
 *   consistency and possible future per-topic filtering).
 * @returns {Promise<Array<{
 *   title: string,
 *   url: string,
 *   source: string,
 *   timestamp: number,
 *   snippet: string,
 *   tags: string[],
 *   thumbnail: string|null,
 *   score: number,
 *   commentUrl: string|null,
 *   commentCount: number|null
 * }>>}
 */
export async function fetchArticles(_topics = []) {
  try {
    const feedUrl = `${RSS2JSON_ENDPOINT}?rss_url=${encodeURIComponent(TECHCRUNCH_FEED)}`;

    const response = await fetch(feedUrl);

    if (!response.ok) {
      console.warn(
        `[TechPulse:${SOURCE_ID}] RSS fetch failed: HTTP ${response.status}`,
      );
      return [];
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.items)) {
      console.warn(
        `[TechPulse:${SOURCE_ID}] Unexpected response shape — no items array.`,
      );
      return [];
    }

    const topicSet =
      _topics.length > 0
        ? new Set(_topics.map((t) => t.toLowerCase().trim()))
        : null;

    const articles = [];

    for (const item of data.items) {
      try {
        const rawDescription = item.description ?? '';
        const plainSnippet = stripHtml(rawDescription);

        const tags = normaliseTags(item.categories);

        // Optional topic filtering: if the caller supplied topics, keep only
        // articles whose tags overlap with at least one requested topic.
        if (topicSet) {
          const match = tags.some((t) => topicSet.has(t));
          if (!match) continue;
        }

        const thumbnail =
          item.thumbnail ||
          item.enclosure?.link ||
          extractFirstImage(rawDescription) ||
          null;

        const timestamp = item.pubDate
          ? new Date(item.pubDate).getTime()
          : Date.now();

        articles.push({
          title:        item.title ?? '(untitled)',
          url:          item.link ?? '',
          source:       SOURCE_ID,
          timestamp:    Number.isFinite(timestamp) ? timestamp : Date.now(),
          snippet:      truncate(plainSnippet, SNIPPET_MAX_LENGTH),
          tags,
          thumbnail,
          score:        0,
          commentUrl:   null,
          commentCount: null,
        });
      } catch (itemErr) {
        // Skip malformed items silently.
        console.warn(
          `[TechPulse:${SOURCE_ID}] Skipping malformed item:`,
          itemErr,
        );
      }
    }

    return articles;
  } catch (err) {
    console.error(`[TechPulse:${SOURCE_ID}] fetchArticles failed:`, err);
    return [];
  }
}
