/* Now Playing: cover, transport, synced lyrics (karaoke.rs behaviour, Apple Music preset)
 * and Up next. Lyric lines move with transform only; blur is a static per-line class. */
(function (root) {
  'use strict';
  var BC = root.BC;
  var el = BC.el;
  // karaoke.rs: lines lead the audio slightly so they light up as they are sung.
  var BAR_W = 480; // .np-bar width in app.css
  var LINE_OFFSET = 115, WORD_OFFSET = 150, ANCHOR = 0.43, USER_SCROLL_RESUME = 25000, GAP_MS = 5000;

  var autoQueue = false; // Up next was opened because the song had no lyrics
  var np = null, parts = {}, lyr = null, panel = 'lyrics', userScrollAt = 0, raf = 0, open = false, layerBack = null;

  function build() {
    np = el('div', 'np');
    np.setAttribute('data-nav', 'h');
    np.setAttribute('data-key', 'np');
    np.setAttribute('role', 'dialog');
    np.setAttribute('aria-label', 'Now Playing');

    var left = el('div', 'np-left');
    left.setAttribute('data-nav', 'v');
    left.setAttribute('data-key', 'left');
    parts.cover = el('div', 'np-cover');
    parts.coverImg = el('img', 'np-cover-img');
    parts.coverImg.alt = '';
    parts.cover.appendChild(parts.coverImg);
    left.appendChild(parts.cover);
    parts.title = el('div', 'np-title');
    parts.artist = el('div', 'np-artist');
    parts.album = el('div', 'np-album');
    parts.quality = el('div', 'np-quality');
    left.appendChild(parts.title);
    left.appendChild(parts.artist);
    left.appendChild(parts.album);

    // Seek bar: a knob marks the position. Focused, it turns the accent colour and Left /
    // Right seek 10 s, with the hint shown in place of the quality label.
    var prog = el('div', 'np-progress fx');
    prog.setAttribute('role', 'slider');
    prog.setAttribute('aria-label', 'Position');
    prog.setAttribute('data-key', 'progress');
    var bar = el('div', 'np-bar');
    parts.fill = el('div', 'np-fill');
    parts.knob = el('div', 'np-knob');
    bar.appendChild(parts.fill);
    bar.appendChild(parts.knob);
    prog.appendChild(bar);
    var times = el('div', 'np-times');
    parts.at = el('span', 'np-at', '0:00');
    parts.left = el('span', 'np-left-time', '0:00');
    var mid = el('span', 'np-mid');
    mid.appendChild(parts.quality);
    mid.appendChild(el('span', 'np-seek-hint', 'Left and Right seek 10 s'));
    times.appendChild(parts.at);
    times.appendChild(mid);
    times.appendChild(parts.left);
    prog.appendChild(times);
    prog.onKey = function (k) {
      if (k === 'left' || k === 'right') { BC.player.seekBy(k === 'left' ? -10 : 10); paintTime(); return true; }
      return false;
    };
    prog.onActivate = function () { BC.player.toggle(); };
    left.appendChild(prog);

    var ui = BC.ui;
    // Row 1: playback. Play in the middle, the largest target.
    var row = el('div', 'np-transport');
    row.setAttribute('data-nav', 'h');
    row.setAttribute('data-key', 'transport');
    parts.shuffle = ui.iconButton('shuffle', 'Shuffle', function () { BC.player.setShuffle(!BC.player.shuffle()); }, 'shuffle');
    parts.prev = ui.iconButton('prev', 'Previous', BC.player.prev, 'prev');
    parts.play = ui.iconButton('play', 'Play', BC.player.toggle, 'play');
    parts.play.classList.add('np-play');
    parts.next = ui.iconButton('next', 'Next', BC.player.next, 'next');
    parts.repeat = ui.iconButton('repeat', 'Repeat', function () { BC.toast({ off: 'Repeat off', all: 'Repeat all', one: 'Repeat one' }[BC.player.cycleRepeat()]); }, 'repeat');
    [parts.shuffle, parts.prev, parts.play, parts.next, parts.repeat].forEach(function (b) { row.appendChild(b); });
    left.appendChild(row);

    // Row 2: what the right side shows, then the song's own actions.
    var row2 = el('div', 'np-actions');
    row2.setAttribute('data-nav', 'h');
    row2.setAttribute('data-key', 'actions');
    parts.lyricsBtn = ui.button('Lyrics', 'lyrics', function () { toggle('lyrics'); }, 'np-pill', 'tab-lyrics');
    parts.queueBtn = ui.button('Up next', 'list', function () { toggle('queue'); }, 'np-pill', 'tab-queue');
    parts.like = ui.iconButton('heart', 'Like', function () {
      var t = BC.player.current();
      if (t) BC.toast(BC.library.toggleLike(t) ? 'Added to liked songs' : 'Removed from liked songs');
      paintState();
    }, 'like');
    parts.sleep = ui.iconButton('moon', 'Sleep timer', sleepMenu, 'sleep');
    [parts.lyricsBtn, parts.queueBtn, parts.like, parts.sleep].forEach(function (b) { row2.appendChild(b); });
    left.appendChild(row2);

    var right = el('div', 'np-right');
    parts.right = right;
    parts.lyrics = el('div', 'lyrics');
    parts.lyricsTrack = el('div', 'lyrics-track');
    parts.lyricsTrack.setAttribute('data-nav', 'v');
    parts.lyricsTrack.setAttribute('data-key', 'lyrics');
    parts.lyrics.appendChild(parts.lyricsTrack);
    parts.lyricsSource = el('div', 'lyrics-source');
    parts.queue = el('div', 'np-queue');
    right.appendChild(parts.lyrics);
    right.appendChild(parts.lyricsSource);
    right.appendChild(parts.queue);
    np.appendChild(left);
    np.appendChild(right);
    document.getElementById('np-host').appendChild(np);
  }

  function sleepMenu() {
    var cur = BC.player.sleepState();
    var opts = [[15, '15 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], ['end', 'End of this song']];
    var items = opts.map(function (o) {
      return { label: o[1], on: cur === o[0], run: function () { BC.player.sleep(o[0]); BC.toast('Sleep timer: ' + o[1].toLowerCase()); paintState(); } };
    });
    if (cur) items.push({ label: 'Turn off sleep timer', run: function () { BC.player.sleep(0); BC.toast('Sleep timer off'); paintState(); } });
    BC.menu('Stop playing after', items);
  }

  /** Show a panel; `null` hides the right side and centres the cover. */
  function show(which) {
    panel = which;
    np.classList.toggle('panel-off', !which);
    np.classList.toggle('show-queue', which === 'queue');
    parts.lyricsBtn.classList.toggle('on', which === 'lyrics');
    parts.queueBtn.classList.toggle('on', which === 'queue');
    parts.lyricsBtn.setAttribute('aria-pressed', String(which === 'lyrics'));
    parts.queueBtn.setAttribute('aria-pressed', String(which === 'queue'));
    if (which === 'queue') renderQueue();
    if (which === 'lyrics') tick(true);
  }
  /** The pills are toggles: pressing the shown panel's pill hides it. */
  function toggle(which) { autoQueue = false; show(panel === which ? null : which); }

  // ---- Track and state ----------------------------------------------------------------------
  function paintTrack(t) {
    if (!np || !t) return;
    parts.title.textContent = t.title;
    parts.artist.textContent = BC.artistLine(t);
    parts.album.textContent = t.album && t.album.name ? t.album.name : '';
    var url = BC.sized(t.thumb, 840);
    if (parts.coverImg.getAttribute('src') !== url) {
      parts.coverImg.classList.remove('loaded');
      parts.coverImg.onload = function () { parts.coverImg.classList.add('loaded'); };
      parts.coverImg.src = url;
    }
    paintState();
    loadLyrics(t);
    if (panel === 'queue') renderQueue();
  }

  function paintState() {
    if (!np) return;
    var playing = BC.player.playing();
    parts.play.querySelector('.ic').textContent = BC.ICON[playing ? 'pause' : 'play'];
    parts.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    parts.play.setAttribute('data-label', playing ? 'Pause' : 'Play');
    np.classList.toggle('loading', BC.player.loading());
    parts.shuffle.classList.toggle('on', BC.player.shuffle());
    var rep = BC.player.repeat();
    parts.repeat.classList.toggle('on', rep !== 'off');
    parts.repeat.querySelector('.ic').textContent = BC.ICON[rep === 'one' ? 'repeat1' : 'repeat'];
    var t = BC.player.current();
    parts.like.classList.toggle('on', !!(t && BC.library.isLiked(t.id)));
    parts.sleep.classList.toggle('on', !!BC.player.sleepState());
  }

  function paintTime() {
    if (!open) return;
    var at = BC.player.time(), d = BC.player.duration();
    var f = d ? Math.min(1, at / d) : 0;
    parts.fill.style.transform = 'scaleX(' + f + ')';
    parts.knob.style.transform = 'translate3d(' + Math.round(f * BAR_W) + 'px,0,0)';
    parts.at.textContent = BC.fmtTime(at);
    parts.left.textContent = '−' + BC.fmtTime(Math.max(0, d - at));
  }

  // ---- Lyrics ---------------------------------------------------------------------------------
  function loadLyrics(t) {
    lyr = { id: t.id, lines: null, active: -2 };
    parts.lyricsTrack.innerHTML = '';
    parts.lyricsSource.textContent = '';
    parts.lyrics.className = 'lyrics loading';
    parts.lyricsTrack.style.fontSize = (56 * (BC.settings.get('lyricSize') || 1)) + 'px';
    BC.lyrics.find(t).then(function (res) {
      if (!lyr || lyr.id !== t.id) return;
      if (!res) {
        lyr.none = true;
        parts.lyrics.className = 'lyrics none';
        var msg = el('div', 'lyrics-none', 'No lyrics for this song');
        parts.lyricsTrack.appendChild(msg);
        if (panel === 'lyrics') { show('queue'); autoQueue = true; }
        return;
      }
      lyr.lines = res.lines;
      lyr.synced = res.synced;
      parts.lyrics.className = 'lyrics' + (res.synced ? ' synced' : ' unsynced');
      parts.lyricsSource.textContent = 'Lyrics from ' + res.source;
      res.lines.forEach(function (l, i) {
        // An instrumental stretch of more than 5 s gets the breathing dots (karaoke.rs gap).
        var prev = res.lines[i - 1];
        if (res.synced && prev && l.time - (prev.end || prev.time) > GAP_MS) {
          var gap = el('div', 'lyric-gap');
          gap.setAttribute('aria-hidden', 'true');
          gap.appendChild(el('i')); gap.appendChild(el('i')); gap.appendChild(el('i'));
          gap.__gapFor = i;
          parts.lyricsTrack.appendChild(gap);
        }
        var line = el('div', 'lyric fx' + (l.align === 'end' ? ' end' : ''));
        line.setAttribute('data-key', 'l' + i);
        if (l.words.length) {
          l.words.forEach(function (w, j) {
            if (j) line.appendChild(document.createTextNode(' '));
            var s = el('span', 'w', w.text);
            line.appendChild(s);
          });
        } else line.textContent = l.text;
        if (l.bg) line.appendChild(el('div', 'lyric-bg', l.bg.text));
        line.__i = i;
        line.onActivate = function () { if (res.synced) { BC.player.seek(l.time / 1000); userScrollAt = 0; } };
        line.onFocus = function () { userScrollAt = Date.now(); scrollLyricsTo(line, false); };
        parts.lyricsTrack.appendChild(line);
      });
      if (panel === 'queue' && autoQueue && open) show('lyrics'); // only undo our own switch
      tick(true);
    }, function () { parts.lyrics.className = 'lyrics none'; });
  }

  function scrollLyricsTo(line, smooth) {
    var view = parts.lyrics.clientHeight;
    var y = Math.max(0, line.offsetTop - view * ANCHOR);
    parts.lyricsTrack.style.transition = smooth === false || BC.reducedMotion() ? 'transform 200ms ease-out' : '';
    parts.lyricsTrack.style.transform = 'translate3d(0,' + (-y) + 'px,0)';
  }

  function tick(force) {
    if (!lyr || !lyr.lines || !lyr.synced) return;
    var ms = BC.player.time() * 1000;
    var idx = BC.lyrics.lineAt(lyr.lines, ms + LINE_OFFSET);
    var lines = parts.lyricsTrack.querySelectorAll('.lyric');
    if (idx !== lyr.active || force) {
      lyr.active = idx;
      for (var i = 0; i < lines.length; i++) {
        var d = i - idx;
        var c = lines[i].classList;
        c.toggle('past', d < 0);
        c.toggle('on', d === 0);
        // Upcoming lines: dimmer and blurrier with distance (blur_scope: upcoming), capped at 4.
        lines[i].setAttribute('data-d', d > 0 ? String(Math.min(d, 4)) : '0');
      }
      var target = lines[Math.max(0, idx)];
      if (target && Date.now() - userScrollAt > USER_SCROLL_RESUME) scrollLyricsTo(target, true);
    }
    var cur = lyr.lines[idx];
    if (cur && cur.words.length && lines[idx]) {
      var ws = lines[idx].querySelectorAll('.w');
      for (var j = 0; j < ws.length; j++) ws[j].classList.toggle('sung', cur.words[j].start <= ms + WORD_OFFSET);
    }
  }

  // ---- Up next --------------------------------------------------------------------------------
  function renderQueue() {
    var q = BC.player.upNext(), pos = BC.player.pos();
    parts.queue.innerHTML = '';
    var list = el('div', 'np-queue-list');
    list.setAttribute('data-nav', 'v');
    list.setAttribute('data-key', 'queue');
    var sc = BC.ui.scroller('y', list);
    sc.classList.add('np-queue-scroll');
    sc.setAttribute('data-pad', '24');
    var from = Math.max(0, pos), shown = q.slice(from, from + 60);
    if (shown.length <= 1) list.appendChild(el('div', 'side-empty', BC.settings.get('autoplay') ? 'Similar songs will play after this one.' : 'Nothing else is queued.'));
    shown.forEach(function (t, k) {
      var at = from + k;
      var r = BC.ui.trackRow(t, at, { onPlay: function () { BC.player.jump(at); } });
      if (at === pos) r.classList.add('playing');
      r.onMenu = function () {
        BC.ui.trackMenu(t, at === pos ? [] : [{ icon: 'x', label: 'Remove from queue', run: function () { BC.player.removeAt(at); renderQueue(); } }]);
      };
      list.appendChild(r);
    });
    parts.queue.appendChild(sc);
  }

  // ---- Frame loop: only while Now Playing is on screen ------------------------------------------
  function loop() {
    if (!open) return;
    raf = requestAnimationFrame(loop);
    tick(false);
  }

  /** The cover flies from the mini player into place (FLIP), then the rest fades in. */
  function flyFrom(srcRect) {
    if (!srcRect || BC.reducedMotion()) return;
    var dst = parts.cover.getBoundingClientRect();
    if (!dst.width) return;
    var sx = srcRect.width / dst.width, dx = srcRect.left - dst.left, dy = srcRect.top - dst.top;
    parts.cover.style.transition = 'none';
    parts.cover.style.transformOrigin = '0 0';
    parts.cover.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0) scale(' + sx + ')';
    void parts.cover.offsetWidth;
    parts.cover.style.transition = '';
    parts.cover.style.transform = '';
  }

  BC.nowPlaying = {
    init: function () {
      build();
      BC.on('track', paintTrack);
      BC.on('state', paintState);
      BC.on('queue', function () { if (open && panel === 'queue') renderQueue(); });
      BC.on('time', paintTime);
      BC.on('quality', function (s) {
        parts.quality.textContent = BC.settings.get('showQuality') && s ? (s.opus ? 'Opus ' : 'AAC ') + s.kbps + ' kbps' : '';
      });
      BC.on('library', paintState);
    },
    isOpen: function () { return open; },
    open: function (srcRect) {
      if (open || !BC.player.current()) return;
      open = true;
      paintTrack(BC.player.current());
      paintTime();
      document.body.classList.add('np-open');
      BC.backdrop.mode(true);
      flyFrom(srcRect);
      layerBack = BC.nav.focused();
      BC.nav.pushLayer(np);
      BC.nav.focus(parts.play, { instant: true });
      if (panel !== null) show(lyr && lyr.none ? 'queue' : 'lyrics'); // lyrics, unless known missing
      loop();
    },
    close: function () {
      if (!open) return;
      open = false;
      cancelAnimationFrame(raf);
      document.body.classList.remove('np-open');
      BC.backdrop.mode(false);
      BC.nav.popLayer(layerBack);
    },
    /** Back inside Now Playing: leave the lyrics or queue first, then close. */
    back: function () {
      var f = BC.nav.focused();
      if (f && parts.right.contains(f)) { BC.nav.focus(panel === 'queue' ? parts.queueBtn : parts.lyricsBtn); userScrollAt = 0; tick(true); return; }
      BC.nowPlaying.close();
    }
  };
})(typeof window !== 'undefined' ? window : global);
