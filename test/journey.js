// A remote-control walk through every screen, with a 1920×1080 screenshot of each.
const { launch } = require('./e2e');
(async () => {
  const t = await launch();
  const log = async (s) => console.log(s.padEnd(28), '→', await t.focused());
  await t.wait(6000); await log('boot');
  await t.shot('01-home');
  // Song rows lead Home now: go to the first card shelf.
  await t.page.evaluate(() => BC.nav.focus(document.querySelector('.page .card')));
  await t.key('ArrowRight', 2); await log('card, right x2');
  await t.shot('02-home-focus');
  await t.key('Enter'); await t.wait(3500); await log('open card');
  await t.shot('03-collection');
  await t.key('ArrowDown'); await t.key('ArrowDown'); await log('into tracks');
  await t.key('Enter'); await t.wait(6000); await log('play');
  const state = await t.page.evaluate(() => ({ playing: BC.player.playing(), time: BC.player.time(), dur: BC.player.duration(), q: (BC.player.stream() || {}).itag }));
  console.log('player', JSON.stringify(state));
  await t.wait(3000); await t.shot('05-now-playing');
  await t.key('ArrowDown'); await t.key('ArrowRight'); await t.key('Enter'); await t.wait(800); await log('Up next');
  await t.shot('06b-queue');
  await t.key('Escape'); await t.key('Escape'); await t.wait(700); await log('back from NP');
  await t.key('ArrowUp', 10, 120); await log('up to the bar');
  await t.shot('06c-bar');
  await t.key('ArrowLeft', 6, 120); await log('left to the pill');
  await t.shot('06d-pill');
  await t.key('ArrowRight', 4, 150); await log('to Search tab'); // pill, play/pause, Home, New, Search
  await t.key('Enter'); await t.wait(800); await log('search open');
  for (const ch of 'radiohe') await t.page.evaluate((c) => { document.querySelector('.kb')._insert(c); }, ch);
  await t.wait(1500); await t.shot('07-search');
  await t.key('ArrowRight', 12, 100); await log('to suggestions');
  await t.shot('08-search-suggest');
  await t.key('Enter'); await t.wait(4000); await log('results');
  await t.shot('09-results');
  await t.key('ArrowUp', 8, 120); await t.key('ArrowRight'); await log('to Library tab');
  await t.key('Enter'); await t.wait(1200); await t.shot('10-library');
  await t.key('ArrowUp', 6, 120); await t.key('ArrowRight'); await t.key('Enter'); await t.wait(800); await log('settings');
  await t.shot('11-settings');
  await t.key('ArrowUp', 8, 120); await t.key('ArrowLeft', 3, 150); await t.key('Enter'); await t.wait(5000); await log('new');
  await t.shot('12-new');
  console.log('errors:', t.errors.filter((e) => !/40[49]|429/.test(e)));
  await t.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
