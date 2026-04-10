/**
 * rss-parser.js - Lightweight RSS/Atom XML Parser for Chrome Extensions (MV3)
 *
 * Parses RSS 2.0 and Atom feed XML into a normalized item format using the
 * browser-native DOMParser API. Designed for Chrome Extension service workers
 * and content scripts -- no external dependencies required.
 *
 * Exports:
 *   - parseRSS(xmlString)        Parse an XML string into normalized feed items
 *   - fetchAndParseFeed(feedUrl)  Fetch a feed URL and return parsed items
 *   - stripHtml(html)            Strip HTML tags and decode common entities
 *
 * @module rss-parser
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum length for snippet text after stripping HTML. */
const SNIPPET_MAX_LENGTH = 300;

/**
 * Map of common HTML entities to their decoded characters.
 * Covers the five XML predefined entities plus common numeric refs.
 */
const HTML_ENTITY_MAP = {
  '&amp;':  '&',
  '&lt;':   '<',
  '&gt;':   '>',
  '&quot;': '"',
  '&#39;':  "'",
  '&#x27;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

// ─── HTML Utilities ──────────────────────────────────────────────────────────

/**
 * Strip HTML tags from a string, decode common HTML entities, and truncate
 * the result to {@link SNIPPET_MAX_LENGTH} characters.
 *
 * @param {string} html - Raw HTML string (may also be plain text).
 * @returns {string} Plain text with entities decoded, truncated to 300 chars.
 *
 * @example
 *   stripHtml('<p>Hello &amp; world</p>');
 *   // => 'Hello & world'
 */
export function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';

  try {
    // 1. Remove HTML tags
    let text = html.replace(/<[^>]*>/g, ' ');

    // 2. Decode named & numeric HTML entities from our map
    text = text.replace(
      /&(?:#x?[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g,
      (entity) => HTML_ENTITY_MAP[entity.toLowerCase()] ?? entity
    );

    // 3. Decode remaining numeric entities (decimal &#NNN; and hex &#xHHH;)
    text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
    text = text.replace(/&#([0-9]+);/g, (_, dec) =>
      String.fromCharCode(parseInt(dec, 10))
    );

    // 4. Collapse whitespace and trim
    text = text.replace(/\s+/g, ' ').trim();

    // 5. Truncate to max length with ellipsis
    if (text.length > SNIPPET_MAX_LENGTH) {
      text = text.slice(0, SNIPPET_MAX_LENGTH).trimEnd() + '...';
    }

    return text;
  } catch {
    return '';
  }
}

// ─── XML Helper Functions ────────────────────────────────────────────────────

/**
 * Safely retrieve the text content of the first matching child element.
 * Handles namespaced lookups (e.g. "media:thumbnail") by falling back
 * to getElementsByTagName if querySelector fails.
 *
 * @param {Element} parent  - Parent XML element to search within.
 * @param {string}  tagName - Tag name to look for (e.g. "title", "media:content").
 * @returns {string|null} Text content of the element, or null if not found.
 */
function getElementText(parent, tagName) {
  try {
    // querySelector can handle simple tag names; namespaced names need
    // getElementsByTagName as a fallback.
    const el =
      parent.querySelector(tagName) ??
      parent.getElementsByTagName(tagName)[0] ??
      null;
    return el?.textContent?.trim() || null;
  } catch {
    // querySelector may throw on names containing colons; fall back
    try {
      const el = parent.getElementsByTagName(tagName)[0];
      return el?.textContent?.trim() || null;
    } catch {
      return null;
    }
  }
}

/**
 * Safely retrieve an attribute value from the first matching child element.
 *
 * @param {Element} parent    - Parent XML element.
 * @param {string}  tagName   - Tag name to search for.
 * @param {string}  attribute - Attribute name to read.
 * @returns {string|null} Attribute value or null.
 */
function getElementAttr(parent, tagName, attribute) {
  try {
    const el =
      parent.querySelector(tagName) ??
      parent.getElementsByTagName(tagName)[0] ??
      null;
    return el?.getAttribute(attribute) || null;
  } catch {
    try {
      const el = parent.getElementsByTagName(tagName)[0];
      return el?.getAttribute(attribute) || null;
    } catch {
      return null;
    }
  }
}

/**
 * Parse a date string into Unix milliseconds. Accepts RFC-822 (RSS),
 * ISO-8601 (Atom), and most other formats that Date.parse() understands.
 *
 * @param {string|null} dateStr - Raw date string from the feed.
 * @returns {number} Unix timestamp in milliseconds, or 0 if unparseable.
 */
function parseDate(dateStr) {
  if (!dateStr) return 0;
  try {
    const ms = new Date(dateStr).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
}

// ─── Thumbnail Extraction ────────────────────────────────────────────────────

/**
 * Attempt to extract a thumbnail URL from an RSS <item> or Atom <entry>.
 *
 * Resolution order:
 *   1. <media:thumbnail url="...">
 *   2. <media:content url="..." medium="image"> (or type starting with "image/")
 *   3. <enclosure url="..." type="image/...">
 *   4. First <img src="..."> found inside the description / content HTML
 *
 * @param {Element}     item        - The <item> or <entry> element.
 * @param {string|null} description - Raw description/content HTML (used for img extraction).
 * @returns {string|null} Thumbnail URL or null.
 */
function extractThumbnail(item, description) {
  try {
    // 1. <media:thumbnail url="...">
    const mediaThumbnail = getElementAttr(item, 'media:thumbnail', 'url');
    if (mediaThumbnail) return mediaThumbnail;

    // 2. <media:content> with image medium or type
    const mediaContents = item.getElementsByTagName('media:content');
    for (let i = 0; i < mediaContents.length; i++) {
      const mc = mediaContents[i];
      const medium = mc.getAttribute('medium');
      const type = mc.getAttribute('type') || '';
      const url = mc.getAttribute('url');
      if (url && (medium === 'image' || type.startsWith('image/'))) {
        return url;
      }
    }

    // 3. <enclosure> with image type
    const enclosures = item.getElementsByTagName('enclosure');
    for (let i = 0; i < enclosures.length; i++) {
      const enc = enclosures[i];
      const type = enc.getAttribute('type') || '';
      const url = enc.getAttribute('url');
      if (url && type.startsWith('image/')) {
        return url;
      }
    }

    // 4. First <img> src in description HTML
    if (description) {
      const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch?.[1]) return imgMatch[1];
    }
  } catch {
    // Swallow errors; thumbnail is non-critical
  }

  return null;
}

// ─── Category Extraction ─────────────────────────────────────────────────────

/**
 * Extract all category/tag strings from an item element.
 *
 * - RSS uses `<category>text</category>`
 * - Atom uses `<category term="...">` (attribute-based)
 *
 * @param {Element} item   - The <item> or <entry> element.
 * @param {boolean} isAtom - True when parsing an Atom feed.
 * @returns {string[]} Array of category strings (may be empty).
 */
function extractCategories(item, isAtom) {
  const categories = [];
  try {
    const categoryEls = item.getElementsByTagName('category');
    for (let i = 0; i < categoryEls.length; i++) {
      const el = categoryEls[i];
      // Atom stores the label in the "term" attribute; RSS in text content
      const value = isAtom
        ? (el.getAttribute('term') || el.textContent || '').trim()
        : (el.textContent || '').trim();
      if (value) categories.push(value);
    }
  } catch {
    // Non-critical; return whatever we collected
  }
  return categories;
}

// ─── Per-Format Item Parsers ─────────────────────────────────────────────────

/**
 * Parse a single RSS 2.0 `<item>` element into a normalized object.
 *
 * @param {Element} item - An `<item>` element from the RSS channel.
 * @returns {object|null} Normalized feed item, or null if essential fields are missing.
 */
function parseRSSItem(item) {
  try {
    const title = getElementText(item, 'title');
    const url   = getElementText(item, 'link');

    // Skip items with no title and no link -- they're unusable
    if (!title && !url) return null;

    const rawDescription = getElementText(item, 'description');
    const rawDate        = getElementText(item, 'pubDate');
    const author         =
      getElementText(item, 'dc:creator') ||
      getElementText(item, 'author') ||
      null;

    return {
      title:      title || '(untitled)',
      url:        url || '',
      timestamp:  parseDate(rawDate),
      snippet:    stripHtml(rawDescription),
      thumbnail:  extractThumbnail(item, rawDescription),
      author,
      categories: extractCategories(item, false),
    };
  } catch {
    return null;
  }
}

/**
 * Parse a single Atom `<entry>` element into a normalized object.
 *
 * @param {Element} entry - An `<entry>` element from the Atom feed.
 * @returns {object|null} Normalized feed item, or null if essential fields are missing.
 */
function parseAtomEntry(entry) {
  try {
    const title = getElementText(entry, 'title');

    // Atom links are attribute-based: <link rel="alternate" href="...">
    // Fall back to any <link> with an href.
    let url = null;
    const links = entry.getElementsByTagName('link');
    for (let i = 0; i < links.length; i++) {
      const rel  = links[i].getAttribute('rel') || 'alternate';
      const href = links[i].getAttribute('href');
      if (href && rel === 'alternate') { url = href; break; }
    }
    // If no "alternate" link, grab the first href available
    if (!url) {
      for (let i = 0; i < links.length; i++) {
        const href = links[i].getAttribute('href');
        if (href) { url = href; break; }
      }
    }

    if (!title && !url) return null;

    const rawSummary =
      getElementText(entry, 'summary') ||
      getElementText(entry, 'content') ||
      null;

    const rawDate =
      getElementText(entry, 'updated') ||
      getElementText(entry, 'published') ||
      null;

    // Atom author is nested: <author><name>...</name></author>
    let author = null;
    try {
      const authorEl = entry.getElementsByTagName('author')[0];
      if (authorEl) {
        author = getElementText(authorEl, 'name') || authorEl.textContent?.trim() || null;
      }
    } catch { /* non-critical */ }

    return {
      title:      title || '(untitled)',
      url:        url || '',
      timestamp:  parseDate(rawDate),
      snippet:    stripHtml(rawSummary),
      thumbnail:  extractThumbnail(entry, rawSummary),
      author,
      categories: extractCategories(entry, true),
    };
  } catch {
    return null;
  }
}

// ─── Main Parser ─────────────────────────────────────────────────────────────

/**
 * Parse an RSS 2.0 or Atom XML string into a normalized array of feed items.
 *
 * Automatically detects the feed format by inspecting the root element:
 *   - `<rss>` or `<rdf:RDF>` -> RSS 2.0 / RDF parsing path
 *   - `<feed>` -> Atom parsing path
 *
 * @param {string} xmlString - Raw XML string of the feed.
 * @returns {Array<{
 *   title: string,
 *   url: string,
 *   timestamp: number,
 *   snippet: string,
 *   thumbnail: string|null,
 *   author: string|null,
 *   categories: string[]
 * }>} Array of normalized feed items. Returns an empty array on any failure.
 *
 * @example
 *   const items = parseRSS(xmlText);
 *   items.forEach(item => console.log(item.title, item.url));
 */
export function parseRSS(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') return [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');

    // DOMParser signals errors by inserting a <parsererror> element
    if (doc.querySelector('parsererror')) {
      console.warn('[rss-parser] XML parse error detected');
      return [];
    }

    const root = doc.documentElement;
    const rootTag = root.tagName.toLowerCase();

    // ── Atom feed ──────────────────────────────────────────────────────
    if (rootTag === 'feed') {
      const entries = doc.getElementsByTagName('entry');
      const items = [];
      for (let i = 0; i < entries.length; i++) {
        const parsed = parseAtomEntry(entries[i]);
        if (parsed) items.push(parsed);
      }
      return items;
    }

    // ── RSS 2.0 / RDF feed ────────────────────────────────────────────
    if (rootTag === 'rss' || rootTag === 'rdf:rdf') {
      const itemEls = doc.getElementsByTagName('item');
      const items = [];
      for (let i = 0; i < itemEls.length; i++) {
        const parsed = parseRSSItem(itemEls[i]);
        if (parsed) items.push(parsed);
      }
      return items;
    }

    // Unknown format
    console.warn(`[rss-parser] Unrecognised root element: <${root.tagName}>`);
    return [];
  } catch (err) {
    console.error('[rss-parser] parseRSS failed:', err);
    return [];
  }
}

