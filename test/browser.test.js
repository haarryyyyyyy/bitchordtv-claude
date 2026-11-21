// Navigation engine and keyboard, in headless Chrome (real layout). Needs no server.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let browser, page;
const key = () => page.evaluate(() => BC.nav.focused() && BC.nav.focused().getAttribute('data-key'));
const move = (d, n = 1) => page.evaluate((d, n) => { for (let i = 0; i < n; i++) BC.nav.move(d); }, d, n);

test.before(async () => {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  page = await browser.newPage();
  await page.goto(require('url').pathToFileURL(path.join(__dirname, 'nav.html')).href);
  await page.evaluate(() => BC.nav.restore());
});
test.after(() => browser && browser.close());

test('starts on the first item and moves within a row', async () => {
  assert.strictEqual(await key(), 's1');
  await move('right'); assert.strictEqual(await key(), 'a1');
  await move('right', 2); assert.strictEqual(await key(), 'a3');
});

test('per-row focus memory: down and back up returns to the same item', async () => {
  await move('down'); assert.strictEqual(await key(), 'b2', 'nearest by x in the shorter row');
  await move('up'); assert.strictEqual(await key(), 'a3', 'remembered item, not the first');
});

test('edges bubble: left from a row start goes to the sidebar, right comes back to memory', async () => {
  await move('left', 3); assert.strictEqual(await key(), 's1');
  await move('down'); assert.strictEqual(await key(), 's2');
  await move('right'); assert.strictEqual(await key(), 'a1');
  await move('right', 2); await move('left', 3); await move('right');
  assert.strictEqual(await key(), 'a1');
});

test('grid moves by columns and stops at the edge', async () => {
  await page.evaluate(() => BC.nav.focus(document.querySelector('[data-key=g1]')));
  await move('right'); assert.strictEqual(await key(), 'g2');
  // Three 116 px items fit a row of the 400 px grid: g1 g2 g3 / g4 g5.
  await move('down'); assert.strictEqual(await key(), 'g5');
  await move('right'); assert.strictEqual(await key(), 'g5', 'stops at the row end');
  await move('left'); assert.strictEqual(await key(), 'g4');
  await move('up'); assert.strictEqual(await key(), 'g1');
});

test('focus survives a re-render through memory keys', async () => {
  await page.evaluate(() => BC.nav.focus(document.querySelector('[data-key=a4]')));
  await page.evaluate(() => {
    const row = document.querySelector('[data-key=row1]');
    row.outerHTML = row.outerHTML; // replace every node
    BC.nav.focusKey(document.querySelector('[data-key=main]').parentElement, 'main');
  });
  assert.strictEqual(await key(), 'a4');
});

test('a layer traps focus and returns it when popped', async () => {
  await page.evaluate(() => BC.nav.focus(document.querySelector('[data-key=b1]')));
  await page.evaluate(() => { window.ret = BC.nav.focused(); BC.nav.pushLayer(document.getElementById('layer')); });
  assert.strictEqual(await key(), 'm1');
  await move('left'); assert.strictEqual(await key(), 'm1', 'cannot leave the layer');
  await move('down'); assert.strictEqual(await key(), 'm2');
  await page.evaluate(() => BC.nav.popLayer(window.ret));
  assert.strictEqual(await key(), 'b1');
});

test('keyboard: typing, cursor keys, color keys, layouts', async () => {
  const r = await page.evaluate(() => {
    const out = [];
    let text = '';
    const kb = BC.Keyboard({ onChange: (t) => { text = t; }, onSubmit: (t) => out.push('submit:' + t) });
    document.body.appendChild(kb);
    kb._insert('a'); kb._insert('c');
    kb.handleKey('rewind'); kb._insert('b');            // cursor moved left: a|c -> abc
    out.push(text, kb.cursor());
    kb.handleKey('yellow'); kb.handleKey('digit7');      // space and a digit
    out.push(text);
    kb.handleKey('ff'); kb._backspace();
    out.push(text);
    kb.handleKey('green'); out.push('[' + text + ']');  // clear
    kb.setText('x'); kb.handleKey('blue');
    out.push(Object.keys(BC.Keyboard.LAYOUTS).join(','));
    out.push(kb.querySelectorAll('.kb-key').length > 40);
    return out;
  });
  assert.deepStrictEqual(r, ['abc', 2, 'ab 7c', 'ab 7', '[]', 'submit:x', 'en,de,es,fr,ru', true]);
});
