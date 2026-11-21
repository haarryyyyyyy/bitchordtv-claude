const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const load = require('./load');
load('core.js');
require('../app/js/lyrics.js');
const L = global.BC.lyrics;
const lx = (n) => fs.readFileSync(__dirname + '/fixtures/lyrics/' + n, 'utf8');

test('lrc.red TTML: word timed, syllables glued into words', () => {
  const lines = L.parseTtml(lx('lrc-red-document.ttml'));
  assert.ok(lines.length > 20);
  const first = lines[0];
  assert.strictEqual(first.text, 'Transport');           // "Trans" + "port" spans, one word
  assert.strictEqual(first.words.length, 1);
  assert.strictEqual(first.time, 22242);
  assert.ok(lines.every((l, i) => i === 0 || l.time >= lines[i - 1].time), 'sorted');
  assert.ok(lines.every((l) => l.words.every((w) => w.end >= w.start)));
});

test('Unison TTML from its JSON envelope', () => {
  const u = JSON.parse(lx('unison.json'));
  const lines = L.parseTtml(u.data.lyrics);
  assert.ok(lines.length > 20);
  assert.ok(lines[0].time > 20000 && lines[0].words.length);
  assert.match(lines.map((l) => l.text).join(' '), /Transport/);
});

test('LRCLIB synced LRC', () => {
  const d = JSON.parse(lx('lrclib-get.json'));
  const lines = L.parseLrc(d.syncedLyrics);
  assert.strictEqual(lines[0].text, 'Transport');
  assert.strictEqual(lines[0].time, 22070);
  assert.ok(lines.length > 20);
});

test('enhanced LRC words, entity decoding, multi-stamp lines', () => {
  const lines = L.parseLrc('[00:01.00]<00:01.00>Hel<00:01.50>lo &amp; bye\n[00:05.00][00:09.50]Chorus');
  assert.strictEqual(lines[0].text, 'Hello & bye');
  assert.strictEqual(lines[0].words.length, 2);
  assert.strictEqual(lines[0].words[0].end, 1500);
  assert.deepStrictEqual(lines.map((l) => l.time), [1000, 5000, 9500]);
});

test('TTML: background vocals, skipped translations, duet sides', () => {
  const xml = '<tt><head><metadata><ttm:agent type="person" xml:id="v1"/><ttm:agent type="person" xml:id="v2"/></metadata></head><body><div>' +
    '<p begin="1.0" end="2.0" ttm:agent="v1"><span begin="1.0" end="1.5">One</span> <span begin="1.5" end="2.0">two</span><span ttm:role="x-bg"><span begin="1.6" end="1.9">(echo)</span></span><span ttm:role="x-translation">Uno dos</span></p>' +
    '<p begin="3.0" end="4.0" ttm:agent="v2"><span begin="3.0" end="4.0">Three</span></p></div></body></tt>';
  const lines = L.parseTtml(xml);
  assert.strictEqual(lines[0].text, 'One two');
  assert.strictEqual(lines[0].bg.text, '(echo)');
  assert.strictEqual(lines[0].align, 'start');
  assert.strictEqual(lines[1].align, 'end');
});

test('plain lyrics are unsynced', () => {
  const lines = L.parsePlain('a\n\nb');
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(lines[0].time, -1);
});

test('lrc.red hit choice: title, artist and duration (best_lrcred_hit)', () => {
  const hits = JSON.parse(lx('lrc-red-search.json')).hits;
  const hit = L.bestLrcredHit(hits, { song: 'Let Down', artist: 'Radiohead', duration: 299 });
  assert.strictEqual(hit.isrc, 'GBAYE9701374');
  assert.strictEqual(L.bestLrcredHit(hits, { song: 'Let Down', artist: 'Radiohead', duration: 100 }), null);
});

test('title cleanup for text-matched providers', () => {
  assert.strictEqual(L.cleanTitle('Let Down (Official Video)'), 'Let Down');
  assert.strictEqual(L.cleanTitle('Song [Remastered 2011]'), 'Song');
  assert.strictEqual(L.cleanTitle('(Untitled)'), '(Untitled)');
});

test('lineAt finds the sung line', () => {
  const lines = [{ time: 1000 }, { time: 2000 }, { time: 5000 }];
  assert.strictEqual(L.lineAt(lines, 500), -1);
  assert.strictEqual(L.lineAt(lines, 2000), 1);
  assert.strictEqual(L.lineAt(lines, 9000), 2);
});