// ─── Fetch + Parse ───────────────────────────────────────────────────────────

/**
 * Fetch an RSS/Atom feed from a URL and return parsed items.
 *
 * Uses the Fetch API (available in Chrome Extension service workers and
 * content scripts). Returns an empty array on network errors, non-OK
 * responses, or parse failures -- callers never need to handle exceptions.
 *
 * @param {string} feedUrl - Absolute URL of the RSS/Atom feed.
 * @returns {Promise<Array<{
 *   title: string,
 *   url: string,
 *   timestamp: number,
 *   snippet: string,
 *   thumbnail: string|null,
 *   author: string|null,
 *   categories: string[]
 * }>>} Resolves with an array of normalized feed items (may be empty).
 *
 * @example
 *   const items = await fetchAndParseFeed('https://example.com/feed.xml');
 *   console.log(`Fetched ${items.length} items`);
 */
export async function fetchAndParseFeed(feedUrl) {
  if (!feedUrl || typeof feedUrl !== 'string') return [];

  try {
    const response = await fetch(feedUrl, {
      method: 'GET',
      headers: {
        // Hint to servers that we prefer XML feed formats
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      // Avoid CORS issues in extension context where possible
      credentials: 'omit',
    });

    if (!response.ok) {
      console.warn(`[rss-parser] Fetch failed: ${response.status} ${response.statusText} for ${feedUrl}`);
      return [];
    }

    const xmlString = await response.text();
    return parseRSS(xmlString);
  } catch (err) {
    console.error(`[rss-parser] fetchAndParseFeed error for ${feedUrl}:`, err);
    return [];
  }
}
