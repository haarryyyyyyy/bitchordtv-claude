// Now Playing states: seek bar focus, Lyrics toggle hides the panel, Up next, and the mini player.
const { launch } = require('./e2e');
(async () => {
  const t = await launch();
  await t.wait(4500);
  await t.page.evaluate(() => BC.player.playList([
    { id: 'ZVgHPSyEIqk', title: 'Let Down', artists: [{ name: 'Radiohead', id: null }], album: { name: 'OK Computer', id: null }, duration: 299 },
    { id: 'u5CVsCnxyXg', title: 'Karma Police', artists: [{ name: 'Radiohead', id: null }], duration: 264 }], 0));
  await t.wait(7000);
  await t.page.evaluate(() => BC.player.seek(58));
  await t.key('ArrowUp'); await t.wait(400);                       // Play -> seek bar
  const onBar = await t.focused();
  await t.key('ArrowRight'); await t.wait(5500);
  await t.shot('20-np-seek-focused');
  await t.key('ArrowDown'); await t.key('ArrowDown'); await t.key('ArrowLeft'); await t.wait(300); // -> row 2, Lyrics pill
  const onPill = await t.focused();
  await t.key('Enter'); await t.wait(900);
  const off = await t.page.evaluate(() => document.querySelector('.np').classList.contains('panel-off'));
  await t.shot('21-np-panel-off');
  await t.key('ArrowRight'); await t.key('Enter'); await t.wait(900);   // Up next
  await t.shot('22-np-queue');
  const q = await t.page.evaluate(() => ({ queue: document.querySelector('.np').classList.contains('show-queue'), off: document.querySelector('.np').classList.contains('panel-off') }));
  await t.key('Escape'); await t.wait(700);
  await t.shot('23-page-with-mini');
  console.log(JSON.stringify({ onBar, onPill, panelOffAfterLyrics: off, afterUpNext: q }));
  console.log('errors', t.errors.filter((e) => !/404/.test(e)));
  await t.browser.close();
})();
