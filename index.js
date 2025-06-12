const express = require('express');
const puppeteer = require('puppeteer');
const TurndownService = require('turndown');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

function cleanMarkdown(raw) {
  return raw
    .replace(/\[\]\((mailto:[^)]+|https?:\/\/[^)]+)\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
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
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000); // wait for dynamic content to load

    await page.evaluate(async () => {
      await new Promise(resolve => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
      });
    });

    const html = await page.content();
    const textContent = await page.evaluate(() => document.body.innerText);

    const phoneMatch = textContent.match(/\+\d{1,3}\s*\d{6,12}/);
    const emailMatch = textContent.match(/[\w.-]+@[\w.-]+\.\w+/g);

    await browser.close();

    const turndownService = new TurndownService();
    const markdown = turndownService.turndown(html);
    const cleaned = cleanMarkdown(markdown);

    const extra = `\n\n---\n\n📞 Phone: ${phoneMatch ? phoneMatch[0] : 'N/A'}\n✉️ Email: ${emailMatch ? emailMatch[0] : 'N/A'}\n`;

    res.setHeader('Content-Type', 'text/markdown');
    res.send(cleaned + extra);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Enhanced Markdown Scraper API running on port ${PORT}`);
});
