/* eslint-disable no-console */
import express              from 'express';
import puppeteer             from 'puppeteer';
import TurndownService       from 'turndown';
import sanitizeHtml          from 'sanitize-html';
import { Readability }       from '@mozilla/readability';
import { JSDOM }             from 'jsdom';
import LRU                   from 'quick-lru';

const app  = express();
const PORT = process.env.PORT || 3000;

/* ────────── shared browser ────────── */
const browserPromise = puppeteer.launch({
  headless: 'new',
  ignoreHTTPSErrors: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--disable-dev-shm-usage', '--disable-extensions',
    '--disable-gpu'
  ]
});

/* ───────────── utilities ──────────── */
const td = new TurndownService({ headingStyle: 'atx' });

function tidy(str) {
  return str
    .replace(/\[\]\((mailto:[^)]+|https?:\/\/[^)]+)\)/g, '') // empty links
    .replace(/[ \t]+\n/g, '\n')                              // trailing spaces
    .replace(/\n{3,}/g, '\n\n')                              // >2 blank lines
    .replace(/[ \t]{2,}/g, ' ')                              // >1 space
    .trim();
}

function chunk(text, size = 2_000) {
  const out = [];
  for (let i = 0; i < text.length; i += size) {
    out.push({ id: out.length + 1, text: text.slice(i, i + size) });
  }
  return out;
}

/* in-memory cache: url → markdown string */
const cache = new LRU({ maxSize: 100, ttl: 10 * 60_000 });

/* ──────────────── route ───────────── */
app.get('/scrape', async (req, res) => {
  const url = (req.query.url || '').trim();
  if (!/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: 'Invalid or missing ?url=' });
  }

  const wantChunks = ['1', 'true', 'yes'].includes(
    String(req.query.chunk || '').toLowerCase()
  );

  if (cache.has(url)) {
    const markdown = cache.get(url);
    return res.json(
      wantChunks ? { url, chunks: chunk(markdown) } : { url, markdown }
    );
  }

  /* 30-second hard timeout */
  const timer = setTimeout(() => {
    res.status(504).json({ error: 'Upstream timeout' });
  }, 30_000);

  try {
    /* fetch HTML with Puppeteer */
    const browser = await browserPromise;
    const page    = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', r => {
      const t = r.resourceType();
      if (['image', 'media', 'font', 'stylesheet', 'eventsource', 'websocket'].includes(t)) r.abort();
      else r.continue();
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });

    const rawHtml = await page.evaluate(() => {
      document.querySelectorAll('script,style,noscript,iframe,header,footer,nav,ads,link[rel="stylesheet"]').forEach(el => el.remove());
      return document.body.innerHTML;
    });
    await page.close();

    /* sanitize + extract main article */
    const safeHtml = sanitizeHtml(rawHtml, { allowedTags: false, allowedAttributes: false });
    const dom      = new JSDOM(safeHtml, { url });
    const article  = new Readability(dom.window.document).parse();

    const markdown = tidy(td.turndown(article?.content || safeHtml));
    cache.set(url, markdown);           // store the full string

    clearTimeout(timer);
    res.json(
      wantChunks ? { url, chunks: chunk(markdown) } : { url, markdown }
    );
  } catch (err) {
    clearTimeout(timer);
    res.status(500).json({ error: err.message });
  }
});

/* graceful shutdown */
process.on('SIGINT', async () => {
  const browser = await browserPromise;
  await browser.close();
  process.exit(0);
});

app.listen(PORT, () =>
  console.log(`✅ Markdown API listening on ${PORT}`)
);
