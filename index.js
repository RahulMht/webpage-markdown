/* eslint-disable no-console */
import express        from 'express';
import puppeteer       from 'puppeteer';
import sanitizeHtml    from 'sanitize-html';
import { Readability } from '@mozilla/readability';
import { JSDOM }       from 'jsdom';
import LRU             from 'quick-lru';

const app  = express();
const PORT = process.env.PORT || 3000;

/* ─────────── shared browser ─────────── */
const browserPromise = puppeteer.launch({
  headless: 'new',
  ignoreHTTPSErrors: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--disable-dev-shm-usage', '--disable-extensions',
    '--disable-gpu'
  ]
});

/* tiny in-memory cache (url → html) */
const cache = new LRU({ maxSize: 100, ttl: 10 * 60_000 });

/* ───────────────── route ───────────────── */
app.get('/scrape', async (req, res) => {
  const url = (req.query.url || '').trim();
  if (!/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: 'Invalid or missing ?url=' });
  }

  if (cache.has(url)) return res.json({ url, html: cache.get(url) });

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
      if (['image','media','font','stylesheet','eventsource','websocket'].includes(t)) r.abort();
      else r.continue();
    });

    /* 1. initial load */
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });

    /* 2. click "Load More" repeatedly + scroll */
    await page.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      let clicks = 0;
      while (clicks < 5) {
        const btn = document.querySelector('.load-more-btn');
        if (!btn || btn.disabled || btn.style.display === 'none') break;
        btn.click();
        clicks += 1;
        await sleep(1500);                          // wait for Ajax & render
        window.scrollTo(0, document.body.scrollHeight);
      }
      window.scrollTo(0, document.body.scrollHeight); // trigger lazy loaders
      await sleep(800);
    });

    /* 3. snapshot HTML minus <script>/<style> */
    const rawHtml = await page.evaluate(() => {
      document.querySelectorAll('script,style').forEach(el => el.remove());
      return document.documentElement.outerHTML;
    });
    await page.close();

    /* 4. sanitize & extract main article (fallback to full page) */
    const safeHtml = sanitizeHtml(rawHtml, { allowedTags: false, allowedAttributes: false });
    const dom      = new JSDOM(safeHtml, { url });
    const article  = new Readability(dom.window.document).parse();
    const htmlOut  = article?.content || safeHtml;

    cache.set(url, htmlOut);
    clearTimeout(timer);
    res.json({ url, html: htmlOut });
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
  console.log(`✅  HTML-scraper API listening on ${PORT}`)
);
