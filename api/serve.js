// api/serve.js — Gate keeper: serve index.html hanya ke browser asli
const fs   = require('fs');
const path = require('path');

// ── Pattern tool terminal / scraper ──────────────────────────
const BLOCK_RE = /curl|wget|python|scrapy|go-http|java\/|okhttp|axios|node-fetch|libwww|perl|ruby|php\/|scraperapi|scrapy|mechanize|nikto|nmap|sqlmap|masscan|httpclient|lynx|links|elinks|w3m|httpie|insomnia|postman|thunder|paw|rest-client|fetch|got|superagent|request\/|jsdom|puppeteer|playwright|headless|phantomjs|selenium|webdriver|htmlunit|jakarta|apache-http/i;

// ── Wajib ada tanda browser asli ─────────────────────────────
const BROWSER_RE = /mozilla|chrome|safari|firefox|edge|opera|opr\//i;

// Cache HTML supaya tidak baca disk tiap request
let _cache = null;

module.exports = async function handler(req, res) {
  const ua = req.headers['user-agent'] || '';

  // Tolak: tidak ada UA, UA tool terminal, atau UA tidak ada tanda browser
  if (!ua || BLOCK_RE.test(ua) || !BROWSER_RE.test(ua)) {
    return res
      .status(403)
      .setHeader('Content-Type', 'text/plain')
      .setHeader('X-Robots-Tag', 'noindex')
      .send('403 Forbidden');
  }

  try {
    if (!_cache) {
      _cache = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');
    }
    res.setHeader('Content-Type',           'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options',        'SAMEORIGIN');
    res.setHeader('X-XSS-Protection',       '1; mode=block');
    res.setHeader('Cache-Control',          'no-store, no-cache, must-revalidate');
    res.setHeader('X-Robots-Tag',           'noindex, nofollow');
    return res.status(200).send(_cache);
  } catch (e) {
    console.error('[serve]', e.message);
    return res.status(500).send('Internal Server Error');
  }
};
