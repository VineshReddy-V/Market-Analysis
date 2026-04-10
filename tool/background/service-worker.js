/**
 * TechPulse Background Service Worker
 * Handles periodic fetching of articles from all sources
 */

import { getSettings, saveArticles, clearOldArticles } from '../lib/storage.js';
import { generateId, extractTags } from '../lib/utils.js';
import { scoreArticles } from '../lib/ai-scorer.js';
import { fetchArticles as fetchHN } from '../lib/sources/hackernews.js';
import { fetchArticles as fetchDevTo } from '../lib/sources/devto.js';
import { fetchArticles as fetchReddit } from '../lib/sources/reddit.js';
import { fetchArticles as fetchMedium } from '../lib/sources/medium.js';
import { fetchArticles as fetchTechCrunch } from '../lib/sources/techcrunch.js';
import { fetchArticles as fetchGitHub } from '../lib/sources/github-trending.js';
import { fetchArticles as fetchArXiv } from '../lib/sources/arxiv.js';

const ALARM_NAME = 'techpulse-refresh';
const FETCH_LOCK_KEY = 'fetchInProgress';

const SOURCE_FETCHERS = {
  hackernews: fetchHN,
  devto: fetchDevTo,
  reddit: fetchReddit,
  medium: fetchMedium,
  techcrunch: fetchTechCrunch,
  github: fetchGitHub,
  arxiv: fetchArXiv
};

/**
 * Initialize extension on install
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[TechPulse] Extension installed/updated:', details.reason);
  await setupAlarm();
  await fetchAllSources();
});

/**
 * Handle alarm triggers
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log('[TechPulse] Alarm triggered, refreshing feeds...');
    await fetchAllSources();
  }
});

/**
 * Listen for messages from popup/newtab/options
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REFRESH_FEEDS') {
    fetchAllSources().then(() => sendResponse({ success: true }));
    return true; // async response
  }
  if (message.type === 'GET_FETCH_STATUS') {
    chrome.storage.local.get(FETCH_LOCK_KEY, (data) => {
      sendResponse({ inProgress: !!data[FETCH_LOCK_KEY] });
    });
    return true;
  }
  if (message.type === 'UPDATE_ALARM') {
    setupAlarm().then(() => sendResponse({ success: true }));
    return true;
  }
});

/**
 * Set up the periodic refresh alarm
 */
async function setupAlarm() {
  const settings = await getSettings();
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: settings.refreshInterval,
    periodInMinutes: settings.refreshInterval
  });
  console.log(`[TechPulse] Alarm set for every ${settings.refreshInterval} minutes`);
}

/**
 * Fetch articles from all enabled sources
 */
async function fetchAllSources() {
  const lockData = await chrome.storage.local.get(FETCH_LOCK_KEY);
  if (lockData[FETCH_LOCK_KEY]) {
    console.log('[TechPulse] Fetch already in progress, skipping');
    return;
  }

  await chrome.storage.local.set({ [FETCH_LOCK_KEY]: true });
  notifyUI('FETCH_STARTED');

  try {
    const settings = await getSettings();
    const enabledSources = Object.entries(settings.sources)
      .filter(([, enabled]) => enabled)
      .map(([source]) => source);

    console.log('[TechPulse] Fetching from sources:', enabledSources);

    const fetchPromises = enabledSources.map(async (source) => {
      const fetcher = SOURCE_FETCHERS[source];
      if (!fetcher) return [];
      try {
        const articles = await fetcher(settings.topics);
        console.log(`[TechPulse] ${source}: fetched ${articles.length} articles`);
        return articles.map(a => ({
          ...a,
          id: a.id || generateId(a.url),
          tags: a.tags?.length ? a.tags : extractTags(a.title, a.snippet)
        }));
      } catch (err) {
        console.error(`[TechPulse] ${source} failed:`, err.message);
        return [];
      }
    });

    const results = await Promise.allSettled(fetchPromises);
    let allArticles = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);

    console.log(`[TechPulse] Total fetched: ${allArticles.length} articles`);

    // AI scoring if enabled
    if (settings.aiScoringEnabled && settings.openaiApiKey) {
      try {
        allArticles = await scoreArticles(allArticles, settings.topics, settings.openaiApiKey);
        console.log('[TechPulse] AI scoring complete');
      } catch (err) {
        console.error('[TechPulse] AI scoring failed:', err.message);
      }
    }

    // Save to storage (merges with existing, deduplicates)
    await saveArticles(allArticles);

    // Clean up old articles (older than 7 days)
    await clearOldArticles(7);

    notifyUI('FETCH_COMPLETE');
    console.log('[TechPulse] Fetch cycle complete');

  } catch (err) {
    console.error('[TechPulse] Fetch cycle error:', err);
    notifyUI('FETCH_ERROR');
  } finally {
    await chrome.storage.local.set({ [FETCH_LOCK_KEY]: false });
  }
}

/**
 * Notify open UI pages about fetch status
 */
function notifyUI(type) {
  chrome.runtime.sendMessage({ type }).catch(() => {
    // No listeners - UI not open, that's fine
  });
}
