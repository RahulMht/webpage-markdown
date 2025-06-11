# Puppeteer Markdown Scraper API

A headless browser API using Puppeteer that scrapes fully-rendered HTML and returns it as Markdown.

## ✨ Features

- Full JavaScript rendering with Puppeteer
- Converts HTML to clean Markdown
- Docker-ready, deploy anywhere

## 🛠 Run Locally

```bash
npm install
node index.js
```

Visit: `http://localhost:3000/scrape?url=https://example.com`

## 🐳 Docker

```bash
docker build -t puppeteer-api .
docker run -p 3000:3000 puppeteer-api
```
