/**
 * TechPulse - arXiv source client
 *
 * Fetches recent computer-science papers from the arXiv Atom API and parses
 * the XML response using DOMParser (available in Chrome Extension contexts).
 *
 * No external dependencies — fully self-contained.
 *
 * @module sources/arxiv
 */

const SOURCE_ID = 'arxiv';

const ARXIV_API_URL = 'https://export.arxiv.org/api/query';

const SNIPPET_MAX_LENGTH = 200;

const DEFAULT_MAX_RESULTS = 20;

/**
 * arXiv category → TechPulse normalised tag.
 */
const CATEGORY_TAG_MAP = Object.freeze({
  'cs.AI':  'ai',
  'cs.LG':  'ai',    // Machine Learning
  'cs.CL':  'ai',    // Computation and Language (NLP)
  'cs.CV':  'ai',    // Computer Vision
  'cs.NE':  'ai',    // Neural and Evolutionary Computing
  'cs.CR':  'security',
  'cs.SE':  'webdev',  // Software Engineering
  'cs.DC':  'cloud',   // Distributed Computing
  'cs.DB':  'data',    // Databases
  'cs.IR':  'data',    // Information Retrieval
  'cs.NI':  'cloud',   // Networking
  'cs.PL':  'webdev',  // Programming Languages
  'cs.RO':  'robotics',
  'stat.ML': 'ai',     // Statistics – Machine Learning
});

/**
 * Map user-facing topic strings to arXiv category qualifiers for the
 * `search_query` parameter.
 */
const TOPIC_CATEGORIES = Object.freeze({
  ai:       ['cs.AI', 'cs.LG', 'cs.CL', 'cs.CV', 'cs.NE', 'stat.ML'],
  security: ['cs.CR'],
  webdev:   ['cs.SE', 'cs.PL'],
  cloud:    ['cs.DC', 'cs.NI'],
  data:     ['cs.DB', 'cs.IR'],
});

/** Default categories when no topics match or none are provided. */
const DEFAULT_CATEGORIES = ['cs.AI', 'cs.LG', 'cs.CL'];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Collapse whitespace, trim, and truncate a string.
 *
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
function cleanAndTruncate(str, max) {
  if (!str) return '';
  const cleaned = str.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max).trimEnd() + '\u2026';
}

/**
 * Build the `search_query` value from an array of arXiv category codes.
 * Categories are OR-joined: `cat:cs.AI+OR+cat:cs.LG+OR+...`
 *
 * @param {string[]} categories
 * @returns {string}
 */
function buildSearchQuery(categories) {
  return categories.map((c) => `cat:${c}`).join('+OR+');
}

/**
 * Derive TechPulse tags from an array of arXiv `<category term="…">` values.
 *
 * @param {string[]} arxivCategories
 * @returns {string[]} Deduplicated tag list.
 */
function normaliseTags(arxivCategories) {
  const tags = new Set();

  for (const cat of arxivCategories) {
    const mapped = CATEGORY_TAG_MAP[cat];
    if (mapped) {
      tags.add(mapped);
    } else {
      // Keep unmapped categories for completeness.
      tags.add(cat.toLowerCase());
    }
  }

  // Guarantee at least the 'ai' tag since we primarily query AI categories.
  if (tags.size === 0) {
    tags.add('ai');
  }

  return [...tags];
}

/**
 * Safely read the text content of the first matching child element.
 *
 * @param {Element} parent
 * @param {string} tagName
 * @returns {string}
 */
function getText(parent, tagName) {
  const el = parent.getElementsByTagName(tagName)[0];
  return el?.textContent ?? '';
}

/**
 * Extract all author names from an Atom `<entry>`.
 *
 * @param {Element} entry
 * @returns {string}
 */
function getAuthors(entry) {
  const authorEls = entry.getElementsByTagName('author');
  const names = [];
  for (const authorEl of authorEls) {
    const name = getText(authorEl, 'name');
    if (name) names.push(name);
  }
  return names.join(', ');
}

/**
 * Extract all `<category term="…">` values from an Atom `<entry>`.
 *
 * @param {Element} entry
 * @returns {string[]}
 */
