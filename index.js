const express = require('express');
const puppeteer = require('puppeteer');
const TurndownService = require('turndown');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Generic cleanup for all sites
function cleanMarkdown(raw) {
  return raw
    .replace(/\[\]\((mailto:[^)]+|https?:\/\/[^)]+)\)/g, '') // Remove empty/broken links
    .replace(/\n{3,}/g, '\n\n')                              // Collapse excessive newlines
    .replace(/\s{2,}/g, ' ')                                 // Collapse extra spaces
    .trim();
}

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
    const cleaned = cleanMarkdown(markdown);

    // Return raw Markdown instead of JSON
    res.setHeader('Content-Type', 'text/markdown');
    res.send(cleaned);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Markdown Scraper API is running on http://localhost:${PORT}`);
});
