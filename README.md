# Markdown Scraper API (Docker)

Build:

```bash
docker build -t markdown-scraper .
```

Run:

```bash
docker run -p 3000:3000 markdown-scraper
# GET http://localhost:3000/scrape?url=https://example.com
```
