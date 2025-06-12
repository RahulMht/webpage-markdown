/* eslint-disable no-console */
const express          = require('express');
const puppeteer         = require('puppeteer');
const TurndownService   = require('turndown');
const LRU               = require('quick-lru');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// ♻️  One shared browser (spins up on first request)
let browser;
async function getBrowser () {
  if (browser) return browser;
  browser = await puppeteer.launch({
    headless: 'new',
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-gpu'
    ]
  });
  return browser;
}

// 🧹 Generic Markdown cleaner
function cleanMarkdown (raw) {
  return raw
    .replace(/\[\]\((mailto:[^)]+|https?:\/\/[^)]+)\)/g, '') // empty links
    .replace(/\s+\n/g, '\n')                                 // trailing spaces
    .replace(/\n{3,}/g, '\n\n')                              // >2 blank lines
    .replace(/\s{2,}/g, ' ')                                 // >1 space
    .trim();
}

// ✂️  Chunking util (2 000 chars default)
function chunkMarkdown (text, size = 2000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push({
      id   : (chunks.length + 1),
      text : text.slice(i, i + size)
    });
  }
  return chunks;
}

// ⚡ Very small in-process cache (URL → chunks)
const cache = new LRU({ maxSize: 100, ttl: 1000 * 60 * 10 }); // 10 min

// ─────────────────────────────────────────────────────────────────────────────
app.get('/scrape', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  // Serve from cache if present
  if (cache.has(url)) return res.json({ url, chunks: cache.get(url) });

  const abortTimeout = setTimeout(() => {
    res.status(504).json({ error: 'Timeout fetching page' });
  }, 30000); // 30 s hard cap

  try {
    const page = await (await getBrowser()).newPage();

    // Block heavy / irrelevant resource types
    await page.setRequestInterception(true);
    page.on('request', req => {
      const type = req.resourceType();
      if (['image', 'media', 'font', 'stylesheet', 'eventsource', 'websocket'].includes(type)) {
        return req.abort();
      }
      return req.continue();
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const html = await page.evaluate(() => document.body.innerHTML);
    await page.close();

    clearTimeout(abortTimeout);

    const turndown  = new TurndownService({ headingStyle: 'atx' });
    const markdown  = turndown.turndown(html);
    const cleaned   = cleanMarkdown(markdown);
    const chunks    = chunkMarkdown(cleaned);

    cache.set(url, chunks); // store

    res.json({ url, chunks });
  } catch (err) {
    clearTimeout(abortTimeout);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
process.on('SIGINT', async () => {
  if (browser) await browser.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`✅ Fast Markdown Scraper API ready on port ${PORT}`);
});
