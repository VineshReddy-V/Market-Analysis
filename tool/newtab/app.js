/**
 * TechPulse - New Tab Dashboard App
 * Main application logic for the card-based news dashboard
 */

import { getArticles, markAsRead, toggleBookmark, getSettings, getReadState } from '../lib/storage.js';
import { formatTimeAgo, sortArticles, filterArticles, getSourceMeta, truncateText } from '../lib/utils.js';

// State
let state = {
  articles: [],
  filteredArticles: [],
  displayedCount: 0,
  settings: null,
  readUrls: new Set(),
  bookmarkedUrls: new Set(),
  activeTopic: 'all',
  activeView: 'all',
  sortBy: 'newest',
  searchQuery: '',
  sourcesEnabled: {},
  isLoading: true,
  digestVisible: true
};

const PAGE_SIZE = 30;

// DOM Elements
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  showLoading(true);
  await loadSettings();
  await loadArticles();
  setupEventListeners();
  setupMessageListener();
  render();
  showLoading(false);
}

// ============================================
// Data Loading
// ============================================

async function loadSettings() {
  state.settings = await getSettings();
  state.sourcesEnabled = { ...state.settings.sources };
}

async function loadArticles() {
  const articles = await getArticles();
  const readState = await getReadState();

  state.articles = articles;
  state.readUrls = readState;

  // Get bookmarked URLs
  const bookmarkedArticles = await getArticles({ bookmarked: true });
  state.bookmarkedUrls = new Set(bookmarkedArticles.map(a => a.url));

  applyFilters();
}

// ============================================
// Filtering & Sorting
// ============================================

function applyFilters() {
  let filtered = [...state.articles];

  // Source filter
  const enabledSources = Object.entries(state.sourcesEnabled)
    .filter(([, on]) => on)
    .map(([s]) => s);

  filtered = filterArticles(filtered, {
    topics: state.activeTopic === 'all' ? null : [state.activeTopic],
    sources: enabledSources.length < 7 ? enabledSources : null,
    searchQuery: state.searchQuery || null,
    bookmarkedOnly: state.activeView === 'bookmarks',
    unreadOnly: state.activeView === 'unread'
  });

  filtered = sortArticles(filtered, state.sortBy);
  state.filteredArticles = filtered;
  state.displayedCount = Math.min(PAGE_SIZE, filtered.length);
}

// ============================================
// Rendering
// ============================================

function render() {
  renderSourceDropdown();
  renderDigest();
  renderArticles();
  renderStats();
  updateLastUpdated();
}

function renderArticles() {
  const grid = $('#articleGrid');
  const articles = state.filteredArticles.slice(0, state.displayedCount);

  if (articles.length === 0 && !state.isLoading) {
    grid.innerHTML = '';
    showEmpty(true);
    $('#loadMore').style.display = 'none';
    return;
  }

  showEmpty(false);
  grid.innerHTML = articles.map(article => createArticleCard(article)).join('');

  // Show/hide load more
  const loadMore = $('#loadMore');
  if (state.displayedCount < state.filteredArticles.length) {
    loadMore.style.display = 'block';
  } else {
    loadMore.style.display = 'none';
  }

  // Attach card event listeners
  grid.querySelectorAll('.article-card').forEach(card => {
    const url = card.dataset.url;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-actions')) return;
      handleArticleClick(url);
    });

    const bookmarkBtn = card.querySelector('.bookmark-btn');
    if (bookmarkBtn) {
      bookmarkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleBookmark(url);
      });
    }
  });
}

