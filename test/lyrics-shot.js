const { launch } = require('./e2e');
(async () => {
  const t = await launch();
  await t.wait(4500);
  await t.page.evaluate(() => BC.player.playList([{ id: 'ZVgHPSyEIqk', title: 'Let Down', artists: [{ name: 'Radiohead', id: null }], album: { name: 'OK Computer', id: null }, duration: 299, thumb: null }], 0));
  await t.wait(6000);
  await t.page.evaluate(() => BC.player.seek(58));
  await t.wait(5000);
  await t.shot('13-lyrics');
  const info = await t.page.evaluate(() => ({ src: document.querySelector('.lyrics-source').textContent, on: (document.querySelector('.lyric.on') || {}).textContent, sung: document.querySelectorAll('.lyric.on .w.sung').length, t: BC.player.time() }));
  console.log(JSON.stringify(info));
  // FPS while lyrics scroll and the backdrop warps, plus memory.
  const perf = await t.page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now(); let worst = 0, last = t0;
    (function f(now) { n++; worst = Math.max(worst, now - last); last = now; if (now - t0 < 5000) requestAnimationFrame(f); else res({ fps: Math.round(n / ((now - t0) / 1000)), worstFrameMs: Math.round(worst), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, nodes: document.getElementsByTagName('*').length }); })(t0);
  }));
  console.log('np perf', JSON.stringify(perf));
  console.log('errors', t.errors.filter((e) => !/404/.test(e)));
  await t.browser.close();
})();
