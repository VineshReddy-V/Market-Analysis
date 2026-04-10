/**
 * TechPulse - Options Page Controller
 *
 * Handles loading/saving settings, API key validation,
 * data management actions, and auto-save with toast feedback.
 */

import { getSettings, saveSettings, getBookmarkedArticles } from '../lib/storage.js';
import { validateApiKey } from '../lib/ai-scorer.js';

// ---------------------------------------------------------------------------
// DOM References
// ---------------------------------------------------------------------------

const dom = {
  // Topics
  topicCheckboxes: () => document.querySelectorAll('input[name="topic"]'),

  // Sources
  sourceCheckboxes: () => document.querySelectorAll('input[name="source"]'),

  // Refresh
  refreshInterval: document.getElementById('refreshInterval'),

  // AI Scoring
  aiScoringEnabled: document.getElementById('aiScoringEnabled'),
  aiKeySection: document.getElementById('aiKeySection'),
  openaiApiKey: document.getElementById('openaiApiKey'),
  testKeyBtn: document.getElementById('testKeyBtn'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),

  // Display
  articlesPerPage: document.getElementById('articlesPerPage'),

  // Data buttons
  clearArticlesBtn: document.getElementById('clearArticlesBtn'),
  exportBookmarksBtn: document.getElementById('exportBookmarksBtn'),
  resetSettingsBtn: document.getElementById('resetSettingsBtn'),

  // Toast
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toastMessage'),
};

// ---------------------------------------------------------------------------
// Toast Notification
// ---------------------------------------------------------------------------

let toastTimeout = null;

function showToast(message = 'Settings saved', isError = false) {
  clearTimeout(toastTimeout);

  dom.toastMessage.textContent = message;
  dom.toast.classList.toggle('error', isError);
  dom.toast.classList.add('visible');

  toastTimeout = setTimeout(() => {
    dom.toast.classList.remove('visible');
  }, 2000);
}

// ---------------------------------------------------------------------------
// Populate Form from Settings
// ---------------------------------------------------------------------------

async function loadSettings() {
  const settings = await getSettings();

  // Topics
  dom.topicCheckboxes().forEach((cb) => {
    cb.checked = settings.topics.includes(cb.value);
  });

  // Sources
  dom.sourceCheckboxes().forEach((cb) => {
    cb.checked = settings.sources[cb.value] ?? false;
  });

  // Refresh interval
  dom.refreshInterval.value = String(settings.refreshInterval);

  // AI Scoring
  dom.aiScoringEnabled.checked = settings.aiScoringEnabled;
  toggleAiSection(settings.aiScoringEnabled);
  dom.openaiApiKey.value = settings.openaiApiKey || '';
  updateKeyStatus(settings.openaiApiKey);

  // Display
  dom.articlesPerPage.value = String(settings.articlesPerPage);
}

function toggleAiSection(enabled) {
  dom.aiKeySection.classList.toggle('active', enabled);
}

function updateKeyStatus(key) {
  if (!key) {
    dom.statusDot.className = 'status-dot';
    dom.statusText.textContent = 'Not set';
  } else {
    // We show it as "set" — actual validation happens on Test Key click
    dom.statusDot.className = 'status-dot valid';
    dom.statusText.textContent = 'Key configured';
  }
}

// ---------------------------------------------------------------------------
// Gather Current Form State
// ---------------------------------------------------------------------------

function gatherSettings() {
  const topics = [];
  dom.topicCheckboxes().forEach((cb) => {
    if (cb.checked) topics.push(cb.value);
  });

  const sources = {};
  dom.sourceCheckboxes().forEach((cb) => {
    sources[cb.value] = cb.checked;
  });

  return {
    topics,
    sources,
    refreshInterval: Number(dom.refreshInterval.value),
    aiScoringEnabled: dom.aiScoringEnabled.checked,
    openaiApiKey: dom.openaiApiKey.value.trim(),
    articlesPerPage: Number(dom.articlesPerPage.value),
  };
}

// ---------------------------------------------------------------------------
// Auto-save on Change
// ---------------------------------------------------------------------------

async function handleChange() {
  try {
    const settings = gatherSettings();
    await saveSettings(settings);
    showToast('Settings saved');

    // Notify background to update alarm schedule
    try {
      chrome.runtime.sendMessage({ type: 'UPDATE_ALARM' });
    } catch {
      // Background may not be listening — that's fine
    }
  } catch (err) {
    console.error('[TechPulse Options] Save failed:', err);
    showToast('Failed to save settings', true);
  }
}

