// Playback through MSE: past the first fragment, a seek far ahead, and the hand-off at the end.
const { launch } = require('./e2e');
(async () => {
  const t = await launch();
  await t.wait(4000);
  const state = () => t.page.evaluate(() => ({ t: Math.round(BC.player.time() * 10) / 10, playing: BC.player.playing(), id: (BC.player.current() || {}).id, itag: (BC.player.stream() || {}).itag, src: BC.player.audio.src.slice(0, 5) }));
  await t.page.evaluate(() => BC.player.playList([
    { id: 'ZVgHPSyEIqk', title: 'Let Down', artists: [{ name: 'Radiohead', id: null }], duration: 299 },
    { id: 'u5CVsCnxyXg', title: 'Karma Police', artists: [{ name: 'Radiohead', id: null }], duration: 264 }
  ], 0));
  await t.wait(18000);
  const a = await state(); console.log('after 18 s', JSON.stringify(a));
  await t.page.evaluate(() => BC.player.seek(240)); await t.wait(5000);
  const b = await state(); console.log('after seek to 240', JSON.stringify(b));
  await t.page.evaluate(() => BC.player.seek(294)); await t.wait(12000);
  const c = await state(); console.log('after the end', JSON.stringify(c));
  const ok = a.t > 15 && a.src === 'blob:' && b.t >= 240 && b.t < 250 && c.id === 'u5CVsCnxyXg' && c.playing;
  console.log(ok ? 'PASS' : 'FAIL', 'errors:', t.errors.filter((e) => !/404/.test(e)));
  await t.browser.close();
  process.exit(ok ? 0 : 1);
})();
