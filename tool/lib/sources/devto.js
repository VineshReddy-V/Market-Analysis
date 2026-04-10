/**
 * TechPulse - Dev.to Source Client
 *
 * Fetches articles from Dev.to's public API, combining topic-specific
 * results with general trending content, and normalizes them into the
 * TechPulse article schema.
 *
 * @module sources/devto
 */

const DEVTO_API_BASE = 'https://dev.to/api/articles';
const SOURCE_ID = 'devto';
const PER_PAGE_TOPIC = 10;
const PER_PAGE_TRENDING = 15;
const TRENDING_DAYS = 1;
const TOPIC_DAYS = 7;

/**
 * Fetch JSON from a URL with error handling.
 *
 * @param {string} url - The endpoint to fetch.
 * @returns {Promise<Object[]>} Parsed JSON array or empty array on failure.
 */
async function fetchJSON(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[${SOURCE_ID}] HTTP ${response.status} for ${url}`);
      return [];
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn(`[${SOURCE_ID}] Fetch failed for ${url}:`, error);
    return [];
  }
}

/**
 * Normalize a raw Dev.to article object into the TechPulse article schema.
 *
 * @param {Object} article - Raw article from the Dev.to API.
 * @returns {Object} Normalized article object.
 */
function normalizeArticle(article) {
  let timestamp = 0;
  try {
    timestamp = article.published_at ? new Date(article.published_at).getTime() : 0;
  } catch {
    timestamp = 0;
  }

  // Ensure timestamp is valid
  if (!Number.isFinite(timestamp)) {
    timestamp = 0;
  }

  const url = article.url || article.canonical_url || '';

  return {
    title:        article.title || '(untitled)',
    url,
    source:       SOURCE_ID,
    timestamp,
    snippet:      (article.description || '').slice(0, 300),
    tags:         Array.isArray(article.tag_list) ? article.tag_list : [],
    thumbnail:    article.cover_image || article.social_image || null,
    score:        article.positive_reactions_count ?? 0,
    commentUrl:   url ? `${url}#comments` : null,
    commentCount: article.comments_count ?? null,
  };
}

/**
 * Fetch articles from Dev.to for the given topics plus general trending,
 * deduplicated by URL.
 *
 * @param {string[]} topics - Array of topic strings (e.g. ['ai', 'webdev']).
 * @returns {Promise<Object[]>} Array of normalized article objects.
 */
export async function fetchArticles(topics = []) {
  try {
    // Build the list of fetch promises
    const fetches = [];

    // Per-topic feeds (top of last 7 days)
    for (const topic of topics) {
      const tag = encodeURIComponent(topic.trim().toLowerCase());
      if (!tag) continue;
      const url = `${DEVTO_API_BASE}?tag=${tag}&per_page=${PER_PAGE_TOPIC}&top=${TOPIC_DAYS}`;
      fetches.push(fetchJSON(url));
    }

    // General trending (top of last 1 day)
    fetches.push(
      fetchJSON(`${DEVTO_API_BASE}?per_page=${PER_PAGE_TRENDING}&top=${TRENDING_DAYS}`)
    );

    // Fetch all in parallel
    const results = await Promise.all(fetches);

    // Flatten all results into a single array
    const allArticles = results.flat();

    // Deduplicate by URL
    const seen = new Set();
    const unique = [];

    for (const article of allArticles) {
      const url = article.url || article.canonical_url || '';
      if (!url || seen.has(url)) continue;
      seen.add(url);
      unique.push(article);
    }

    // Normalize
    return unique.map(normalizeArticle);
  } catch (error) {
    console.error(`[${SOURCE_ID}] Unexpected error fetching articles:`, error);
    return [];
  }
}
