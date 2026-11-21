// Startup, frame rate under held arrows, and memory, with the CPU slowed 6× to approximate
// a mid-range TV. Desktop numbers are an estimate, not a TV measurement.
const { launch } = require('./e2e');
const fpsDuring = (page, ms) => page.evaluate((ms) => new Promise((res) => {
  const t0 = performance.now(); let n = 0, worst = 0, last = t0, long = 0;
  (function f(now) { n++; const d = now - last; worst = Math.max(worst, d); if (d > 33.4) long++; last = now; if (now - t0 < ms) requestAnimationFrame(f); else res({ fps: Math.round(n / ((now - t0) / 1000)), worstFrameMs: Math.round(worst), framesOver33ms: long }); })(t0);
}), ms);
(async () => {
  const t = await launch();
  const cdp = await t.page.target().createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await t.page.reload({ waitUntil: 'load' });
  const t0 = Date.now();
  await t.page.waitForFunction(() => document.querySelectorAll('.shelf .card').length > 4 && !document.body.classList.contains('splash-on'), { timeout: 30000 });
  const startup = Date.now() - t0;
  const nav = await t.page.evaluate(() => { const e = performance.getEntriesByType('navigation')[0]; return { domContentLoadedMs: Math.round(e.domContentLoadedEventEnd), loadMs: Math.round(e.loadEventEnd) }; });
  await t.wait(1500);
  await t.key('ArrowDown');
  const p1 = fpsDuring(t.page, 3000);
  for (let i = 0; i < 25; i++) { await t.page.keyboard.press('ArrowRight'); await t.wait(75); }
  const scroll = await p1;
  const p2 = fpsDuring(t.page, 3000);
  for (let i = 0; i < 12; i++) { await t.page.keyboard.press('ArrowDown'); await t.wait(150); }
  const vscroll = await p2;
  const mem = await t.page.evaluate(() => ({ heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576), domNodes: document.getElementsByTagName('*').length, images: document.images.length }));
  console.log(JSON.stringify({ cpuThrottle: '6x', startupToHomeMs: startup, ...nav, rowScrollHeldRight: scroll, pageScrollDown: vscroll, ...mem }, null, 1));
  await t.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
