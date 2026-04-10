/**
 * TechPulse - GitHub Trending source client
 *
 * Discovers trending repositories via the GitHub Search API, combining a
 * general "recently created + high stars" query with optional topic-specific
 * queries derived from the caller's topic list.
 *
 * Unauthenticated rate limit: 10 requests/minute, 60/hour.
 * On HTTP 403 (rate-limit) we gracefully return an empty array.
 *
 * @module sources/github-trending
 */

const SOURCE_ID = 'github';

const GITHUB_SEARCH_URL = 'https://api.github.com/search/repositories';

const SNIPPET_MAX_LENGTH = 200;

/** How many days back to look for "recently created" repos. */
const LOOKBACK_DAYS = 7;

/** Minimum stars for the general query. */
const MIN_STARS = 50;

/**
 * Map user-facing topic strings to GitHub search qualifiers.
 * Each entry produces its own API call whose results are merged.
 */
const TOPIC_QUERIES = Object.freeze({
  ai:       'topic:machine-learning+topic:artificial-intelligence',
  webdev:   'topic:web+topic:javascript+topic:react',
  cloud:    'topic:cloud+topic:devops+topic:kubernetes',
  security: 'topic:security+topic:cybersecurity',
  mobile:   'topic:android+topic:ios+topic:mobile',
  devtools: 'topic:developer-tools+topic:cli',
  data:     'topic:data-science+topic:big-data',
  crypto:   'topic:blockchain+topic:cryptocurrency',
});

/**
 * Standard tag aliases: maps GitHub topic slugs (lowercased) to TechPulse's
 * normalised tag vocabulary.
 */
const TAG_ALIASES = Object.freeze({
  'machine-learning':        'ai',
  'artificial-intelligence': 'ai',
  'deep-learning':           'ai',
  'neural-network':          'ai',
  'natural-language-processing': 'ai',
  'computer-vision':         'ai',
  'javascript':              'webdev',
  'typescript':              'webdev',
  'react':                   'webdev',
  'vue':                     'webdev',
  'angular':                 'webdev',
  'nextjs':                  'webdev',
  'web':                     'webdev',
  'frontend':                'webdev',
  'nodejs':                  'webdev',
  'html':                    'webdev',
  'css':                     'webdev',
  'cloud':                   'cloud',
  'aws':                     'cloud',
  'azure':                   'cloud',
  'google-cloud':            'cloud',
  'kubernetes':              'cloud',
  'docker':                  'cloud',
  'devops':                  'cloud',
  'terraform':               'cloud',
  'security':                'security',
  'cybersecurity':           'security',
  'blockchain':              'crypto',
  'cryptocurrency':          'crypto',
  'web3':                    'crypto',
  'android':                 'mobile',
  'ios':                     'mobile',
  'flutter':                 'mobile',
  'react-native':            'mobile',
});

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Return a YYYY-MM-DD string for `daysAgo` days before today (UTC).
 *
 * @param {number} daysAgo
 * @returns {string}
 */
function dateNDaysAgo(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * Truncate a string to `max` characters, appending an ellipsis if clipped.
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
 * Normalise a list of GitHub topic slugs (+ optional language) into TechPulse
 * standard tags. Unknown topics are kept verbatim so no data is lost.
 *
 * @param {string[]} topics  - GitHub topic slugs.
 * @param {string|null} lang - Primary repository language.
 * @returns {string[]} Deduplicated tag list.
 */
function normaliseTags(topics, lang) {
  const tags = new Set();

  if (Array.isArray(topics)) {
    for (const t of topics) {
      const key = String(t).toLowerCase().trim();
      if (!key) continue;
      tags.add(TAG_ALIASES[key] ?? key);
    }
  }

  if (lang) {
    const langKey = lang.toLowerCase().trim();
    // Add the language as a tag (mapped if possible).
    tags.add(TAG_ALIASES[langKey] ?? langKey);
  }

  return [...tags];
}

/**
 * Execute a single GitHub search request and return the `items` array.
 * Returns an empty array on any failure (network, rate-limit, parse).
 *
 * @param {string} queryString - Full `q` parameter value.
 * @param {number} perPage
 * @returns {Promise<object[]>}
 */
async function searchGitHub(queryString, perPage = 20) {
  const url = new URL(GITHUB_SEARCH_URL);
  url.searchParams.set('q', queryString);
  url.searchParams.set('sort', 'stars');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', String(perPage));

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });

  if (response.status === 403 || response.status === 429) {
    console.warn(
      `[TechPulse:${SOURCE_ID}] GitHub rate limit hit (${response.status}).`,
    );
    return [];
  }

  if (!response.ok) {
    console.warn(
      `[TechPulse:${SOURCE_ID}] GitHub search failed: HTTP ${response.status}`,
    );
    return [];
  }

  const data = await response.json();
  return Array.isArray(data.items) ? data.items : [];
}

/**
 * Convert a raw GitHub repository object to the normalised TechPulse article
 * schema.
 *
 * @param {object} repo
 * @returns {object}
 */
function repoToArticle(repo) {
  const timestamp = repo.created_at
    ? new Date(repo.created_at).getTime()
    : Date.now();

  return {
    title:        repo.full_name ?? '(unknown)',
    url:          repo.html_url ?? '',
    source:       SOURCE_ID,
    timestamp:    Number.isFinite(timestamp) ? timestamp : Date.now(),
    snippet:      truncate(repo.description ?? '', SNIPPET_MAX_LENGTH),
    tags:         normaliseTags(repo.topics, repo.language),
    thumbnail:    repo.owner?.avatar_url ?? null,
    score:        repo.stargazers_count ?? 0,
    commentUrl:   repo.html_url ? `${repo.html_url}/issues` : null,
    commentCount: repo.open_issues_count ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Fetch trending GitHub repositories, optionally filtered / augmented by
 * topic-specific searches.
 *
 * @param {string[]} topics - Topic strings (e.g. ['ai', 'webdev', 'cloud']).
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
export async function fetchArticles(topics = []) {
  try {
    const dateStr = dateNDaysAgo(LOOKBACK_DAYS);

    // ---- Build the list of search promises --------------------------------
    const searches = [];

    // 1. General trending query (always executed).
    const generalQ = `created:>${dateStr} stars:>${MIN_STARS}`;
    searches.push(searchGitHub(generalQ, 20));

    // 2. Topic-specific queries.
    const normalised = topics.map((t) => t.toLowerCase().trim());

    for (const topic of normalised) {
      const qualifier = TOPIC_QUERIES[topic];
      if (!qualifier) continue;
      const q = `${qualifier} created:>${dateStr}`;
      searches.push(searchGitHub(q, 10));
    }

    // ---- Execute all searches concurrently --------------------------------
    const results = await Promise.allSettled(searches);

    // ---- Merge + deduplicate ----------------------------------------------
    /** @type {Map<string, object>} url → article */
    const seen = new Map();

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const repo of result.value) {
        try {
          const article = repoToArticle(repo);
          if (!article.url) continue;
          // Keep the copy with the highest score in case of duplicates.
          const existing = seen.get(article.url);
          if (!existing || article.score > existing.score) {
            seen.set(article.url, article);
          }
        } catch (mapErr) {
          console.warn(
            `[TechPulse:${SOURCE_ID}] Skipping malformed repo:`,
            mapErr,
          );
        }
      }
    }

    // Sort descending by score before returning.
    return [...seen.values()].sort((a, b) => b.score - a.score);
  } catch (err) {
    console.error(`[TechPulse:${SOURCE_ID}] fetchArticles failed:`, err);
    return [];
  }
}