// Debounce for text inputs (API key)
let debounceTimer = null;
function handleChangeDebounced() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(handleChange, 400);
}

// ---------------------------------------------------------------------------
// Test API Key
// ---------------------------------------------------------------------------

async function handleTestKey() {
  const key = dom.openaiApiKey.value.trim();
  if (!key) {
    showToast('Enter an API key first', true);
    return;
  }

  dom.statusDot.className = 'status-dot testing';
  dom.statusText.textContent = 'Testing...';
  dom.testKeyBtn.disabled = true;
  dom.testKeyBtn.textContent = 'Testing...';

  try {
    const isValid = await validateApiKey(key);

    if (isValid) {
      dom.statusDot.className = 'status-dot valid';
      dom.statusText.textContent = 'Valid key';
      showToast('API key is valid');
    } else {
      dom.statusDot.className = 'status-dot invalid';
      dom.statusText.textContent = 'Invalid key';
      showToast('API key is invalid', true);
    }
  } catch {
    dom.statusDot.className = 'status-dot invalid';
    dom.statusText.textContent = 'Validation error';
    showToast('Could not validate key', true);
  } finally {
    dom.testKeyBtn.disabled = false;
    dom.testKeyBtn.textContent = 'Test Key';
  }
}

// ---------------------------------------------------------------------------
// Data Actions
// ---------------------------------------------------------------------------

async function handleClearArticles() {
  const confirmed = confirm(
    'This will permanently delete all cached articles.\n\nBookmarks will also be removed. Are you sure?'
  );
  if (!confirmed) return;

  try {
    await new Promise((resolve, reject) => {
      chrome.storage.local.remove('techpulse_articles', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
    showToast('All articles cleared');
  } catch (err) {
    console.error('[TechPulse Options] Clear articles failed:', err);
    showToast('Failed to clear articles', true);
  }
}

async function handleExportBookmarks() {
  try {
    const bookmarked = await getBookmarkedArticles();

    if (bookmarked.length === 0) {
      showToast('No bookmarked articles to export', true);
      return;
    }

    const exportData = {
      exported: new Date().toISOString(),
      source: 'TechPulse',
      count: bookmarked.length,
      articles: bookmarked.map((a) => ({
        title: a.title,
        url: a.url,
        source: a.source,
        timestamp: a.timestamp,
        tags: a.tags || [],
        snippet: a.snippet || '',
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `techpulse-bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Exported ${bookmarked.length} bookmarks`);
  } catch (err) {
    console.error('[TechPulse Options] Export failed:', err);
    showToast('Export failed', true);
  }
}

async function handleResetSettings() {
  const confirmed = confirm(
    'This will reset all settings to their defaults.\n\nYour articles and bookmarks will NOT be affected. Continue?'
  );
  if (!confirmed) return;

  try {
    await new Promise((resolve, reject) => {
      chrome.storage.local.remove('techpulse_settings', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    // Notify background to reset alarm
    try {
      chrome.runtime.sendMessage({ type: 'UPDATE_ALARM' });
    } catch {
      // noop
    }

    showToast('Settings reset to defaults');
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    console.error('[TechPulse Options] Reset failed:', err);
    showToast('Reset failed', true);
  }
}

// ---------------------------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------------------------

function bindEvents() {
  // Topic checkboxes
  dom.topicCheckboxes().forEach((cb) => {
    cb.addEventListener('change', handleChange);
  });

  // Source toggles
  dom.sourceCheckboxes().forEach((cb) => {
    cb.addEventListener('change', handleChange);
  });

  // Refresh interval
  dom.refreshInterval.addEventListener('change', handleChange);

  // AI Scoring toggle
  dom.aiScoringEnabled.addEventListener('change', () => {
    toggleAiSection(dom.aiScoringEnabled.checked);
    handleChange();
  });

  // API key input (debounced)
  dom.openaiApiKey.addEventListener('input', () => {
    updateKeyStatus(dom.openaiApiKey.value.trim());
    handleChangeDebounced();
  });

  // Test Key button
  dom.testKeyBtn.addEventListener('click', handleTestKey);

  // Articles per page
  dom.articlesPerPage.addEventListener('change', handleChange);

  // Data action buttons
  dom.clearArticlesBtn.addEventListener('click', handleClearArticles);
  dom.exportBookmarksBtn.addEventListener('click', handleExportBookmarks);
  dom.resetSettingsBtn.addEventListener('click', handleResetSettings);
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  bindEvents();
});