function createArticleCard(article) {
  const source = getSourceMeta(article.source);
  const isRead = state.readUrls.has(article.url);
  const isBookmarked = state.bookmarkedUrls.has(article.url);
  const timeAgo = formatTimeAgo(article.timestamp);

  const thumbnailHtml = article.thumbnail
    ? `<img class="card-thumbnail" src="${escapeAttr(article.thumbnail)}" alt="" loading="lazy" onerror="this.parentElement.removeChild(this)">`
    : '';

  const tagsHtml = (article.tags || []).slice(0, 3).map(tag =>
    `<span class="tag">${escapeHtml(tag)}</span>`
  ).join('');

  const scoreHtml = article.score > 0
    ? `<span title="Score">&#9650; ${formatNumber(article.score)}</span>`
    : '';

  const commentsHtml = article.commentCount != null
    ? `<span title="Comments">&#128172; ${formatNumber(article.commentCount)}</span>`
    : '';

  const aiScoreHtml = article.aiScore != null
    ? `<span class="ai-score-badge" title="AI Relevance">${article.aiScore}</span>`
    : '';

  return `
    <div class="article-card ${isRead ? 'read' : ''}" data-url="${escapeAttr(article.url)}">
      ${thumbnailHtml}
      <div class="card-body">
        <div class="card-source">
          <span class="source-badge">
            <span class="dot" style="background: ${source.color}"></span>
            ${escapeHtml(source.name)}
          </span>
          <span class="card-time">${timeAgo}</span>
        </div>
        <div class="card-title">${escapeHtml(article.title)}</div>
        ${article.snippet ? `<div class="card-snippet">${escapeHtml(truncateText(article.snippet, 150))}</div>` : ''}
        <div class="card-footer">
          <div class="card-tags">${tagsHtml}</div>
          <div class="card-stats">
            ${scoreHtml}
            ${commentsHtml}
            ${aiScoreHtml}
          </div>
          <div class="card-actions">
            <button class="btn-icon bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" title="${isBookmarked ? 'Remove bookmark' : 'Bookmark'}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderDigest() {
  const section = $('#digestSection');
  if (!state.digestVisible || state.activeTopic !== 'all' || state.activeView !== 'all' || state.searchQuery) {
    section.style.display = 'none';
    return;
  }

  // Get top 5 articles from last 24h by score
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const topArticles = [...state.articles]
    .filter(a => a.timestamp > oneDayAgo)
    .sort((a, b) => {
      const scoreA = a.aiScore || a.score || 0;
      const scoreB = b.aiScore || b.score || 0;
      return scoreB - scoreA;
    })
    .slice(0, 5);

  if (topArticles.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  const container = $('#digestCards');
  container.innerHTML = topArticles.map((article, i) => {
    const source = getSourceMeta(article.source);
    return `
      <a class="digest-card" href="${escapeAttr(article.url)}" target="_blank" rel="noopener" data-url="${escapeAttr(article.url)}">
        <div class="digest-rank">#${i + 1} &middot; ${source.name}</div>
        <div class="digest-title">${escapeHtml(article.title)}</div>
        <div class="digest-meta">
          <span>${formatTimeAgo(article.timestamp)}</span>
          ${article.score > 0 ? `<span>&#9650; ${formatNumber(article.score)}</span>` : ''}
        </div>
      </a>
    `;
  }).join('');

  // Click handler for digest cards
  container.querySelectorAll('.digest-card').forEach(card => {
    card.addEventListener('click', () => {
      markAsRead(card.dataset.url);
      state.readUrls.add(card.dataset.url);
    });
  });
}

function renderSourceDropdown() {
  const menu = $('#sourceMenu');
  const sources = [
    { id: 'hackernews', name: 'Hacker News', color: 'var(--hn-color)' },
    { id: 'devto', name: 'Dev.to', color: 'var(--devto-color)' },
    { id: 'reddit', name: 'Reddit', color: 'var(--reddit-color)' },
    { id: 'medium', name: 'Medium', color: 'var(--medium-color)' },
    { id: 'techcrunch', name: 'TechCrunch', color: 'var(--tc-color)' },
    { id: 'github', name: 'GitHub', color: 'var(--github-color)' },
    { id: 'arxiv', name: 'ArXiv', color: 'var(--arxiv-color)' }
  ];

  menu.innerHTML = sources.map(s => `
    <label class="dropdown-item">
      <input type="checkbox" data-source="${s.id}" ${state.sourcesEnabled[s.id] !== false ? 'checked' : ''}>
      <span class="source-dot" style="background: ${s.color}"></span>
      ${s.name}
    </label>
  `).join('');

  menu.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      state.sourcesEnabled[cb.dataset.source] = cb.checked;
      applyFilters();
      renderArticles();
      renderStats();
    });
  });
}

function renderStats() {
  const total = state.filteredArticles.length;
  const unread = state.filteredArticles.filter(a => !state.readUrls.has(a.url)).length;
  $('#articleCount').textContent = `${total} articles${unread > 0 ? ` (${unread} unread)` : ''}`;

  // Source breakdown
  const sourceCounts = {};
  state.filteredArticles.forEach(a => {
    sourceCounts[a.source] = (sourceCounts[a.source] || 0) + 1;
  });
  const breakdown = Object.entries(sourceCounts)
    .map(([s, c]) => `${getSourceMeta(s).name}: ${c}`)
    .join(' | ');
  $('#sourceStats').textContent = breakdown;
}

function updateLastUpdated() {
  if (state.articles.length > 0) {
    const latest = Math.max(...state.articles.map(a => a.timestamp));
    $('#lastUpdated').textContent = `Updated ${formatTimeAgo(latest)}`;
  }
}

// ============================================
// Event Handlers
// ============================================

function setupEventListeners() {
  // Search
  let searchTimeout;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.searchQuery = e.target.value.trim();
      applyFilters();
      renderArticles();
      renderDigest();
      renderStats();
    }, 300);
  });

  // Topic filters
  $('#topicFilters').addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    $$('#topicFilters .filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.activeTopic = chip.dataset.topic;
    applyFilters();
    renderArticles();
    renderDigest();
    renderStats();
  });

  // Sort
  $('#sortSelect').addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    applyFilters();
    renderArticles();
  });

  // View toggles (all / bookmarks / unread)
  $$('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeView = btn.dataset.view;
      applyFilters();
      renderArticles();
      renderDigest();
      renderStats();
    });
  });

  // Source dropdown toggle
  $('#sourceToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#sourceMenu').classList.toggle('open');
  });
  document.addEventListener('click', () => {
    $('#sourceMenu').classList.remove('open');
  });
  $('#sourceMenu').addEventListener('click', (e) => e.stopPropagation());

  // Refresh
  $('#refreshBtn').addEventListener('click', handleRefresh);

  // Settings
  $('#settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Load more
  $('#loadMoreBtn').addEventListener('click', () => {
    state.displayedCount = Math.min(
      state.displayedCount + PAGE_SIZE,
      state.filteredArticles.length
    );
    renderArticles();
  });

  // Hide digest
  $('#hideDigest').addEventListener('click', () => {
    state.digestVisible = false;
    renderDigest();
  });
}

function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'FETCH_STARTED') {
      $('#refreshBtn').classList.add('spinning');
    }
    if (message.type === 'FETCH_COMPLETE' || message.type === 'FETCH_ERROR') {
      $('#refreshBtn').classList.remove('spinning');
      loadArticles().then(render);
    }
  });
}

async function handleArticleClick(url) {
  await markAsRead(url);
  state.readUrls.add(url);
  window.open(url, '_blank', 'noopener');
  // Re-render just the card
  const card = document.querySelector(`[data-url="${CSS.escape(url)}"]`);
  if (card) card.classList.add('read');
}

async function handleBookmark(url) {
  const isNowBookmarked = await toggleBookmark(url);
  if (isNowBookmarked) {
    state.bookmarkedUrls.add(url);
  } else {
    state.bookmarkedUrls.delete(url);
  }
  // If in bookmarks view, re-filter
  if (state.activeView === 'bookmarks') {
    applyFilters();
  }
  renderArticles();
}

async function handleRefresh() {
  const btn = $('#refreshBtn');
  btn.classList.add('spinning');
  try {
    await chrome.runtime.sendMessage({ type: 'REFRESH_FEEDS' });
  } catch {
    // Service worker might not be ready, trigger directly
    btn.classList.remove('spinning');
  }
}

// ============================================
// Utility
// ============================================

function showLoading(show) {
  state.isLoading = show;
  const el = $('#loadingOverlay');
  if (show) {
    el.classList.add('visible');
  } else {
    el.classList.remove('visible');
  }
}

function showEmpty(show) {
  const el = $('#emptyState');
  el.style.display = show ? 'flex' : 'none';
  if (show) {
    if (state.searchQuery) {
      $('#emptyMessage').textContent = `No articles matching "${state.searchQuery}"`;
    } else if (state.activeView === 'bookmarks') {
      $('#emptyMessage').textContent = 'No bookmarked articles yet. Click the bookmark icon on any card to save it.';
    } else {
      $('#emptyMessage').textContent = 'No articles found. Try refreshing your feeds or adjusting filters.';
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
