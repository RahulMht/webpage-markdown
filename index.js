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

/* ────────── shared browser instance ────────── */
const browserPromise = puppeteer.launch({
  headless: 'new',
  ignoreHTTPSErrors: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--disable-dev-shm-usage', '--disable-extensions',
    '--disable-gpu'
  ]
});

/* ─────────────── helpers ─────────────── */
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

/* tiny in-memory cache (url → markdown string) */
const cache = new LRU({ maxSize: 100, ttl: 10 * 60_000 });

/* ───────────────── route ───────────────── */
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
    return res.json(wantChunks ? { url, chunks: chunk(markdown) }
                               : { url, markdown });
  }

  const timer = setTimeout(() => {
    res.status(504).json({ error: 'Upstream timeout' });
  }, 30_000);

  try {
    const browser = await browserPromise;
    const page    = await browser.newPage();

    /* block heavy assets */
    await page.setRequestInterception(true);
    page.on('request', r => {
      const t = r.resourceType();
      if (['image', 'media', 'font', 'stylesheet', 'eventsource', 'websocket'].includes(t)) r.abort();
      else r.continue();
    });

    /* ─── load main document ─── */
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });

    /* auto-click "Load More" + scroll for lazy loaders */
    await page.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));

      let clicks = 0;
      while (clicks < 5) {                       // safety cap
        const btn = document.querySelector('.load-more-btn');
        if (!btn || btn.disabled || btn.style.display === 'none') break;

        btn.click();
        clicks += 1;
        await sleep(1500);                       // wait for Ajax
        window.scrollTo(0, document.body.scrollHeight);
      }
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(800);
    });

    /* ─── capture HTML snapshot ─── */
    const rawHtml = await page.evaluate(() => {
      document.querySelectorAll('script,style').forEach(el => el.remove());
      return document.documentElement.outerHTML;
    });
    await page.close();

    /* clean + extract main content */
    const safeHtml = sanitizeHtml(rawHtml, { allowedTags: false, allowedAttributes: false });
    const dom      = new JSDOM(safeHtml, { url });
    const article  = new Readability(dom.window.document).parse();
    const htmlForTD = article?.content || safeHtml;

    const markdown = tidy(td.turndown(htmlForTD));
    cache.set(url, markdown);

    clearTimeout(timer);
    res.json(wantChunks ? { url, chunks: chunk(markdown) }
                        : { url, markdown });
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
