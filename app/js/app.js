/* App shell: sidebar, router with history, mini player and remote keys. */
(function (root) {
  'use strict';
  var BC = root.BC;
  var el = BC.el;
  BC.VERSION = '0.4.0';

  // Remote keys (Samsung TV key codes; arrows, Enter and Escape also work on a PC keyboard).
  var KEYS = {
    37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'ok',
    10009: 'back', 27: 'back', 8: 'back',
    10252: 'playpause', 415: 'play', 19: 'pause', 413: 'stop', 417: 'ff', 412: 'rewind',
    10233: 'next', 10232: 'prev'
  };
  for (var d = 0; d <= 9; d++) KEYS[48 + d] = 'digit' + d;
  var TIZEN_KEYS = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
    'MediaTrackNext', 'MediaTrackPrevious',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  var NAV = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'new', label: 'New', icon: 'compass' },
    { id: 'search', label: 'Search', icon: 'search' },
    { id: 'library', label: 'Library', icon: 'library' },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ];

  var stack = [];        // history entries: { view, params, key, data }
  var current = null;    // { entry, root, alive, onFocus, keyHandler, onLeave }
  var seq = 0;
  var shell = {};
  var sideChosen = false;

  // ---- Shell ------------------------------------------------------------------------------
  function logoSvg(cls) {
    // Brand mark: squircle with BitChord's pink gradient and the three arcs from logo-mark.svg.
    return '<svg class="' + cls + '" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="bcg' + cls + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF6479"/><stop offset="1" stop-color="#FA2A40"/></linearGradient></defs>' +
      '<path fill="url(#bcg' + cls + ')" d="' + BC.SQUIRCLE + '"/>' +
      '<g transform="translate(108 158) scale(0.405)" fill="#fff"><path d="' + BC.ARCS.join('') + '"/></g></svg>';
  }

  function buildShell() {
    var app = document.getElementById('app');
    var nav = el('nav', 'sidebar');
    nav.setAttribute('data-nav', 'v');
    nav.setAttribute('data-key', 'sidebar');
    nav.setAttribute('aria-label', 'Main');
    nav.setAttribute('data-prefer', '.current');
    var brand = el('div', 'brand');
    brand.innerHTML = logoSvg('brand-mark');
    brand.appendChild(el('span', 'brand-word', 'BitChord'));
    nav.appendChild(brand);
    // Now Playing, reachable from every page with Left: shown once something plays.
    var npItem = el('div', 'nav-item nav-np fx');
    npItem.setAttribute('role', 'button');
    npItem.setAttribute('data-key', 'nowplaying');
    npItem.setAttribute('aria-label', 'Now Playing');
    npItem.setAttribute('data-skip', '');
    var npArt = el('img', 'nav-np-art');
    npArt.alt = '';
    npItem.appendChild(npArt);
    npItem.appendChild(el('span', 'nav-label', 'Now Playing'));
    npItem.onActivate = function () { BC.nowPlaying.open(npArt.getBoundingClientRect()); };
    nav.appendChild(npItem);
    BC.on('track', function (t) {
      npItem.removeAttribute('data-skip');
      npArt.src = BC.sized(t.thumb, 96);
    });
    shell.navItems = {};
    NAV.forEach(function (n) {
      var b = el('div', 'nav-item fx');
      b.setAttribute('role', 'link');
      b.setAttribute('data-key', n.id);
      b.setAttribute('aria-label', n.label);
      b.appendChild(BC.icon(n.icon));
      b.appendChild(el('span', 'nav-label', n.label));
      b.onActivate = function () { go(n.id); };
      nav.appendChild(b);
      shell.navItems[n.id] = b;
    });
    var main = el('main', 'main');
    main.setAttribute('data-nav', 'v');
    main.setAttribute('data-key', 'main');
    shell.pageHost = el('div', 'page-host');
    main.appendChild(shell.pageHost);
    main.appendChild(buildMini());
    var body = el('div', 'shell');
    body.setAttribute('data-nav', 'h');
    body.setAttribute('data-key', 'shell');
    body.appendChild(nav);
    body.appendChild(main);
    app.appendChild(body);
    shell.sidebar = nav;
    BC.nav.onFocus(function (f) {
      var inSide = nav.contains(f);
      document.body.classList.toggle('side-open', inSide);
      if (current && current.onFocus && !inSide) current.onFocus(f);
    });
  }

  // ---- Mini player ------------------------------------------------------------------------
  function buildMini() {
    var m = el('div', 'mini');
    m.setAttribute('data-nav', 'h');
    m.setAttribute('data-key', 'mini');
    m.setAttribute('data-skip', ''); // invisible until something plays: never focusable
    var open = el('div', 'mini-open fx');
    open.setAttribute('role', 'button');
    open.setAttribute('data-key', 'open');
    var art = el('div', 'mini-art');
    var img = el('img');
    img.alt = '';
    art.appendChild(img);
    var text = el('div', 'mini-text');
    var title = el('div', 'mini-title'), sub = el('div', 'mini-sub');
    text.appendChild(title); text.appendChild(sub);
    open.appendChild(art); open.appendChild(text);
    open.onActivate = function () { BC.nowPlaying.open(art.getBoundingClientRect()); };
    m.appendChild(open);
    var play = BC.ui.iconButton('play', 'Play', BC.player.toggle, 'play');
    m.appendChild(play);
    var bar = el('div', 'mini-bar'), fill = el('div', 'mini-fill');
    bar.appendChild(fill);
    m.appendChild(bar);
    BC.on('track', function (t) {
      document.body.classList.add('has-mini');
      m.removeAttribute('data-skip');
      title.textContent = t.title;
      sub.textContent = BC.artistLine(t);
      open.setAttribute('aria-label', 'Now Playing: ' + t.title + ', ' + BC.artistLine(t));
      img.src = BC.sized(t.thumb, 120);
      BC.backdrop.setCover(t.thumb);
      markPlaying(t.id);
    });
    BC.on('state', function () {
      var p = BC.player.playing();
      play.querySelector('.ic').textContent = BC.ICON[p ? 'pause' : 'play'];
      play.setAttribute('aria-label', p ? 'Pause' : 'Play');
      play.setAttribute('data-label', p ? 'Pause' : 'Play');
      m.classList.toggle('loading', BC.player.loading());
    });
    BC.on('time', function (t) {
      var d = BC.player.duration();
      fill.style.transform = 'scaleX(' + (d ? Math.min(1, t / d) : 0) + ')';
    });
    return m;
  }

  function markPlaying(id) {
    var rows = document.querySelectorAll('.page .row');
    for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('playing', !!(rows[i].__track && rows[i].__track.id === id));
  }

  // ---- Router -----------------------------------------------------------------------------
  function render(entry, direction) {
    var old = current;
    if (old && old.onLeave) old.onLeave();
    var title = entry.params.title || BC.viewTitles[entry.view] || '';
    var pg = BC.ui.page(entry.key, entry.view === 'search' ? '' : title);
    var ctx = { entry: entry, root: pg.root, track: pg.track, alive: function () { return ctx === current; } };
    current = ctx;
    document.title = (title ? title + ' · ' : '') + 'BitChord';
    pg.root.classList.add('enter', direction === 'back' ? 'from-back' : 'from-fwd');
    shell.pageHost.appendChild(pg.root);
    if (old) {
      var gone = old.root;
      gone.classList.add('leave', direction === 'back' ? 'to-back' : 'to-fwd');
      setTimeout(function () { gone.remove(); }, BC.reducedMotion() ? 0 : 220);
    }
    BC.later(function () { pg.root.classList.remove('enter'); });
    Object.keys(shell.navItems).forEach(function (k) { shell.navItems[k].classList.toggle('current', k === rootViewOf(entry)); });
    BC.views[entry.view](entry.params, ctx);
    var cur = BC.player.current();
    if (cur) markPlaying(cur.id);
  }
  function rootViewOf(entry) {
    for (var i = stack.indexOf(entry); i >= 0; i--) if (shell.navItems[stack[i].view]) return stack[i].view;
    return 'home';
  }
  function open(view, params) {
    var entry = { view: view, params: params || {}, key: 'p' + (++seq) };
    stack.push(entry);
    if (stack.length > 30) stack.splice(1, 1);
    render(entry, 'fwd');
    afterRender(entry);
  }
  /** Replace the current page (Home chips). */
  function replace(view, params) {
    var entry = { view: view, params: params || {}, key: current ? current.entry.key : 'p' + (++seq) };
    stack[stack.length - 1] = entry;
    render(entry, 'fwd');
    afterRender(entry);
  }
  /** Go to a top-level section: the stack starts over from it. */
  function go(view) {
    sideChosen = false;
    if (current && current.entry.view === view && stack.length === 1) { settle(); return; }
    stack = [];
    open(view, {});
  }
  function afterRender(entry) {
    BC.later(function () { if (current.entry === entry) settle(); });
  }
  /** Focus the page (through its focus memory) unless the user is choosing in the sidebar. */
  function settle() {
    if (sideChosen || BC.nav.hasLayer() || BC.nowPlaying.isOpen()) return;
    var g = current.track;
    // A page still loading has nothing to focus yet; its data arriving calls settle again.
    if (g.querySelector('.fx')) BC.nav.focusKey(g.parentElement, g.getAttribute('data-key'));
  }
  function back() {
    if (stack.length <= 1) return false;
    stack.pop();
    var entry = stack[stack.length - 1];
    render(entry, 'back');
    sideChosen = false;
    afterRender(entry);
    return true;
  }
  function reload() {
    var entry = stack[stack.length - 1];
    entry.data = null;
    render(entry, 'fwd');
    afterRender(entry);
  }

  // ---- Back: close overlay > leave Now Playing > go up > sidebar > confirm exit ----------------------
  function handleBack() {
    var top = BC.nav.topLayer();
    if (top && top.close) { top.close(); return; }
    if (BC.nowPlaying.isOpen()) { BC.nowPlaying.back(); return; }
    var f = BC.nav.focused();
    if (back()) return;
    if (f && !shell.sidebar.contains(f)) { BC.nav.focus(shell.navItems[rootViewOf(current.entry)]); return; }
    if (current.entry.view !== 'home') { go('home'); return; }
    BC.confirm({ title: 'Exit BitChord?', body: BC.player.playing() ? 'Playback stops when you exit.' : '', confirm: 'Exit', onConfirm: exit });
  }
  function exit() {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) { BC.toast('Exit is only available on the TV'); }
  }

  // ---- Keys -------------------------------------------------------------------------------
  var held = { key: null, since: 0, last: 0 };
  var okTimer = null, okRepeat = null, okConsumed = false, okDown = false;

  function moveInterval(heldMs) { return heldMs > 1000 ? 75 : 150; }

  function onKeyDown(e) {
    var name = KEYS[e.keyCode];
    if (!name) return;
    e.preventDefault();
    var f = BC.nav.focused();

    if (name === 'ok') {
      if (e.repeat) return;          // auto-repeat: the timers decide
      clearTimeout(okTimer); clearInterval(okRepeat); // a lost keyup must not lock OK
      okDown = true;
      okConsumed = false;
      if (f && f.repeat) {
        // Keyboard keys: type once now, then repeat while held.
        if (f.onActivate) f.onActivate();
        okConsumed = true;
        okTimer = setTimeout(function () { okRepeat = setInterval(function () { var g = BC.nav.focused(); if (g && g.repeat && g.onActivate) g.onActivate(); }, 90); }, 450);
        return;
      }
      okTimer = setTimeout(function () {
        okConsumed = true;
        var g = BC.nav.focused();
        if (g && g.onMenu) g.onMenu();
      }, 500);
      return;
    }
    if (name === 'back') { handleBack(); return; }

    // Media keys work everywhere.
    switch (name) {
      case 'playpause': BC.player.toggle(); return;
      case 'play': BC.player.play(); return;
      case 'pause': BC.player.pause(); return;
      case 'stop': BC.player.stop(); return;
      case 'next': BC.player.next(); return;
      case 'prev': BC.player.prev(); return;
    }
    if (current && current.keyHandler && !BC.nav.hasLayer() && current.keyHandler(name)) return;
    if (name === 'ff' || name === 'rewind') { BC.player.seekBy(name === 'ff' ? 10 : -10); return; }

    if (name === 'left' || name === 'right' || name === 'up' || name === 'down') {
      var now = Date.now();
      if (e.repeat || held.key === name) {
        if (held.key !== name) { held.key = name; held.since = now; }
        if (now - held.last < moveInterval(now - held.since)) return; // accelerate, never flood
      } else { held.key = name; held.since = now; }
      held.last = now;
      if (f && f.onKey && f.onKey(name)) return;
      BC.nav.move(name);
      // The sidebar keeps focus only when an arrow press took the user there.
      var g = BC.nav.focused();
      sideChosen = !!(g && shell.sidebar.contains(g));
    }
  }
  function onKeyUp(e) {
    var name = KEYS[e.keyCode];
    if (name === 'ok') {
      okDown = false;
      clearTimeout(okTimer); clearInterval(okRepeat);
      if (!okConsumed) { var f = BC.nav.focused(); if (f && f.onActivate) { f.classList.add('pressed'); setTimeout(function () { f.classList.remove('pressed'); }, 120); f.onActivate(); } }
    }
    if (name === held.key) held.key = null;
  }

  // ---- Boot -------------------------------------------------------------------------------
  /** Scale the 1920×1080 stage to the viewport the TV reports, centred. */
  function fit() {
    var w = root.innerWidth || 1920, h = root.innerHeight || 1080;
    var s = Math.min(w / 1920, h / 1080);
    var stage = document.getElementById('stage');
    stage.style.transform = 'translate(' + Math.round((w - 1920 * s) / 2) + 'px,' + Math.round((h - 1080 * s) / 2) + 'px) scale(' + s + ')';
  }

  function boot() {
    fit();
    root.addEventListener('resize', fit);
    // One by one: a batch with a single key the model lacks can fail as a whole.
    try {
      var supported = tizen.tvinputdevice.getSupportedKeys().map(function (k) { return k.name; });
      TIZEN_KEYS.forEach(function (k) { if (supported.indexOf(k) >= 0) { try { tizen.tvinputdevice.registerKey(k); } catch (e) { /* skip */ } } });
    } catch (e) { /* not a TV */ }
    if (BC.reducedMotion()) document.body.classList.add('reduce-motion');
    BC.on('settings', function (k) { if (k === 'reduceMotion') document.body.classList.toggle('reduce-motion', BC.reducedMotion()); });
    BC.backdrop.init(document.getElementById('bg'));
    buildShell();
    BC.nowPlaying.init();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    // Starting playback opens Now Playing; the cover flies from the card or row that was pressed.
    BC.on('user-play', function () {
      var f = BC.nav.focused();
      var art = f && f.querySelector && f.querySelector('.card-art, .row-thumb, .detail-art');
      if (!art && f && f.closest && f.closest('.detail-head')) art = f.closest('.detail-head').querySelector('.detail-art');
      BC.nowPlaying.open(art ? art.getBoundingClientRect() : null);
    });
    BC.on('accent', function (c) { document.documentElement.style.setProperty('--accent-np', c || ''); document.body.classList.toggle('has-accent', !!c); });
    // Home opens at once with its skeleton; ?view=<name> opens another page (tests).
    var url = root.location ? root.location.search : '';
    var startView = (/[?&]view=(\w+)/.exec(url) || [])[1] || 'home';
    open(startView, {});
    stack = [stack[stack.length - 1]];
  }

  BC.app = { open: open, replace: replace, go: go, back: back, reload: reload, boot: boot, settle: settle };
  if (root.document) document.addEventListener('DOMContentLoaded', boot);
})(typeof window !== 'undefined' ? window : global);
