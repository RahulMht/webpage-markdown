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

/* ────────── shared state ────────── */
const browserPromise = puppeteer.launch({
  headless: 'new',
  ignoreHTTPSErrors: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--disable-dev-shm-usage', '--disable-extensions',
    '--disable-gpu'
  ]
});

/* -------------- utils -------------- */
const td = new TurndownService({ headingStyle: 'atx' });

function tidyMarkdown(str) {
  return str
    .replace(/\[\]\((mailto:[^)]+|https?:\/\/[^)]+)\)/g, '') // empty links
    .replace(/[ \t]+\n/g, '\n')                              // trailing spaces
    .replace(/\n{3,}/g, '\n\n')                              // >2 blank lines
    .replace(/[ \t]{2,}/g, ' ')                                // >1 space
    .trim();
}

function chunk(text, size = 2_000) {
  const out = [];
  for (let i = 0; i < text.length; i += size) {
    out.push({ id: out.length + 1, text: text.slice(i, i + size) });
  }
  return out;
}

/* tiny in‑memory cache: url → chunks[] */
const cache = new LRU({ maxSize: 100, ttl: 10 * 60_000 }); // 10 min

/* ───────────── route ───────────── */
app.get('/scrape', async (req, res) => {
  const url = (req.query.url || '').trim();
  if (!/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: 'Invalid or missing ?url=' });
  }
  if (cache.has(url)) return res.json({ url, chunks: cache.get(url) });

  /* —— one 30 s hard timeout so the request never hangs —— */
  const timer = setTimeout(() => {
    res.status(504).json({ error: 'Upstream timeout' });
  }, 30_000);

  try {
    /* ─ fetch html with puppeteer ─ */
    const browser = await browserPromise;
    const page    = await browser.newPage();

    /* block assets we never need */
    await page.setRequestInterception(true);
    page.on('request', r => {
      const t = r.resourceType();
      if (['image', 'media', 'font', 'stylesheet', 'eventsource', 'websocket'].includes(t)) r.abort();
      else r.continue();
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });

    /* grab *clean* html (remove script/style/nav/ads, etc.) */
    const rawHtml = await page.evaluate(() => {
      document.querySelectorAll('script,style,noscript,iframe,header,footer,nav,ads,link[rel="stylesheet"]').forEach(el => el.remove());
      return document.body.innerHTML;
    });

    await page.close();

    /* ─ sanitize + extract main article text (Readability) ─ */
    const safeHtml = sanitizeHtml(rawHtml, { allowedTags: false, allowedAttributes: false });
    const dom      = new JSDOM(safeHtml, { url });          // url is important for Readability
    const article  = new Readability(dom.window.document).parse();

    const markdown = td.turndown(article?.content || safeHtml);
    const cleaned  = tidyMarkdown(markdown);
    const chunks   = chunk(cleaned);

    cache.set(url, chunks);
    clearTimeout(timer);
    res.json({ url, chunks });
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

app.listen(PORT, () => console.log(`✅  Markdown API listening on ${PORT}`));
