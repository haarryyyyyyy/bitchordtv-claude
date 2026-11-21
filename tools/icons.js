// Renders the brand mark (app/js/brand.js) to PNG: the app icon and store assets.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
global.window = undefined;
require('../app/js/core.js'); require('../app/js/brand.js');
const BC = global.BC;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const figtree = 'data:font/ttf;base64,' + fs.readFileSync(path.join(__dirname, '../app/fonts/Figtree-ExtraBold.ttf')).toString('base64');
const mark = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF6479"/><stop offset="1" stop-color="#FA2A40"/></linearGradient></defs><path fill="url(#g)" d="${BC.SQUIRCLE}"/><g transform="translate(108 158) scale(0.405)" fill="#fff"><path d="${BC.ARCS.join('')}"/></g></svg>`;
const page = (w, h, body, bg) => `<html><head><style>@font-face{font-family:F;src:url(${figtree})}html,body{margin:0;width:${w}px;height:${h}px;background:${bg};display:flex;align-items:center;justify-content:center;flex-direction:column}.w{font:800 ${Math.round(h / 9)}px F;color:#F2F0F5;letter-spacing:-0.02em;margin-top:${Math.round(h / 28)}px}</style></head><body>${body}</body></html>`;
const JOBS = [
  ['app/icon.png', 512, 512, mark(512), 'transparent'],
  ['store/icon-512x512.png', 512, 512, mark(512), 'transparent'],
  ['store/icon-512x423.png', 512, 423, mark(380), 'transparent'],
  ['store/icon-1024x1024.png', 1024, 1024, mark(1024), 'transparent'],
  ['store/splash-1920x1080.png', 1920, 1080, mark(300) + '<div class="w">BitChord</div>', '#0C0A0E'],
  ['store/banner-1920x1080.png', 1920, 1080, '<div style="display:flex;align-items:center">' + mark(260) + '<div class="w" style="margin:0 0 0 56px;font-size:160px">BitChord</div></div>', '#0C0A0E']
];
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  for (const [out, w, h, body, bg] of JOBS) {
    await p.setViewport({ width: w, height: h });
    await p.setContent(page(w, h, body, bg), { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(__dirname, '..', out), omitBackground: bg === 'transparent' });
    console.log('wrote', out);
  }
  await b.close();
})();
