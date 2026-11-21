// Headless Chrome at 1920×1080 driving the app with arrow keys like a remote.
// --disable-web-security stands in for the TV: the probe showed a packaged Tizen app reads
// youtubei without CORS headers. This is a test-harness flag only; the app has no proxy.
const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5180/app/index.html';
const OUT = path.join(__dirname, 'shots');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports.launch = async function (query = '') {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-web-security', '--user-data-dir=' + path.join(require('os').tmpdir(), 'bctv-e2e'), '--autoplay-policy=no-user-gesture-required', '--window-size=1920,1080'],
    defaultViewport: { width: 1920, height: 1080 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE + query, { waitUntil: 'load' });
  const key = async (k, n = 1, gap = 180) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await wait(gap); } };
  const shot = (name) => page.screenshot({ path: path.join(OUT, name + '.png') });
  const focused = () => page.evaluate(() => { const f = BC.nav.focused(); return f ? (f.getAttribute('aria-label') || f.textContent).slice(0, 80) : null; });
  return { browser, page, errors, key, shot, focused, wait };
};

if (require.main === module) {
  (async () => {
    const t = await module.exports.launch();
    await t.wait(6000);
    await t.shot('01-home');
    console.log('focused:', await t.focused());
    console.log('errors:', t.errors);
    await t.browser.close();
  })().catch((e) => { console.error(e); process.exit(1); });
}
