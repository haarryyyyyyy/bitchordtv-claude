const test = require('node:test');
const assert = require('node:assert');
const load = require('./load');
load('core.js');
require('../app/js/yt.js');
const yt = global.BC.yt;
const fx = (n) => require('./fixtures/innertube/' + n + '.json');

test('home: chips, shelves of cards and songs, continuation', () => {
  const h = yt.parseHome(fx('browse-home'));
  assert.ok(h.shelves.length >= 2, 'shelves');
  assert.ok(h.shelves.every((s) => s.title && s.items.length));
  // This anonymous capture has card shelves only; song rows are covered by the search and album tests.
  const cards = h.shelves.find((s) => s.kind === 'cards');
  assert.ok(cards.items[0].thumb && cards.items[0].target.kind);
  assert.ok(h.continuation, 'continuation token');
  assert.ok(h.chips.length > 3 && h.chips.every((c) => c.title));
});

test('suggestions', () => {
  const s = yt.parseSuggestions(fx('search-suggestions'));
  assert.ok(s.length >= 3);
  assert.ok(s.every((x) => /radioh/i.test(x)));
});

test('search (all): top result, songs, albums, artists', () => {
  const r = yt.parseSearch(fx('search-all'));
  assert.ok(r.top && r.top.title, 'top');
  assert.ok(r.songs.length >= 1, 'songs');
  assert.ok(r.albums.length + r.artists.length + r.playlists.length >= 2);
  assert.ok(r.songs[0].artists.length, 'artists on song row');
});

test('search (songs filter): durations and albums', () => {
  const r = yt.parseSearch(fx('search-songs'));
  assert.ok(r.songs.length >= 10);
  assert.ok(r.songs.filter((s) => s.duration > 60).length >= 8, 'durations');
  assert.ok(r.songs.some((s) => s.album && s.album.id), 'album links');
});

test('search (albums filter)', () => {
  const r = yt.parseSearch(fx('search-albums'));
  assert.ok(r.albums.length >= 5);
  assert.ok(r.albums.every((a) => /^MPREb_/.test(a.target.id)));
});

test('album: header, tracks numbered, playlist id', () => {
  const a = yt.parseAlbum(fx('browse-album'), 'MPREb_x');
  assert.ok(a.title && a.thumb && a.artists.length);
  assert.ok(a.tracks.length >= 5);
  assert.ok(a.tracks.every((t) => t.thumb && t.artists.length && t.album));
  assert.ok(a.tracks.filter((t) => t.duration).length >= a.tracks.length - 1, 'durations');
  assert.match(a.subtitle, /•/);
  assert.ok(a.playlistId, 'OLAK playlist id');
});

test('playlist: header, tracks', () => {
  const p = yt.parsePlaylist(fx('browse-playlist'), 'PLx');
  assert.ok(p.title && p.thumb);
  assert.ok(p.tracks.length >= 5);
  assert.ok(p.tracks.every((t) => t.id && t.title));
});

test('artist: name, top songs, shelves', () => {
  const a = yt.parseArtist(fx('browse-artist'), 'UCx');
  assert.ok(a.name && a.banner);
  assert.ok(a.top.length >= 3);
  assert.ok(a.shelves.length >= 2);
  assert.ok(a.shelves.some((s) => s.items.some((c) => c.target.kind === 'album')));
});

test('radio: songs, no videos when songs exist', () => {
  const r = yt.parseRadio(fx('next-radio'));
  assert.ok(r.tracks.length >= 10);
  assert.ok(r.tracks.every((t) => t.id && t.title && t.artists.length));
});

test('new releases grid', () => {
  const n = yt.parseNewAlbums(fx('browse-new-releases'));
  assert.ok(n.length >= 10);
});

test('moods & genres tiles with colours', () => {
  const m = yt.parseMoods(fx('browse-moods-and-genres'));
  assert.ok(m.length >= 1);
  assert.ok(m[0].tiles.length >= 5);
  assert.match(m[0].tiles[0].color, /^rgb\(/);
});

test('explore page parses as browse', () => {
  const b = yt.parseBrowse(fx('browse-explore'));
  assert.ok(b.shelves.length >= 2);
});

test('player: visionOS streams, opus first, loudness', () => {
  const p = yt.parsePlayer(fx('player-visionos'), [251, 140, 139]);
  assert.deepStrictEqual(p.streams.map((s) => s.itag), [251, 140, 139]);
  assert.ok(p.streams[0].opus && p.streams[0].kbps > 50);
  assert.ok(typeof p.streams[0].loudnessDb === 'number');
});

test('player: web-remix without PO token is unplayable', () => {
  assert.throws(() => yt.parsePlayer(fx('player-web-remix-no-potoken'), [251]), (e) => e.unplayable);
});

test('helpers: durations and counts', () => {
  assert.strictEqual(yt.parseDuration('4:59'), 299);
  assert.strictEqual(yt.parseDuration('1:02:03'), 3723);
  assert.strictEqual(yt.parseDuration('Radiohead'), null);
  assert.strictEqual(yt.count('3.6B plays'), 3600000000);
  assert.strictEqual(yt.count('12K subscribers'), 12000);
});

test('sized() asks the CDN for the display size (model.rs)', () => {
  const s = global.BC.sized;
  const base = 'https://yt3.ggpht.com/abc';
  assert.strictEqual(s(base + '=w120-h120-p-l90-rj', 544), base + '=w544-h544-p-l90-rj');
  assert.strictEqual(s(base + '=s88-c-k-c0x00ffffff-no-rj', 544), base + '=w544-h544-p-l90-rj');
  assert.strictEqual(s('https://lh3.googleusercontent.com/x=w120-h120-l90-rj', 544), 'https://lh3.googleusercontent.com/x=w544-h544-l90-rj');
  assert.strictEqual(s('https://lh3.googleusercontent.com/x=w1440-h600-p-l90-rj', 544), 'https://lh3.googleusercontent.com/x=w544-h544-l90-rj');
});
