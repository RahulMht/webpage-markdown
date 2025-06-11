# Generic Puppeteer Markdown Scraper API

This service scrapes fully rendered HTML using Puppeteer and converts it to clean Markdown using Turndown.

## 🚀 Features

- Headless Chromium rendering with Puppeteer
- HTML-to-Markdown conversion
- Generic cleanup for universal site compatibility

## 🛠 Usage

```bash
npm install
node index.js
```

Or run via Docker:

```bash
docker build -t markdown-scraper .
docker run -p 3000:3000 markdown-scraper
```

Access via:

```
http://localhost:3000/scrape?url=https://example.com
```
