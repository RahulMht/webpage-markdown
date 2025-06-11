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

    res.setHeader('Content-Type', 'text/markdown');
    res.send(cleaned); // ← plain text, not JSON!
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
