# TechPulse - Personal Tech & AI News Aggregator

A Chrome extension that replaces your New Tab page with a beautiful, card-based dashboard aggregating tech and AI news from 7 sources.

## Features

- **7 News Sources** - Hacker News, Dev.to, Reddit, Medium, TechCrunch, GitHub Trending, ArXiv
- **New Tab Dashboard** - Card-based layout with thumbnails, snippets, and metadata
- **Topic Filtering** - Filter by AI/ML, Web Dev, Cloud, Security, DevOps, Open Source, and more
- **Source Filtering** - Toggle individual sources on/off
- **AI Relevance Scoring** - Optional OpenAI integration to rank articles by relevance to your interests
- **Read/Unread Tracking** - Articles dim once you've read them
- **Bookmarks** - Save articles for later with a dedicated bookmarks view
- **Daily Digest** - Top 5 stories of the day highlighted at the top
- **Search** - Full-text search across all fetched articles
- **Auto-refresh** - Background worker fetches new content on a configurable schedule
- **Popup** - Quick glance at top stories from the toolbar icon
- **Dark Theme** - Easy on the eyes, content-focused design

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select this `tool` folder
5. Open a new tab - you'll see your TechPulse dashboard

## Project Structure

```
tool/
├── manifest.json                  # Chrome Extension Manifest V3
├── background/
│   └── service-worker.js          # Background worker - periodic fetching
├── newtab/
│   ├── index.html                 # New Tab dashboard page
│   ├── app.js                     # Dashboard logic
│   └── style.css                  # Card-based dark theme
├── options/
│   ├── options.html               # Settings page
│   ├── options.js                 # Settings logic (auto-save)
│   └── options.css                # Settings styling
├── popup/
│   ├── popup.html                 # Toolbar popup
│   ├── popup.js                   # Popup logic
│   └── popup.css                  # Popup styling
├── lib/
│   ├── sources/
│   │   ├── hackernews.js          # Hacker News API client
│   │   ├── devto.js               # Dev.to API client
│   │   ├── reddit.js              # Reddit JSON client
│   │   ├── medium.js              # Medium RSS (via rss2json)
│   │   ├── techcrunch.js          # TechCrunch RSS (via rss2json)
│   │   ├── github-trending.js     # GitHub Search API
│   │   └── arxiv.js               # ArXiv Atom API
│   ├── rss-parser.js              # RSS/Atom XML parser
│   ├── ai-scorer.js               # OpenAI relevance scoring
│   ├── storage.js                 # Chrome Storage API wrapper
│   └── utils.js                   # Utility functions
└── assets/
    └── icons/                     # Extension icons (16, 48, 128px)
```

## Configuration

Open the Settings page (click the gear icon in the dashboard or right-click the extension > Options):

- **Topics**: Select your interests to filter relevant content
- **Sources**: Enable/disable individual news sources
- **Refresh Interval**: How often to fetch new articles (15 min - 4 hours)
- **AI Scoring**: Paste your OpenAI API key to enable AI-powered relevance ranking (uses gpt-4o-mini)
- **Display**: Configure articles per page

## Data Sources

| Source | API | Rate Limits |
|--------|-----|-------------|
| Hacker News | Firebase REST API | Generous, no auth |
| Dev.to | Public REST API | No auth needed |
| Reddit | JSON endpoints | Loose limits, no auth |
| Medium | RSS via rss2json proxy | Free tier limits |
| TechCrunch | RSS via rss2json proxy | Free tier limits |
| GitHub | Search API | 60 req/hr unauthenticated |
| ArXiv | Atom feed API | No strict limits |

## Tech Stack

- **Vanilla JavaScript** (ES Modules) - No build tools, no frameworks
- **CSS Grid + Flexbox** - Responsive card layout
- **Chrome Extension Manifest V3** - Latest extension standard
- **Chrome APIs** - Storage, Alarms, Runtime messaging

## How It Works

1. **Background Service Worker** runs on a timer (Chrome Alarms API)
2. On each cycle, it fetches articles from all enabled sources in parallel
3. Articles are normalized into a common schema, deduplicated, and stored in `chrome.storage.local`
4. If AI scoring is enabled, articles are scored via OpenAI API
5. The New Tab page reads from storage and renders the card grid
6. Filters, search, and sorting all operate on the cached articles for instant response

## Tips

- Articles are cached locally, so your dashboard loads instantly even offline
- Old articles (>7 days) are automatically pruned to stay within storage limits
- Bookmarked articles are never pruned regardless of age
- The extension stores up to 500 articles at a time
- You can export your bookmarks as JSON from the Settings page
