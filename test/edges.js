// Edge cases the main journey can't reach: before anything plays, Down past the end of a
// short page must stay on a visible item (the hidden mini player is not focusable).
const { launch } = require('./e2e');
(async () => {
  const t = await launch('?view=settings');
  await t.wait(2500);
  await t.key('ArrowDown', 25, 90);
  const r = await t.page.evaluate(() => {
    const f = BC.nav.focused();
    const rect = f.getBoundingClientRect();
    return { label: (f.getAttribute('aria-label') || f.textContent).slice(0, 40), inMini: !!f.closest('.mini'), visible: getComputedStyle(f.closest('.mini') || f).opacity !== '0' && rect.height > 0 };
  });
  console.log(JSON.stringify(r));
  await t.browser.close();
  if (r.inMini || !r.visible) { console.error('FAIL: focus left the visible page'); process.exit(1); }
  console.log('PASS: focus stays on the page before anything plays');
})();
