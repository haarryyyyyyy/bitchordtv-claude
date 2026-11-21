// A remote-control walk through every screen, with a 1920×1080 screenshot of each.
const { launch } = require('./e2e');
(async () => {
  const t = await launch();
  const log = async (s) => console.log(s.padEnd(28), '→', await t.focused());
  await t.wait(6000); await log('boot');
  await t.shot('01-home');
  await t.key('ArrowDown'); await log('down');
  await t.key('ArrowRight', 2); await log('right x2');
  await t.shot('02-home-focus');
  await t.key('Enter'); await t.wait(3500); await log('open card');
  await t.shot('03-collection');
  await t.key('ArrowDown'); await t.key('ArrowDown'); await log('into tracks');
  await t.key('Enter'); await t.wait(6000); await log('play');
  await t.shot('04-now-playing-opened');
  const state = await t.page.evaluate(() => ({ playing: BC.player.playing(), time: BC.player.time(), dur: BC.player.duration(), q: (BC.player.stream() || {}).itag }));
  console.log('player', JSON.stringify(state));
  // Open Now Playing from the mini player.
  await t.wait(3000); await t.shot('05-now-playing');
  await t.wait(6000); await t.shot('06-now-playing-later');
  await t.key('ArrowRight', 3, 150); await log('to queue btn');
  await t.key('Enter'); await t.wait(800); await t.shot('06b-queue');
  await t.key('Escape'); await t.wait(600); await log('back from NP');
  await t.shot('06c-page-with-mini');
  // Search.
  await t.key('ArrowLeft', 6, 150); await log('to sidebar');
  await t.key('ArrowDown', 4, 150); await t.key('ArrowUp', 2, 150); await log('sidebar search');
  await t.key('Enter'); await t.wait(800); await log('search open');
  for (const ch of 'radiohe') await t.page.evaluate((c) => { const k = document.querySelector('.kb'); k._insert(c); }, ch);
  await t.wait(1500); await t.shot('07-search');
  await t.key('ArrowRight', 12, 100); await log('to suggestions');
  await t.shot('08-search-suggest');
  await t.key('Enter'); await t.wait(4000); await log('results');
  await t.shot('09-results');
  await t.key('ArrowLeft', 4, 150); await t.key('ArrowDown', 3, 150); await log('sidebar library');
  await t.key('Enter'); await t.wait(1200); await t.shot('10-library');
  await t.key('ArrowLeft', 3, 150); await t.key('ArrowDown', 2, 150); await t.key('Enter'); await t.wait(800); await log('settings');
  await t.shot('11-settings');
  await t.key('ArrowLeft', 3, 150); await t.key('ArrowUp', 3, 150); await t.key('Enter'); await t.wait(5000); await log('new');
  await t.shot('12-new');
  console.log('errors:', t.errors);
  await t.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
