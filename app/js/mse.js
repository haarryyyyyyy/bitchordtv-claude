/* Streams a YouTube DASH audio format through Media Source Extensions.
 *
 * Why: YouTube's adaptive formats are fragmented MP4/WebM (an index, then ~10 s
 * fragments). On a Tizen 6.5 TV a plain <audio src> plays only the first fragment and then
 * reports the song ended. MSE is how YouTube's own TV player plays these streams.
 *
 * How: fetch the init and index (sidx) ranges, parse the sidx into fragment byte ranges
 * and times, then fetch fragments with googlevideo's `&range=` parameter (a simple GET),
 * keeping about 60 s ahead of the play position and dropping what is 60 s behind. */
(function (root) {
  'use strict';
  var BC = root.BC;
  var AHEAD = 60, BEHIND = 60, RETRIES = 3;

  /** sidx box → [{start, end (bytes, inclusive), t0, t1 (seconds)}]. `boxStart`: the box's file offset. */
  function parseSidx(buf, boxStart) {
    var v = new DataView(buf);
    var p = 0;
    // Find the sidx box (the index range may start with other boxes).
    while (p + 8 <= v.byteLength) {
      var size = v.getUint32(p);
      var type = String.fromCharCode(v.getUint8(p + 4), v.getUint8(p + 5), v.getUint8(p + 6), v.getUint8(p + 7));
      if (type === 'sidx') break;
      if (size < 8) return null;
      p += size;
    }
    if (p + 8 > v.byteLength) return null;
    var boxSize = v.getUint32(p);
    var q = p + 8;
    var version = v.getUint8(q); q += 4;               // version + flags
    q += 4;                                            // reference_ID
    var timescale = v.getUint32(q); q += 4;
    var earliest, firstOffset;
    if (version === 0) { earliest = v.getUint32(q); firstOffset = v.getUint32(q + 4); q += 8; }
    else { earliest = v.getUint32(q) * 4294967296 + v.getUint32(q + 4); firstOffset = v.getUint32(q + 8) * 4294967296 + v.getUint32(q + 12); q += 16; }
    q += 2;                                            // reserved
    var count = v.getUint16(q); q += 2;
    var offset = boxStart + p + boxSize + firstOffset;
    var t = earliest / timescale;
    var segs = [];
    for (var i = 0; i < count; i++) {
      var ref = v.getUint32(q);
      var bytes = ref & 0x7fffffff;
      var dur = v.getUint32(q + 4) / timescale;
      q += 12;
      segs.push({ start: offset, end: offset + bytes - 1, t0: t, t1: t + dur });
      offset += bytes;
      t += dur;
    }
    return segs;
  }

  function fetchRange(url, start, end, xhrs) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('GET', url + (url.indexOf('?') >= 0 ? '&' : '?') + 'range=' + start + '-' + end, true);
      x.responseType = 'arraybuffer';
      x.timeout = 20000;
      x.onload = function () { xhrs.splice(xhrs.indexOf(x), 1); if (x.status >= 200 && x.status < 300 && x.response) resolve(x.response); else reject(new Error('HTTP ' + x.status)); };
      x.onerror = x.ontimeout = function () { xhrs.splice(xhrs.indexOf(x), 1); reject(new Error('network')); };
      x.onabort = function () { xhrs.splice(xhrs.indexOf(x), 1); reject(new Error('aborted')); };
      xhrs.push(x);
      x.send();
    });
  }

  function supported(s) {
    return !!(root.MediaSource && s && s.indexRange && s.initRange && MediaSource.isTypeSupported(s.mime));
  }

  /** Play stream `s` in `audio` from `at` seconds. onFatal(err) when the stream can't continue. */
  function attach(audio, s, at, onFatal) {
    var ms = new MediaSource();
    var sb = null, segs = null, appended = [], busy = false, dead = false, ended = false;
    var xhrs = [], gen = 0, failures = 0;
    var objectUrl = URL.createObjectURL(ms);

    function fail(e) { if (!dead) { destroy(); onFatal(e); } }

    function append(buf) {
      return new Promise(function (resolve, reject) {
        function done() { sb.removeEventListener('updateend', done); sb.removeEventListener('error', err); resolve(); }
        function err() { sb.removeEventListener('updateend', done); sb.removeEventListener('error', err); reject(new Error('append failed')); }
        sb.addEventListener('updateend', done);
        sb.addEventListener('error', err);
        try { sb.appendBuffer(buf); } catch (e) { sb.removeEventListener('updateend', done); sb.removeEventListener('error', err); reject(e); }
      });
    }
    function removeBefore(t) {
      return new Promise(function (resolve) {
        if (t <= 0 || sb.updating) return resolve();
        function done() { sb.removeEventListener('updateend', done); resolve(); }
        sb.addEventListener('updateend', done);
        try { sb.remove(0, t); } catch (e) { sb.removeEventListener('updateend', done); resolve(); }
        segs.forEach(function (sg, i) { if (sg.t1 <= t) appended[i] = false; });
      });
    }

    /** The next fragment to fetch: from the one holding the play position, the first not yet appended. */
    function nextIndex() {
      var ct = audio.currentTime;
      for (var i = 0; i < segs.length; i++) {
        if (segs[i].t1 <= ct) continue;
        if (segs[i].t0 > ct + AHEAD) return -1;
        if (!appended[i]) return i;
      }
      return -1;
    }

    function pump() {
      if (dead || busy || !segs || ended) return;
      var ct = audio.currentTime;
      var i = nextIndex();
      if (i < 0) {
        // Everything to the end is in: close the stream so `ended` fires.
        var allIn = segs.every(function (sg, k) { return sg.t1 <= ct || appended[k]; });
        if (allIn && ms.readyState === 'open' && !sb.updating) {
          ended = true;
          try { ms.endOfStream(); } catch (e) { /* already closed */ }
        }
        return;
      }
      busy = true;
      var my = gen;
      var p = ct - BEHIND > 0 && sb.buffered.length && sb.buffered.start(0) < ct - BEHIND ? removeBefore(ct - BEHIND / 2) : Promise.resolve();
      p.then(function () { return fetchRange(s.url, segs[i].start, segs[i].end, xhrs); })
        .then(function (buf) {
          if (dead || my !== gen) return;
          return append(buf).then(function () { appended[i] = true; failures = 0; }, function (e) {
            if (e && e.name === 'QuotaExceededError') return removeBefore(audio.currentTime - 10);
            throw e;
          });
        })
        .then(function () { busy = false; pump(); }, function (e) {
          busy = false;
          if (dead || my !== gen || (e && e.message === 'aborted')) { pump(); return; }
          if (++failures > RETRIES) fail(e); else setTimeout(pump, 500 * failures);
        });
    }

    function onSeeking() {
      if (!segs) return;
      // A seek past what is buffered: drop the fetch in flight and start at the new position.
      ended = false;
      gen++;
      xhrs.slice().forEach(function (x) { x.abort(); });
      busy = false;
      pump();
    }
    function onTime() { pump(); }

    ms.addEventListener('sourceopen', function () {
      if (dead) return;
      try { sb = ms.addSourceBuffer(s.mime); } catch (e) { fail(e); return; }
      if (s.durationMs) { try { ms.duration = s.durationMs / 1000; } catch (e) { /* ignore */ } }
      var initEnd = Number(s.initRange.end), idxStart = Number(s.indexRange.start), idxEnd = Number(s.indexRange.end);
      fetchRange(s.url, 0, Math.max(initEnd, idxEnd), xhrs).then(function (buf) {
        if (dead) return;
        segs = parseSidx(buf.slice(idxStart, idxEnd + 1), idxStart);
        if (!segs || !segs.length) throw new Error('no index');
        appended = segs.map(function () { return false; });
        return append(buf.slice(0, initEnd + 1));
      }).then(function () {
        if (dead) return;
        if (at) audio.currentTime = at;
        pump();
      }).catch(fail);
    });
    audio.addEventListener('seeking', onSeeking);
    audio.addEventListener('timeupdate', onTime);
    audio.src = objectUrl;

    function destroy() {
      if (dead) return;
      dead = true;
      xhrs.slice().forEach(function (x) { x.abort(); });
      audio.removeEventListener('seeking', onSeeking);
      audio.removeEventListener('timeupdate', onTime);
      try { URL.revokeObjectURL(objectUrl); } catch (e) { /* ignore */ }
    }
    return { destroy: destroy };
  }

  BC.mse = { supported: supported, attach: attach, parseSidx: parseSidx };
})(typeof window !== 'undefined' ? window : global);