function getCategories(entry) {
  const catEls = entry.getElementsByTagName('category');
  const terms = [];
  for (const catEl of catEls) {
    const term = catEl.getAttribute('term');
    if (term) terms.push(term);
  }
  return terms;
}

/**
 * Convert an arXiv abstract URL (`https://arxiv.org/abs/…`) to its HTML
 * full-text URL (`https://arxiv.org/html/…`).
 *
 * @param {string} absUrl
 * @returns {string|null}
 */
function absToHtmlUrl(absUrl) {
  if (typeof absUrl !== 'string') return null;
  // arXiv IDs may contain version suffixes (e.g. 2301.00001v2).
  return absUrl.replace('/abs/', '/html/') || null;
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Fetch recent papers from arXiv.
 *
 * @param {string[]} topics - Topic strings (e.g. ['ai', 'security']).
 *   Used to determine which arXiv categories to query.
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
    // ---- Determine categories from topics ---------------------------------
    const categorySet = new Set();

    const normalisedTopics = topics.map((t) => t.toLowerCase().trim());

    for (const topic of normalisedTopics) {
      const cats = TOPIC_CATEGORIES[topic];
      if (cats) {
        for (const c of cats) categorySet.add(c);
      }
    }

    // Fall back to default AI categories if nothing matched.
    if (categorySet.size === 0) {
      for (const c of DEFAULT_CATEGORIES) categorySet.add(c);
    }

    const searchQuery = buildSearchQuery([...categorySet]);

    // ---- Build URL --------------------------------------------------------
    const url = new URL(ARXIV_API_URL);
    url.searchParams.set('search_query', searchQuery);
    url.searchParams.set('start', '0');
    url.searchParams.set('max_results', String(DEFAULT_MAX_RESULTS));
    url.searchParams.set('sortBy', 'submittedDate');
    url.searchParams.set('sortOrder', 'descending');

    // ---- Fetch + parse XML ------------------------------------------------
    const response = await fetch(url.toString());

    if (!response.ok) {
      console.warn(
        `[TechPulse:${SOURCE_ID}] arXiv API request failed: HTTP ${response.status}`,
      );
      return [];
    }

    const xmlText = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');

    // Check for XML parse errors.
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      console.warn(
        `[TechPulse:${SOURCE_ID}] XML parse error:`,
        parseError.textContent,
      );
      return [];
    }

    const entries = doc.getElementsByTagName('entry');

    if (!entries || entries.length === 0) {
      return [];
    }

    // ---- Map entries to article schema ------------------------------------
    const articles = [];

    for (const entry of entries) {
      try {
        const title = getText(entry, 'title').replace(/\s+/g, ' ').trim();
        const id = getText(entry, 'id').trim();          // e.g. http://arxiv.org/abs/2301.00001v1
        const summary = getText(entry, 'summary');
        const published = getText(entry, 'published');    // ISO 8601
        const categories = getCategories(entry);
        const authors = getAuthors(entry);

        const timestamp = published
          ? new Date(published).getTime()
          : Date.now();

        const snippet = cleanAndTruncate(summary, SNIPPET_MAX_LENGTH);

        // Prefix authors into snippet when there's room.
        const fullSnippet = authors
          ? cleanAndTruncate(`${authors} — ${summary}`, SNIPPET_MAX_LENGTH)
          : snippet;

        articles.push({
          title:        title || '(untitled)',
          url:          id,
          source:       SOURCE_ID,
          timestamp:    Number.isFinite(timestamp) ? timestamp : Date.now(),
          snippet:      fullSnippet,
          tags:         normaliseTags(categories),
          thumbnail:    null,
          score:        0,
          commentUrl:   absToHtmlUrl(id),
          commentCount: null,
        });
      } catch (entryErr) {
        console.warn(
          `[TechPulse:${SOURCE_ID}] Skipping malformed entry:`,
          entryErr,
        );
      }
    }

    return articles;
  } catch (err) {
    console.error(`[TechPulse:${SOURCE_ID}] fetchArticles failed:`, err);
    return [];
  }
}
