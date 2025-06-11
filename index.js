const express = require('express');
const puppeteer = require('puppeteer');
const TurndownService = require('turndown');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/scrape', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const html = await page.content();
    await browser.close();

    const turndownService = new TurndownService();
    const markdown = turndownService.turndown(html);

    res.json({ url, markdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Scraper API running on port ${PORT}`));
