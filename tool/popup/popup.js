/**
 * TechPulse - Popup Script
 *
 * Drives the compact popup UI that appears when the user clicks
 * the extension icon in the Chrome toolbar.
 */

import { getArticles, getReadState, markAsRead } from '../lib/storage.js';
import { formatTimeAgo, getSourceMeta } from '../lib/utils.js';

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const $unreadCount = document.getElementById('unreadCount');
const $totalCount = document.getElementById('totalCount');
const $lastUpdated = document.getElementById('lastUpdated');
const $storyList = document.getElementById('storyList');
const $storyEmpty = document.getElementById('storyEmpty');
const $refreshBtn = document.getElementById('refreshBtn');
const $dashboardBtn = document.getElementById('dashboardBtn');
const $settingsBtn = document.getElementById('settingsBtn');
const $headerDashboardLink = document.getElementById('headerDashboardLink');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOP_STORY_COUNT = 5;
const MS_24H = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build source-dot CSS class from a source id.
 * @param {string} sourceId
 * @returns {string}
 */
function sourceDotClass(sourceId) {
  return `source-dot source-${sourceId}`;
}

/**
 * Render the star SVG icon for score display.
 * @returns {string} SVG markup.
 */
function starIcon() {
  return `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/**
 * Fetch data from storage and render the entire popup.
 */
async function renderPopup() {
  try {
    const [articles, readState] = await Promise.all([
      getArticles(),
      getReadState(),
    ]);

    // --- Stats ---
    const totalArticles = articles.length;
    const unreadArticles = articles.filter((a) => !readState.has(a.url)).length;

    $totalCount.textContent = totalArticles;
    $unreadCount.textContent = unreadArticles;

    // Last updated: use the most recent article timestamp
    if (totalArticles > 0) {
      const mostRecent = Math.max(...articles.map((a) => a.timestamp || 0));
      $lastUpdated.textContent = mostRecent ? formatTimeAgo(mostRecent) : '--';
    }

    // --- Top 5 stories from last 24h by score ---
    const cutoff = Date.now() - MS_24H;
    const recent = articles.filter((a) => a.timestamp && a.timestamp >= cutoff);

    // Sort by AI score if available, else regular score
    const sorted = recent.sort((a, b) => {
      const scoreA = a.aiScore ?? a.score ?? 0;
      const scoreB = b.aiScore ?? b.score ?? 0;
      return scoreB - scoreA;
    });

    const topStories = sorted.slice(0, TOP_STORY_COUNT);

    // Clear existing story items (keep the empty placeholder)
    const existingItems = $storyList.querySelectorAll('.story-item');
    existingItems.forEach((el) => el.remove());

    if (topStories.length === 0) {
      $storyEmpty.classList.remove('hidden');
      return;
    }

    $storyEmpty.classList.add('hidden');

    // Build story elements
    const fragment = document.createDocumentFragment();

    for (const article of topStories) {
      const meta = getSourceMeta(article.source);
      const isRead = readState.has(article.url);
      const score = article.aiScore ?? article.score ?? 0;
      const timeAgo = formatTimeAgo(article.timestamp);

      const li = document.createElement('li');
      li.className = `story-item${isRead ? ' is-read' : ''}`;
      li.setAttribute('role', 'link');
      li.setAttribute('tabindex', '0');
      li.dataset.url = article.url;

      li.innerHTML = `
        <span class="${sourceDotClass(article.source)}" title="${meta.name}"></span>
        <div class="story-content">
          <div class="story-title">${escapeHtml(article.title || 'Untitled')}</div>
          <div class="story-meta">
            <span class="story-source-name">${meta.name}</span>
            <span class="story-meta-sep">&middot;</span>
            <span>${timeAgo}</span>
            ${score > 0 ? `<span class="story-meta-sep">&middot;</span><span class="story-score">${starIcon()} ${score}</span>` : ''}
          </div>
        </div>
      `;

      // Click handler - mark as read & open in new tab
      li.addEventListener('click', () => openArticle(article.url));
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openArticle(article.url);
        }
      });

      fragment.appendChild(li);
    }

    $storyList.insertBefore(fragment, $storyEmpty);
  } catch (err) {
    console.error('[TechPulse Popup] Failed to render:', err);
  }
}

/**
 * Escape HTML to prevent XSS in article titles.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Open an article URL in a new tab and mark it as read.
 * @param {string} url
 */
async function openArticle(url) {
  if (!url) return;

  try {
    await markAsRead(url);
  } catch (err) {
    console.warn('[TechPulse Popup] Could not mark as read:', err);
  }

  chrome.tabs.create({ url });
}

/**
 * Open the full dashboard (new tab override page).
 */
function openDashboard() {
  chrome.tabs.create({ url: 'chrome://newtab' });
}

/**
 * Send a refresh message to the background service worker.
 */
function refreshFeeds() {
  $refreshBtn.classList.add('refreshing');

  chrome.runtime.sendMessage({ type: 'REFRESH_FEEDS' }, () => {
    // Re-render popup after a short delay to let the background worker process
    setTimeout(async () => {
      $refreshBtn.classList.remove('refreshing');
      await renderPopup();
    }, 2000);
  });
}

/**
 * Open the extension options/settings page.
 */
function openSettings() {
  chrome.runtime.openOptionsPage();
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

$refreshBtn.addEventListener('click', refreshFeeds);
$dashboardBtn.addEventListener('click', openDashboard);
$settingsBtn.addEventListener('click', openSettings);
$headerDashboardLink.addEventListener('click', (e) => {
  e.preventDefault();
  openDashboard();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', renderPopup);
