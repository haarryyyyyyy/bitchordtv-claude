// Converts the PC app's Lucide icon font (subset) into SVG paths on the icon's design grid,
// so icons centre geometrically instead of by font metrics. Writes app/js/icons.js.
const fs = require('fs');
const path = require('path');
// Source: the PC repo's icon font (ref/ is a local clone of BitChord-PC-Official).
const b = fs.readFileSync(path.join(__dirname, '../ref/pc/assets/fonts/lucide.ttf'));
const T = {};
for (let i = 0, n = b.readUInt16BE(4); i < n; i++) { const o = 12 + i * 16; T[b.toString('latin1', o, o + 4)] = b.readUInt32BE(o + 8); }
const upm = b.readUInt16BE(T.head + 18), locFmt = b.readInt16BE(T.head + 50);
const asc = b.readInt16BE(T.hhea + 4), desc = b.readInt16BE(T.hhea + 6);
const numGlyphs = b.readUInt16BE(T.maxp + 4), numHM = b.readUInt16BE(T.hhea + 34);
const adv = (g) => b.readUInt16BE(T.hmtx + Math.min(g, numHM - 1) * 4);
const loca = (g) => locFmt ? b.readUInt32BE(T.loca + g * 4) : b.readUInt16BE(T.loca + g * 2) * 2;
// cmap format 4
const cmap = {};
for (let i = 0, nt = b.readUInt16BE(T.cmap + 2); i < nt; i++) {
  const off = T.cmap + b.readUInt32BE(T.cmap + 4 + i * 8 + 4);
  if (b.readUInt16BE(off) !== 4) continue;
  const seg = b.readUInt16BE(off + 6) / 2, ec = off + 14, sc = ec + seg * 2 + 2, dl = sc + seg * 2, ro = dl + seg * 2;
  for (let s = 0; s < seg; s++) {
    const e = b.readUInt16BE(ec + s * 2), st = b.readUInt16BE(sc + s * 2), d = b.readInt16BE(dl + s * 2), r = b.readUInt16BE(ro + s * 2);
    for (let c = st; c <= e && c !== 0xffff; c++) { let g; if (!r) g = (c + d) & 0xffff; else { g = b.readUInt16BE(ro + s * 2 + r + (c - st) * 2); if (g) g = (g + d) & 0xffff; } cmap[c] = g; }
  }
}
function glyph(g) {
  const start = T.glyf + loca(g), end = T.glyf + loca(g + 1);
  if (end === start) return null;
  const nC = b.readInt16BE(start);
  if (nC < 0) throw new Error('composite glyph ' + g);
  const box = [b.readInt16BE(start + 2), b.readInt16BE(start + 4), b.readInt16BE(start + 6), b.readInt16BE(start + 8)];
  let p = start + 10;
  const ends = []; for (let i = 0; i < nC; i++) { ends.push(b.readUInt16BE(p)); p += 2; }
  const n = ends[nC - 1] + 1;
  p += 2 + b.readUInt16BE(p);
  const flags = [];
  while (flags.length < n) { const f = b[p++]; flags.push(f); if (f & 8) { let r = b[p++]; while (r--) flags.push(f); } }
  const xs = [], ys = [];
  let v = 0;
  for (const f of flags) { if (f & 2) { const d = b[p++]; v += f & 16 ? d : -d; } else if (!(f & 16)) { v += b.readInt16BE(p); p += 2; } xs.push(v); }
  v = 0;
  for (const f of flags) { if (f & 4) { const d = b[p++]; v += f & 32 ? d : -d; } else if (!(f & 32)) { v += b.readInt16BE(p); p += 2; } ys.push(v); }
  const pts = xs.map((x, i) => ({ x, y: ys[i], on: !!(flags[i] & 1) }));
  return { box, pts, ends };
}
module.exports = { upm, asc, desc, cmap, glyph, adv };
if (require.main === module) {
  const cps = Object.keys(cmap).map(Number).filter((c) => cmap[c]);
  const boxes = cps.map((c) => glyph(cmap[c])).filter(Boolean).map((g) => g.box);
  const u = [Math.min(...boxes.map((x) => x[0])), Math.min(...boxes.map((x) => x[1])), Math.max(...boxes.map((x) => x[2])), Math.max(...boxes.map((x) => x[3]))];
  console.log({ upm, asc, desc, adv: adv(cmap[0xe12e]), union: u, pause: glyph(cmap[0xe12e]).box, play: glyph(cmap[0xe13c]).box });
}

// ---- Emit app/js/icons.js: glyph outlines as SVG paths (y flipped, 1000-unit grid).
function toPath(gl) {
  if (!gl) return '';
  const r = (n) => Math.round(n);
  let d = '', s = 0;
  for (const e of gl.ends) {
    const pts = gl.pts.slice(s, e + 1).map((p) => ({ x: p.x, y: 1000 - p.y, on: p.on }));
    s = e + 1;
    // Start on an on-curve point (or the midpoint of two off-curve points).
    let i0 = pts.findIndex((p) => p.on);
    let start;
    if (i0 < 0) { start = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2, on: true }; pts.unshift(start); i0 = 0; }
    const ring = pts.slice(i0).concat(pts.slice(0, i0));
    d += 'M' + r(ring[0].x) + ' ' + r(ring[0].y);
    for (let i = 1; i <= ring.length; i++) {
      const p = ring[i % ring.length];
      if (p.on) { d += 'L' + r(p.x) + ' ' + r(p.y); continue; }
      const n = ring[(i + 1) % ring.length];
      const end = n.on ? n : { x: (p.x + n.x) / 2, y: (p.y + n.y) / 2 };
      d += 'Q' + r(p.x) + ' ' + r(p.y) + ' ' + r(end.x) + ' ' + r(end.y);
      if (n.on) i++;
    }
    d += 'Z';
  }
  return d;
}
if (require.main === module && process.argv[2] === 'emit') {
  const NAMES = { home: 0xe0f5, compass: 0xe09b, library: 0xe100, search: 0xe151, left: 0xe06e, right: 0xe06f, up: 0xe070, down: 0xe06d,
    play: 0xe13c, pause: 0xe12e, prev: 0xe15f, next: 0xe160, shuffle: 0xe15e, heart: 0xe0f2, list: 0xe2e0, x: 0xe1b2, history: 0xe1f5,
    trash: 0xe18e, more: 0xe0b7, listPlus: 0xe23f, radio: 0xe142, disc: 0xe494, user: 0xe19f, settings: 0xe154, music: 0xe122,
    sparkles: 0xe412, check: 0xe06c, repeat: 0xe146, repeat1: 0xe1fd, lyrics: 0xe349, plus: 0xe13d, loader: 0xe10a, thumbsDown: 0xe189 };
  const out = {};
  for (const [k, cp] of Object.entries(NAMES)) { if (!cmap[cp]) throw new Error('missing ' + k); out[k] = toPath(glyph(cmap[cp])); }
  const js = '/* Lucide icons (ISC licence) as SVG paths on a 1000-unit grid, generated from the PC app\'s\n * icon font by tools/ttf2svg.js. SVG centres exactly; font glyphs drifted with text metrics. */\n' +
    '(function (root) {\n  \'use strict\';\n  root.BC.ICON_PATHS = ' + JSON.stringify(out, null, 0).replace(/","/g, '",\n    "') + ';\n})(typeof window !== \'undefined\' ? window : global);\n';
  fs.writeFileSync(path.join(__dirname, '../app/js/icons.js'), js);
  console.log('wrote app/js/icons.js', Object.keys(out).length, 'icons', js.length, 'bytes');
}
