// Gate: nothing in the widget that Tizen 6.0's Chromium 76 cannot run (docs/DESIGN_SPEC.md, Precedence).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..', 'app');
const files = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? files(path.join(dir, d.name), ext) : d.name.endsWith(ext) ? [path.join(dir, d.name)] : []);
// Strip comments and string/regex-free noise is not needed: the patterns are syntax-shaped.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const JS_BANNED = [
  [/\?\.[\w([]/, 'optional chaining (Chromium 80)'],
  [/\?\?/, 'nullish coalescing (Chromium 80)'],
  [/\.at\(-?\d/, 'Array.prototype.at (Chromium 92)'],
  [/\.replaceAll\(/, 'replaceAll (Chromium 85)'],
  [/structuredClone/, 'structuredClone (Chromium 98)'],
  [/Object\.hasOwn\(/, 'Object.hasOwn (Chromium 93)'],
  [/\p\{/, 'Unicode property escapes (Chromium 64)'],
  [/\bimport\s|export\s/, 'ES modules (kept to plain scripts)'],
  [/\.flat\(|\.flatMap\(/, 'flat/flatMap (Chromium 69, fine on 6.0 but not Tizen 4/5)'],
];
const CSS_BANNED = [
  [/(^|[;{\s])gap\s*:/, 'flex/grid gap (Chromium 84 for flex)'],
  [/(^|[;{\s])inset\s*:/, 'inset (Chromium 87)'],
  [/aspect-ratio/, 'aspect-ratio (Chromium 88)'],
  [/:focus-visible/, ':focus-visible (Chromium 86)'],
  [/@starting-style/, '@starting-style'],
  [/oklch\(|color-mix\(/, 'oklch/color-mix'],
  [/:is\(|:where\(/, ':is/:where (Chromium 88)'],
  [/@container/, 'container queries'],
  [/(^|[;{\s])(scale|translate|rotate)\s*:/, 'standalone transform properties (Chromium 104)']
];

test('JavaScript uses only Chromium 76 syntax and APIs', () => {
  for (const f of files(path.join(APP, 'js'), '.js')) {
    const src = strip(fs.readFileSync(f, 'utf8'));
    for (const [re, what] of JS_BANNED) assert.ok(!re.test(src), path.basename(f) + ': ' + what);
    // Parses as a classic script.
    assert.doesNotThrow(() => new Function(src), path.basename(f));
  }
});

test('CSS uses only Chromium 76 features', () => {
  for (const f of files(path.join(APP, 'css'), '.css')) {
    const src = strip(fs.readFileSync(f, 'utf8'));
    for (const [re, what] of CSS_BANNED) assert.ok(!re.test(src), path.basename(f) + ': ' + what);
  }
});

test('every script in index.html exists, and every app script is loaded', () => {
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const listed = [...html.matchAll(/src="(js\/[^"]+)"/g)].map((m) => m[1]);
  for (const s of listed) assert.ok(fs.existsSync(path.join(APP, s)), s);
  for (const f of files(path.join(APP, 'js'), '.js')) assert.ok(listed.includes('js/' + path.basename(f)), 'not loaded: ' + path.basename(f));
});
