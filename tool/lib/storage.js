/**
 * TechPulse - Chrome Storage API Wrapper
 *
 * Provides a clean interface over chrome.storage.local for managing
 * articles, read state, bookmarks, and user settings.
 */

import { generateId, deduplicateArticles } from './utils.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  ARTICLES: 'techpulse_articles',
  READ_URLS: 'techpulse_read_urls',
  BOOKMARKS: 'techpulse_bookmarks',
  SETTINGS: 'techpulse_settings',
};

const MAX_ARTICLES = 500;

const DEFAULT_SETTINGS = {
  refreshInterval: 30, // minutes
  topics: ['ai', 'webdev', 'cloud', 'security', 'devops', 'opensource'],
  sources: {
    hackernews: true,
    devto: true,
    reddit: true,
    medium: true,
    techcrunch: true,
    github: true,
    arxiv: true,
  },
  openaiApiKey: '',
  aiScoringEnabled: false,
  articlesPerPage: 30,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Read one or more keys from chrome.storage.local.
 * @param {string|string[]} keys
 * @returns {Promise<Record<string, any>>}
 */
function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Write an object of key/value pairs to chrome.storage.local.
 * @param {Record<string, any>} data
 * @returns {Promise<void>}
 */
function storageSet(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

/**
 * Retrieve stored articles, optionally filtered.
 *
 * @param {Object} [filters]
 * @param {string}   [filters.source]    - Filter by source id (e.g. 'hackernews').
 * @param {string}   [filters.topic]     - Filter by topic tag.
 * @param {boolean}  [filters.read]      - If set, filter by read (true) / unread (false).
 * @param {boolean}  [filters.bookmarked]- If true, return only bookmarked articles.
 * @returns {Promise<Object[]>} Array of article objects.
 */
export async function getArticles(filters = {}) {
  const data = await storageGet([
    STORAGE_KEYS.ARTICLES,
    STORAGE_KEYS.READ_URLS,
    STORAGE_KEYS.BOOKMARKS,
  ]);

  let articles = data[STORAGE_KEYS.ARTICLES] || [];
  const readUrls = new Set(data[STORAGE_KEYS.READ_URLS] || []);
  const bookmarks = new Set(data[STORAGE_KEYS.BOOKMARKS] || []);

  // Attach transient flags
  articles = articles.map((a) => ({
    ...a,
    isRead: readUrls.has(a.url),
    isBookmarked: bookmarks.has(a.url),
  }));

  // Apply filters
  if (filters.source) {
    articles = articles.filter((a) => a.source === filters.source);
  }

  if (filters.topic) {
    articles = articles.filter(
      (a) => Array.isArray(a.tags) && a.tags.includes(filters.topic),
    );
  }

  if (typeof filters.read === 'boolean') {
    articles = articles.filter((a) => a.isRead === filters.read);
  }

  if (filters.bookmarked === true) {
    articles = articles.filter((a) => a.isBookmarked);
  }

  return articles;
}

/**
 * Save / merge new articles into storage.
 *
 * - Deduplicates by URL.
 * - Caps total articles at {@link MAX_ARTICLES}, pruning the oldest first.
 *
 * @param {Object[]} articles - Array of article objects to save.
 * @returns {Promise<void>}
 */
export async function saveArticles(articles) {
  if (!Array.isArray(articles) || articles.length === 0) return;

  const data = await storageGet(STORAGE_KEYS.ARTICLES);
  const existing = data[STORAGE_KEYS.ARTICLES] || [];

  // Ensure every article has an id
  const incoming = articles.map((a) => ({
    ...a,
    id: a.id || generateId(a.url),
  }));

  // Merge & deduplicate (newer articles take precedence)
  let merged = deduplicateArticles(existing, incoming);

  // Sort newest-first so pruning removes the oldest
  merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // Cap at MAX_ARTICLES
  if (merged.length > MAX_ARTICLES) {
    merged = merged.slice(0, MAX_ARTICLES);
  }

  await storageSet({ [STORAGE_KEYS.ARTICLES]: merged });
}

// ---------------------------------------------------------------------------
// Read state
// ---------------------------------------------------------------------------

/**
 * Mark an article URL as read.
 *
 * @param {string} articleUrl
 * @returns {Promise<void>}
 */
export async function markAsRead(articleUrl) {
  if (!articleUrl) return;

  const data = await storageGet(STORAGE_KEYS.READ_URLS);
  const readUrls = new Set(data[STORAGE_KEYS.READ_URLS] || []);

  readUrls.add(articleUrl);

  await storageSet({ [STORAGE_KEYS.READ_URLS]: [...readUrls] });
}

/**
 * Get the full set of read article URLs.
 *
 * @returns {Promise<Set<string>>}
 */
export async function getReadState() {
  const data = await storageGet(STORAGE_KEYS.READ_URLS);
  return new Set(data[STORAGE_KEYS.READ_URLS] || []);
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

/**
 * Toggle the bookmark state for an article URL.
 *
 * @param {string} articleUrl
 * @returns {Promise<boolean>} The new bookmark state (true = bookmarked).
 */
export async function toggleBookmark(articleUrl) {
  if (!articleUrl) return false;

  const data = await storageGet(STORAGE_KEYS.BOOKMARKS);
  const bookmarks = new Set(data[STORAGE_KEYS.BOOKMARKS] || []);

  let isNowBookmarked;
  if (bookmarks.has(articleUrl)) {
    bookmarks.delete(articleUrl);
    isNowBookmarked = false;
  } else {
    bookmarks.add(articleUrl);
    isNowBookmarked = true;
  }

  await storageSet({ [STORAGE_KEYS.BOOKMARKS]: [...bookmarks] });
  return isNowBookmarked;
}

/**
 * Get only bookmarked articles.
 *
 * @returns {Promise<Object[]>}
 */
export async function getBookmarkedArticles() {
  return getArticles({ bookmarked: true });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * Get user settings, falling back to defaults for any missing keys.
 *
 * @returns {Promise<Object>}
 */
export async function getSettings() {
  const data = await storageGet(STORAGE_KEYS.SETTINGS);
  const saved = data[STORAGE_KEYS.SETTINGS] || {};

  // Deep-merge sources so individual source toggles aren't lost
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    sources: {
      ...DEFAULT_SETTINGS.sources,
      ...(saved.sources || {}),
    },
    topics: saved.topics || [...DEFAULT_SETTINGS.topics],
  };
}

/**
 * Save user settings (shallow-merged with existing).
 *
 * @param {Object} settings - Partial or full settings object to persist.
 * @returns {Promise<void>}
 */
export async function saveSettings(settings) {
  const current = await getSettings();

  const merged = {
    ...current,
    ...settings,
    sources: {
      ...current.sources,
      ...(settings.sources || {}),
    },
  };

  await storageSet({ [STORAGE_KEYS.SETTINGS]: merged });
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

/**
 * Remove articles older than a given number of days.
 *
 * Bookmarked articles are preserved regardless of age.
 *
 * @param {number} daysOld - Articles older than this many days will be removed.
 * @returns {Promise<number>} The number of articles removed.
 */
export async function clearOldArticles(daysOld = 30) {
  const data = await storageGet([
    STORAGE_KEYS.ARTICLES,
    STORAGE_KEYS.BOOKMARKS,
  ]);

  const articles = data[STORAGE_KEYS.ARTICLES] || [];
  const bookmarks = new Set(data[STORAGE_KEYS.BOOKMARKS] || []);
  const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;

  const kept = articles.filter(
    (a) => (a.timestamp && a.timestamp >= cutoff) || bookmarks.has(a.url),
  );

  const removedCount = articles.length - kept.length;

  if (removedCount > 0) {
    await storageSet({ [STORAGE_KEYS.ARTICLES]: kept });
  }

  return removedCount;
}
