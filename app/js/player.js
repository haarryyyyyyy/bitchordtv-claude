/* Playback: queue, shuffle, repeat, autoplay radio, prefetch, normalization, sleep timer.
 *
 * Measured on a Tizen 6.5 TV (probe): Opus 251 fails with MEDIA_ERR_DECODE although
 * canPlayType says "probably", AAC 140 plays, and the element reports a 10 s duration
 * for a 5 min stream. So: AAC 140, then 139, Opus last; the length shown comes from
 * YouTube's metadata; a stream that ends early is reopened where it stopped. */
(function (root) {
  'use strict';
  var BC = root.BC;
  var ITAGS = [140, 139, 251];
  var PREFETCH_SECS = 20, PREFETCH_TTL = 3 * 3600 * 1000;

  var audio = new Audio();
  audio.preload = 'auto';
  var state = {
    queue: [], order: [], pos: -1,     // order: indexes into queue (shuffle permutes it)
    shuffle: false, repeat: 'off',      // 'off' | 'all' | 'one'
    stream: null, streams: [], streamIndex: 0, loading: false, reopens: 0, reopenAt: -1,
    duration: 0, sleepAt: 0, sleepEnd: false, radioFor: null
  };
  var prefetched = {};   // videoId -> { at, info }
  var loadSeq = 0;

  function current() { return state.pos >= 0 ? state.queue[state.order[state.pos]] : null; }
  function emitQueue() { BC.emit('queue', { queue: state.queue, order: state.order, pos: state.pos }); }
  function setLoading(v) { state.loading = v; BC.emit('state'); }

  function streamInfo(id) {
    var p = prefetched[id];
    if (p && Date.now() - p.at < PREFETCH_TTL) return Promise.resolve(p.info);
    return BC.yt.player(id, ITAGS).then(function (info) { prefetched[id] = { at: Date.now(), info: info }; return info; });
  }

  function applyVolume() {
    var db = state.stream && state.stream.loudnessDb;
    // Only turn loud tracks down (positive dB above the −14 LUFS target), never above 1.0.
    audio.volume = BC.settings.get('normalize') && typeof db === 'number' && db > 0 ? Math.pow(10, -db / 20) : 1;
  }

  function openStream(at) {
    var s = state.streams[state.streamIndex];
    if (!s) return false;
    state.stream = s;
    audio.src = s.url;
    if (at) audio.currentTime = at;
    applyVolume();
    var p = audio.play();
    if (p && p.catch) p.catch(function () { /* autoplay refusal: the user presses Play */ });
    BC.emit('quality', s);
    return true;
  }

  function load(resumeAt) {
    var t = current();
    if (!t) return;
    var seq = ++loadSeq;
    audio.pause();
    setLoading(true);
    BC.emit('track', t);
    streamInfo(t.id).then(function (info) {
      if (seq !== loadSeq) return;
      state.streams = info.streams;
      state.streamIndex = 0;
      state.reopens = 0; state.reopenAt = -1;
      state.duration = info.lengthSec || (t.duration || 0);
      if (!t.duration && info.lengthSec) t.duration = info.lengthSec;
      if (!t.thumb && info.thumb) { t.thumb = info.thumb; BC.emit('track', t); }
      openStream(resumeAt || 0);
      BC.library.addHistory(t);
    }, function (e) {
      if (seq !== loadSeq) return;
      setLoading(false);
      BC.emit('toast', (e.unplayable ? 'Unable to play “' + t.title + '”: ' : '') + e.message);
      // A song YouTube won't play is skipped, after a moment to read why.
      setTimeout(function () { if (seq === loadSeq && hasNext()) next(); }, 2500);
    });
  }

  audio.addEventListener('playing', function () { setLoading(false); });
  audio.addEventListener('waiting', function () { setLoading(true); });
  audio.addEventListener('play', function () { BC.emit('state'); });
  audio.addEventListener('pause', function () { BC.emit('state'); });
  audio.addEventListener('error', function () {
    // A decode error moves to the next format; the TV's own canPlayType is not reliable.
    var at = audio.currentTime || 0;
    state.streamIndex++;
    if (!openStream(at)) {
      setLoading(false);
      BC.emit('toast', 'Unable to play this song on this TV');
      if (hasNext()) setTimeout(next, 1500);
    }
  });
  audio.addEventListener('timeupdate', function () {
    var t = audio.currentTime;
    BC.emit('time', t);
    var left = state.duration - t;
    if (left < PREFETCH_SECS) prefetchNext();
    if (state.sleepAt && Date.now() >= state.sleepAt) { state.sleepAt = 0; pause(); BC.emit('sleep', null); }
  });
  audio.addEventListener('ended', function () {
    var t = audio.currentTime;
    // The TV's player can stop at a segment boundary: reopen at the same point if the song has more.
    if (state.duration && t < state.duration - 5) {
      // Reopen where it stopped, but never loop: give up if a reopen made no progress.
      if (state.reopens < 3 && t > state.reopenAt + 1) { state.reopens++; state.reopenAt = t; openStream(t); return; }
      BC.emit('toast', 'This song stopped early on this TV; playing the next one');
      if (hasNext()) next();
      return;
    }
    if (state.sleepEnd) { state.sleepEnd = false; BC.emit('sleep', null); return; }
    if (state.repeat === 'one') { audio.currentTime = 0; audio.play(); return; }
    if (hasNext()) next();
    else if (state.repeat === 'all' && state.order.length) { state.pos = 0; emitQueue(); load(); }
    else if (BC.settings.get('autoplay')) extendWithRadio(true);
    else BC.emit('state');
  });

  function hasNext() { return state.pos + 1 < state.order.length; }

  function prefetchNext() {
    var n = hasNext() ? state.queue[state.order[state.pos + 1]] : null;
    if (n && !prefetched[n.id]) streamInfo(n.id).catch(function () {});
    if (!hasNext() && BC.settings.get('autoplay')) extendWithRadio(false);
  }

  /** Append the current song's radio (autoplay), then optionally play on. */
  function extendWithRadio(playOn) {
    var t = current();
    if (!t || state.radioFor === t.id) { if (playOn && hasNext()) next(); return; }
    state.radioFor = t.id;
    BC.yt.radio(t.id, 25).then(function (tracks) {
      var have = {};
      state.queue.forEach(function (q) { have[q.id] = true; });
      var add = tracks.filter(function (x) { return !have[x.id]; });
      add.forEach(function (x) { state.queue.push(x); state.order.push(state.queue.length - 1); });
      emitQueue();
      if (playOn && hasNext()) next();
    }, function () { state.radioFor = null; });
  }

  function shuffled(n, first) {
    var a = [];
    for (var i = 0; i < n; i++) if (i !== first) a.push(i);
    for (var j = a.length - 1; j > 0; j--) { var k = Math.floor(Math.random() * (j + 1)); var tmp = a[j]; a[j] = a[k]; a[k] = tmp; }
    return first >= 0 ? [first].concat(a) : a;
  }

  /** Play `tracks` starting at `start`. opts.shuffle shuffles; opts.radio appends a radio after. */
  function playList(tracks, start, opts) {
    opts = opts || {};
    state.queue = tracks.slice();
    state.radioFor = null;
    if (opts.shuffle) state.shuffle = true;
    state.order = state.shuffle ? shuffled(tracks.length, opts.shuffle ? -1 : (start || 0)) : tracks.map(function (_, i) { return i; });
    state.pos = state.shuffle ? 0 : (start || 0);
    emitQueue();
    load();
    if (opts.radio) extendWithRadio(false);
    BC.emit('user-play');
  }

  function next() {
    if (!hasNext()) { if (BC.settings.get('autoplay')) extendWithRadio(true); return; }
    state.pos++;
    emitQueue();
    load();
  }
  function prev() {
    if (audio.currentTime > 3 || state.pos <= 0) { audio.currentTime = 0; return; }
    state.pos--;
    emitQueue();
    load();
  }
  function play() { if (current()) { var p = audio.play(); if (p && p.catch) p.catch(function () {}); } }
  function pause() { audio.pause(); }
  function toggle() { if (audio.paused) play(); else pause(); }

  BC.player = {
    audio: audio,
    playList: playList,
    /** One song and its radio after it. */
    playRadio: function (t) { playList([t], 0, { radio: true }); },
    playNext: function (t) {
      if (!current()) return playList([t], 0);
      state.queue.push(t);
      state.order.splice(state.pos + 1, 0, state.queue.length - 1);
      emitQueue();
    },
    addToQueue: function (t) {
      if (!current()) return playList([t], 0);
      state.queue.push(t);
      state.order.push(state.queue.length - 1);
      emitQueue();
    },
    removeAt: function (pos) {
      if (pos === state.pos || pos < 0 || pos >= state.order.length) return;
      state.order.splice(pos, 1);
      if (pos < state.pos) state.pos--;
      emitQueue();
    },
    jump: function (pos) { if (pos >= 0 && pos < state.order.length) { state.pos = pos; emitQueue(); load(); } },
    next: next, prev: prev, play: play, pause: pause, toggle: toggle,
    stop: function () { audio.pause(); if (current()) audio.currentTime = 0; },
    seek: function (sec) { if (current()) audio.currentTime = Math.max(0, Math.min(sec, (state.duration || audio.duration || 0) - 1)); },
    seekBy: function (d) { BC.player.seek(audio.currentTime + d); },
    setShuffle: function (on) {
      var cur = state.order[state.pos];
      state.shuffle = on;
      state.order = on ? shuffled(state.queue.length, cur) : state.queue.map(function (_, i) { return i; });
      state.pos = on ? 0 : cur;
      emitQueue(); BC.emit('state');
    },
    cycleRepeat: function () {
      state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
      BC.emit('state');
      return state.repeat;
    },
    /** Sleep timer: minutes, 'end' (end of this song) or 0 to cancel. */
    sleep: function (v) {
      state.sleepAt = typeof v === 'number' && v > 0 ? Date.now() + v * 60000 : 0;
      state.sleepEnd = v === 'end';
      BC.emit('sleep', v || null);
    },
    sleepState: function () { return state.sleepEnd ? 'end' : state.sleepAt ? Math.max(1, Math.round((state.sleepAt - Date.now()) / 60000)) : 0; },
    current: current,
    upNext: function () { return state.order.map(function (i) { return state.queue[i]; }); },
    pos: function () { return state.pos; },
    time: function () { return audio.currentTime || 0; },
    duration: function () { return state.duration || (current() && current().duration) || 0; },
    playing: function () { return !audio.paused; },
    loading: function () { return state.loading; },
    shuffle: function () { return state.shuffle; },
    repeat: function () { return state.repeat; },
    stream: function () { return state.stream; },
    applyVolume: applyVolume
  };
  BC.on('settings', function (k) { if (k === 'normalize') applyVolume(); });
})(typeof window !== 'undefined' ? window : global);
