/* Lyrics: the free sources BitChord PC uses that need no key (lyrics.rs), in its order:
 * Unison, lrc.red, then LRCLIB directly (PC reaches LRCLIB through the Better Lyrics API,
 * which needs a Turnstile JWT a TV cannot get). Formats: TTML (word or line timed), LRC
 * (plain or enhanced <mm:ss.xx> words) and plain text. No DOM needed, so Node tests run it.
 *
 * Line: { time, end, text, words: [{start, end, text}], bg: Line|null, align: 'start'|'end' } (ms). */
(function (root) {
  'use strict';
  var BC = root.BC;

  function decode(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&#x([0-9a-f]+);/gi, function (m, h) { var n = parseInt(h, 16); return n <= 0x10ffff ? String.fromCodePoint(n) : m; })
      .replace(/&#(\d+);/g, function (m, d) { var n = Number(d); return n <= 0x10ffff ? String.fromCodePoint(n) : m; })
      .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  /** TTML clock values: 27.395, 1:05.20, 1:02:03.4, or a number with s or ms. */
  function ttmlTime(v) {
    if (!v) return null;
    v = v.trim();
    if (/ms$/.test(v)) { var ms = Number(v.slice(0, -2)); return isFinite(ms) ? Math.round(ms) : null; }
    var parts = v.replace(/s$/, '').split(':').map(Number);
    if (parts.length > 3 || parts.some(function (p) { return !isFinite(p); })) return null;
    return Math.round(parts.reduce(function (t, p) { return t * 60 + p; }, 0) * 1000);
  }

  function attrs(s) {
    var out = {};
    var re = /([\w:.-]+)\s*=\s*"([^"]*)"/g, m;
    while ((m = re.exec(s))) {
      out[m[1]] = m[2];
      var local = m[1].split(':').pop();
      if (!(local in out)) out[local] = m[2];
    }
    return out;
  }

  /** Glue timed pieces into words: whitespace, not the span boundary, ends a word (TtmlLyrics.kt). */
  function mergeWords(pieces) {
    var words = [], cur = '', start = 0, end = 0, timed = false;
    function flush() {
      var t = cur.trim();
      if (t && timed) words.push({ start: start, end: end, text: t });
      cur = ''; timed = false;
    }
    pieces.forEach(function (p) {
      if (p.start === undefined) {               // untimed text between spans
        if (!p.text.trim()) flush();
        else if (timed) cur += p.text;
        return;
      }
      if (!p.text.trim()) return;
      if (/^\s/.test(p.text)) flush();
      if (!cur) start = p.start;
      cur += p.text.trim();
      end = p.end;
      timed = true;
      if (/\s$/.test(p.text)) flush();
    });
    flush();
    return words;
  }

  function parseTtml(xml) {
    var agents = {}, order = [];
    var am, are = /<(?:ttm:)?agent\b([^>]*)\/?>/g;
    while ((am = are.exec(xml))) {
      var a = attrs(am[1]);
      var id = a['xml:id'] || a.id;
      if (id) agents[id] = a.type || 'person';
    }
    var lines = [];
    var pm, pre = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
    while ((pm = pre.exec(xml))) {
      var pa = attrs(pm[1]);
      var pieces = [], bgPieces = [], stack = [];
      var tm, tre = /<(\/?)span\b([^>]*?)(\/?)>|([^<]+)|<[^>]*>/g;
      while ((tm = tre.exec(pm[2]))) {
        if (tm[4] !== undefined) {
          var skip = stack.some(function (s) { return s.role === 'x-translation' || s.role === 'x-roman'; });
          if (skip) continue;
          var bg = stack.some(function (s) { return s.role === 'x-bg'; });
          var timedSpan = null;
          for (var i = stack.length - 1; i >= 0; i--) { if (stack[i].begin !== null && stack[i].end !== null) { timedSpan = stack[i]; break; } }
          var txt = decode(tm[4]);
          (bg ? bgPieces : pieces).push(timedSpan ? { text: txt, start: timedSpan.begin, end: timedSpan.end } : { text: txt });
        } else if (tm[1]) {
          stack.pop();
        } else if (tm[0].indexOf('<span') === 0) {
          var sa = attrs(tm[2]);
          var entry = { role: sa['ttm:role'] || sa.role || '', begin: ttmlTime(sa.begin), end: ttmlTime(sa.end) };
          if (!tm[3]) stack.push(entry);
        }
      }
      var words = mergeWords(pieces);
      var bgWords = mergeWords(bgPieces);
      var background = bgWords.length ? { time: bgWords[0].start, end: bgWords[bgWords.length - 1].end, text: bgWords.map(function (w) { return w.text; }).join(' '), words: bgWords, bg: null, align: 'start' } : null;
      var begin = ttmlTime(pa.begin), endT = ttmlTime(pa.end);
      var agent = pa['ttm:agent'] || pa.agent || null;
      if (agent && order.indexOf(agent) < 0) order.push(agent);
      if (!words.length) {
        var plain = decode(pm[2].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
        if (!plain) continue;
        lines.push({ time: begin === null ? -1 : begin, end: endT !== null && begin !== null && endT > begin ? endT : null, text: plain, words: [], bg: null, agent: agent });
        continue;
      }
      lines.push({
        time: Math.min(begin === null ? words[0].start : begin, words[0].start),
        end: words[words.length - 1].end,
        text: words.map(function (w) { return w.text; }).join(' '),
        words: words, bg: background, agent: agent
      });
    }
    // Duets: the first voice on the left, the other voice on the right; a group sings on the left.
    lines.forEach(function (l) {
      l.align = l.agent && agents[l.agent] !== 'group' && order.indexOf(l.agent) === 1 ? 'end' : 'start';
      delete l.agent;
    });
    var timed = lines.some(function (l) { return l.time >= 0; });
    if (!timed) lines.forEach(function (l) { l.time = -1; });
    lines.sort(function (a, b) { return a.time - b.time; });
    return lines;
  }

  var LRC_LINE = /^((?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+)(.*)$/;
  var LRC_STAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  var WORD = /<(\d{1,3}):(\d{2})[.:](\d{2,3})>([^<]*)/g;
  function stampMs(m, s, f) {
    var frac = f ? (f.length === 3 ? Number(f) : f.length === 2 ? Number(f) * 10 : Number(f) * 100) : 0;
    return Number(m) * 60000 + Number(s) * 1000 + frac;
  }

  function parseLrc(text) {
    var lines = [];
    String(text).split(/\r?\n/).forEach(function (raw) {
      var m = LRC_LINE.exec(raw.trim());
      if (!m) return;
      var body = m[2];
      var words = [], wm;
      WORD.lastIndex = 0;
      while ((wm = WORD.exec(body))) {
        var t = wm[4].trim();
        if (t) words.push({ start: stampMs(wm[1], wm[2], wm[3]), end: 0, text: decode(t) });
      }
      var plain = decode(body.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
      var sm;
      LRC_STAMP.lastIndex = 0;
      while ((sm = LRC_STAMP.exec(m[1]))) {
        lines.push({ time: stampMs(sm[1], sm[2], sm[3]), end: null, text: plain, words: words.map(function (w) { return Object.assign({}, w); }), bg: null, align: 'start' });
      }
    });
    lines.sort(function (a, b) { return a.time - b.time; });
    // A word ends where the next begins; the last word of a line where the next line starts.
    lines.forEach(function (l, i) {
      var next = lines[i + 1] ? lines[i + 1].time : (l.words.length ? l.words[l.words.length - 1].start + 800 : null);
      l.words.forEach(function (w, j) { w.end = l.words[j + 1] ? l.words[j + 1].start : Math.max(w.start, Math.min(next || w.start + 800, w.start + 2000)); });
      if (l.words.length) l.end = l.words[l.words.length - 1].end;
    });
    // Empty LRC lines are instrumental breaks, not lines to show.
    return lines.filter(function (l) { return l.text; });
  }

  function parsePlain(text) {
    return String(text).split(/\r?\n/).map(function (t) { return t.trim(); }).filter(Boolean)
      .map(function (t) { return { time: -1, end: null, text: t, words: [], bg: null, align: 'start' }; });
  }

  // ---- Matching (lyrics.rs best_lrcred_hit) ----------------------------------------------
  function fold(s) {
    // ASCII punctuation and spaces only: \p{L} needs Chromium 64 (Tizen 5 has 63).
    return String(s || '').toLowerCase().replace(/[\s!-\/:-@\[-`{-~‘’“”]+/g, ' ').trim();
  }
  function foldTitle(s) {
    s = String(s || '').split(' (')[0].split(' [')[0].split(' - ')[0];
    return fold(s);
  }
  function bestLrcredHit(hits, q) {
    var title = foldTitle(q.song), artist = fold(q.artist), best = null, bestScore = -1;
    (hits || []).forEach(function (h) {
      var ht = foldTitle(h.title), ha = fold(h.artist);
      var titleOk = title && (ht === title || ht.indexOf(title) >= 0 || title.indexOf(ht) >= 0);
      var artistOk = !artist || ha === artist || ha.indexOf(artist) >= 0 || artist.indexOf(ha) >= 0;
      if (!titleOk || !artistOk) return;
      var diff = q.duration && typeof h.duration === 'number' ? Math.abs(q.duration - h.duration) : 0;
      if (diff > 20) return;
      var score = (ht === title ? 100 : 60) + Math.trunc(20 - diff); // PC: `as i32`, so ties keep the first hit
      if (score > bestScore) { bestScore = score; best = h; }
    });
    return best;
  }

  /** "Song (Official Video) [Remastered]" → "Song", for providers that match on text. */
  function cleanTitle(t) {
    return String(t || '').replace(/\s*[([][^)\]]*(official|video|audio|lyric|visuali[sz]er|remaster|feat\.?|ft\.)[^)\]]*[)\]]/gi, '').trim() || t;
  }

  // ---- Providers -------------------------------------------------------------------------
  function qs(o) {
    return Object.keys(o).filter(function (k) { return o[k] !== undefined && o[k] !== null && o[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&');
  }
  function json(r) { try { return JSON.parse(r.text); } catch (e) { return null; } }
  function result(source, lines) {
    if (!lines || !lines.length) return null;
    var synced = lines[0].time >= 0;
    return { source: source, lines: lines, synced: synced, words: synced && lines.some(function (l) { return l.words.length > 0; }) };
  }

  var PROVIDERS = {
    unison: function (q) {
      return BC.net.get('https://unison.betterlyrics.org/lyrics?' + qs({ v: q.videoId, song: q.song, artist: q.artist, duration: q.duration || 0, album: q.album }), 'Unison').then(function (r) {
        var d = r.status === 200 && json(r);
        d = d && d.data;
        if (!d || !d.lyrics) return null;
        if (d.format === 'ttml') return result('Unison', parseTtml(d.lyrics));
        if (d.format === 'lrc') return result('Unison', parseLrc(d.lyrics));
        if (d.format === 'plain') return result('Unison', parsePlain(d.lyrics));
        return null;
      });
    },
    lrcred: function (q) {
      if (!q.song.trim()) return Promise.resolve(null);
      var query = q.artist ? q.song + ' ' + q.artist : q.song;
      return BC.net.get('https://lrc.red/search.json?' + qs({ q: query }), 'lrc.red').then(function (r) {
        var d = r.status === 200 && json(r);
        var hit = d && bestLrcredHit(d.hits, q);
        if (!hit || !/^[A-Za-z0-9]+$/.test(hit.isrc || '')) return null;
        return BC.net.get('https://lrc.red/s/' + hit.isrc + '.ttml', 'lrc.red').then(function (t) {
          return t.status === 200 ? result('lrc.red', parseTtml(t.text)) : null;
        });
      });
    },
    lrclib: function (q) {
      var title = cleanTitle(q.song);
      var pick = function (d) {
        if (!d) return null;
        if (d.syncedLyrics) return result('LRCLIB', parseLrc(d.syncedLyrics));
        if (d.plainLyrics) return result('LRCLIB', parsePlain(d.plainLyrics));
        return null;
      };
      return BC.net.get('https://lrclib.net/api/get?' + qs({ track_name: title, artist_name: q.artist, album_name: q.album, duration: q.duration ? Math.round(q.duration) : '' }), 'LRCLIB').then(function (r) {
        if (r.status === 200) { var got = pick(json(r)); if (got) return got; }
        if (r.status === 429) return null; // rate-limited by IP: back off rather than hammer it
        return BC.net.get('https://lrclib.net/api/search?' + qs({ track_name: title, artist_name: q.artist }), 'LRCLIB').then(function (s) {
          var hits = s.status === 200 && json(s);
          if (!Array.isArray(hits)) return null;
          var near = hits.filter(function (h) { return h.syncedLyrics && (!q.duration || Math.abs((h.duration || 0) - q.duration) <= 3); })[0];
          return pick(near || hits[0]);
        });
      });
    }
  };

  var cache = {};
  /** The first source, in the user's order, that has lyrics for the track. */
  function find(track) {
    if (cache[track.id]) return Promise.resolve(cache[track.id]);
    var q = {
      videoId: track.id, song: track.title || '',
      artist: track.artists && track.artists[0] ? track.artists[0].name : '',
      album: track.album ? track.album.name : '', duration: track.duration || 0
    };
    var order = (BC.settings ? BC.settings.get('lyricSources') : null) || ['unison', 'lrcred', 'lrclib'];
    var i = 0;
    function nextSource() {
      if (i >= order.length) return Promise.resolve(null);
      var p = PROVIDERS[order[i++]];
      if (!p) return nextSource();
      return p(q).then(function (r) { return r || nextSource(); }, nextSource);
    }
    return nextSource().then(function (r) {
      var keys = Object.keys(cache);
      if (keys.length > 30) delete cache[keys[0]]; // keep memory bounded
      cache[track.id] = r;
      return r;
    });
  }

  /** Index of the line being sung at `ms`, or -1 before the first (karaoke.rs line lead applied by caller). */
  function lineAt(lines, ms) {
    var lo = 0, hi = lines.length - 1, ans = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (lines[mid].time <= ms) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  BC.lyrics = { find: find, parseTtml: parseTtml, parseLrc: parseLrc, parsePlain: parsePlain, bestLrcredHit: bestLrcredHit, cleanTitle: cleanTitle, lineAt: lineAt, ttmlTime: ttmlTime };
})(typeof window !== 'undefined' ? window : global);
