/* Shared components: cards, track rows, shelves, buttons, states, menus, dialogs, toasts. */
(function (root) {
  'use strict';
  var BC = root.BC;
  var el = BC.el;

  // ---- Images: loaded when near the screen, at the size drawn (×1.5 for 4K panels) ------------
  var io = root.IntersectionObserver ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var img = e.target;
      io.unobserve(img);
      img.src = img.getAttribute('data-src');
    });
  }, { rootMargin: '600px 900px' }) : null;

  BC.img = function (url, px, cls, wide) {
    var img = el('img', 'art' + (cls ? ' ' + cls : ''));
    img.alt = '';
    img.decoding = 'async';
    img.onload = function () { img.classList.add('loaded'); };
    img.onerror = function () { img.classList.add('missing'); };
    if (!url) { img.classList.add('missing'); return img; }
    var src = wide ? BC.sizedWide(url, wide[0], wide[1]) : BC.sized(url, Math.round(px * 1.5));
    if (io) { img.setAttribute('data-src', src); io.observe(img); } else img.src = src;
    return img;
  };

  function label(node, text) { node.setAttribute('aria-label', text); return node; }

  // ---- Buttons ------------------------------------------------------------------------------
  function button(text, icon, action, cls, key) {
    var b = el('div', 'btn fx' + (cls ? ' ' + cls : ''));
    b.setAttribute('role', 'button');
    b.setAttribute('data-key', key || text);
    if (icon) b.appendChild(BC.icon(icon));
    if (text) b.appendChild(el('span', 'btn-label', text));
    b.onActivate = action;
    return b;
  }
  function iconButton(icon, name, action, key) {
    var b = el('div', 'btn btn-icon fx');
    b.setAttribute('role', 'button');
    b.setAttribute('data-key', key || name);
    label(b, name);
    b.appendChild(BC.icon(icon));
    b.onActivate = action;
    return b;
  }

  // ---- Opening and playing things -----------------------------------------------------------
  function openTarget(c) {
    var t = c.target;
    if (t.kind === 'song') return BC.player.playRadio(t.track || { id: t.id, title: c.title, artists: [], thumb: c.thumb });
    BC.app.open(t.kind, { id: t.id, title: c.title });
  }

  function loadCollection(t) {
    return t.kind === 'album' ? BC.yt.album(t.id) : BC.yt.playlist(t.id);
  }
  function playCard(c, shuffle) {
    if (c.target.kind === 'song') return openTarget(c);
    BC.toast('Loading “' + c.title + '”…');
    loadCollection(c.target).then(function (col) {
      if (col.tracks.length) BC.player.playList(col.tracks, 0, { shuffle: !!shuffle });
    }, function (e) { BC.toast(e.message); });
  }

  function cardMenu(c) {
    var items = [];
    if (c.target.kind === 'album' || c.target.kind === 'playlist') {
      items.push({ icon: 'play', label: 'Play', run: function () { playCard(c, false); } });
      items.push({ icon: 'shuffle', label: 'Shuffle', run: function () { playCard(c, true); } });
      var saved = BC.library.isSaved(c.target.id);
      items.push({ icon: saved ? 'check' : 'plus', label: saved ? 'Remove from library on this TV' : 'Save to library on this TV', run: function () {
        BC.toast(BC.library.toggleSaved(c) ? 'Saved to library on this TV' : 'Removed from library');
      } });
    }
    if (c.target.kind === 'song') return trackMenu(c.target.track || { id: c.target.id, title: c.title, artists: [], thumb: c.thumb });
    items.push({ icon: 'right', label: 'Open', run: function () { openTarget(c); } });
    BC.menu(c.title, items);
  }

  function trackMenu(t, extra) {
    var liked = BC.library.isLiked(t.id);
    var items = (extra || []).concat([
      { icon: 'play', label: 'Play next', run: function () { BC.player.playNext(t); BC.toast('Plays next: ' + t.title); } },
      { icon: 'listPlus', label: 'Add to queue', run: function () { BC.player.addToQueue(t); BC.toast('Added to queue'); } },
      { icon: 'radio', label: 'Start radio', run: function () { BC.player.playRadio(t); } },
      { icon: 'heart', label: liked ? 'Remove from liked songs' : 'Like', run: function () { BC.toast(BC.library.toggleLike(t) ? 'Added to liked songs' : 'Removed from liked songs'); } }
    ]);
    var artist = (t.artists || []).filter(function (a) { return a.id; })[0];
    if (artist) items.push({ icon: 'user', label: 'Go to ' + artist.name, run: function () { BC.app.open('artist', { id: artist.id, title: artist.name }); } });
    if (t.album && t.album.id) items.push({ icon: 'disc', label: 'Go to album', run: function () { BC.app.open('album', { id: t.album.id, title: t.album.name }); } });
    BC.menu(t.title, items);
  }

  // ---- Cards --------------------------------------------------------------------------------
  /** A square (or round, for artists) card. size: art px. */
  function card(c, size, cls) {
    var k = el('div', 'card fx' + (c.round ? ' round' : '') + (cls ? ' ' + cls : ''));
    k.setAttribute('data-key', c.target.kind + ':' + c.target.id);
    k.setAttribute('role', 'button');
    label(k, c.title + (c.subtitle ? ', ' + c.subtitle : ''));
    k.style.width = size + 'px';
    var frame = el('div', 'card-art');
    frame.style.width = frame.style.height = size + 'px';
    frame.appendChild(BC.img(c.thumb, size));
    k.appendChild(frame);
    k.appendChild(el('div', 'card-title', c.title));
    if (c.subtitle) k.appendChild(el('div', 'card-sub', c.subtitle));
    k.onActivate = function () { openTarget(c); };
    k.onMenu = function () { cardMenu(c); };
    return k;
  }

  // ---- Track rows ---------------------------------------------------------------------------
  /** opts: { number: show track numbers, onPlay(index), compact } */
  function trackRow(t, i, opts) {
    opts = opts || {};
    var r = el('div', 'row fx');
    r.setAttribute('data-key', 't' + i + ':' + t.id);
    r.setAttribute('role', 'button');
    label(r, t.title + ', ' + BC.artistLine(t) + (t.duration ? ', ' + BC.fmtTime(t.duration) : ''));
    if (opts.number) r.appendChild(el('div', 'row-num', String(t.trackNr || i + 1)));
    else { var th = el('div', 'row-thumb'); th.appendChild(BC.img(t.thumb, 72)); r.appendChild(th); }
    var mid = el('div', 'row-text');
    mid.appendChild(el('div', 'row-title', t.title));
    var sub = BC.artistLine(t) + (!opts.number && t.album && t.album.name ? ' · ' + t.album.name : '');
    mid.appendChild(el('div', 'row-sub', sub));
    r.appendChild(mid);
    var like = BC.icon('heart', 'row-like');
    if (!BC.library.isLiked(t.id)) like.classList.add('hidden');
    r.appendChild(like);
    r.appendChild(el('div', 'row-time', t.duration ? BC.fmtTime(t.duration) : ''));
    r.onActivate = function () { if (opts.onPlay) opts.onPlay(i); else BC.player.playRadio(t); };
    r.onMenu = function () { trackMenu(t); };
    if (BC.player.current() && BC.player.current().id === t.id) r.classList.add('playing');
    r.__track = t;
    return r;
  }

  /** A long list, rendered in chunks as focus nears the end (keeps the DOM small). */
  function trackList(tracks, opts, key) {
    var list = el('div', 'tracklist');
    list.setAttribute('data-nav', 'v');
    list.setAttribute('data-key', key || 'tracks');
    var shown = 0, CHUNK = 40;
    function more() {
      var end = Math.min(tracks.length, shown + CHUNK);
      for (var i = shown; i < end; i++) {
        var r = trackRow(tracks[i], i, opts);
        if (i >= end - 10 && end < tracks.length) r.onFocus = function () { if (shown < tracks.length) more(); };
        list.appendChild(r);
      }
      shown = end;
    }
    more();
    list.appendMore = function (extra) { tracks = tracks.concat(extra); if (shown >= tracks.length - extra.length) more(); };
    return list;
  }

  // ---- Shelves ------------------------------------------------------------------------------
  function scroller(axis, track) {
    var s = el('div', 'scroller scroller-' + axis);
    s.setAttribute('data-scroll', axis);
    s.appendChild(track);
    return s;
  }

  /** A titled horizontal row of cards, or of song columns (Quick picks). */
  function shelf(s, key, opts) {
    opts = opts || {};
    var sec = el('section', 'shelf' + (opts.hero ? ' shelf-hero' : ''));
    sec.setAttribute('data-row', '');
    var head = el('div', 'shelf-head');
    if (s.strapline) head.appendChild(el('div', 'shelf-strap', s.strapline));
    if (s.title) head.appendChild(el('h2', 'shelf-title', s.title));
    if (s.title || s.strapline) sec.appendChild(head);
    var track = el('div', 'shelf-track');
    track.setAttribute('data-nav', 'h');
    track.setAttribute('data-key', key);
    if (s.kind === 'songs') {
      var rows = Math.min(s.rows || 4, 4);
      var tracks = s.items;
      for (var c = 0; c < tracks.length; c += rows) {
        var col = el('div', 'song-col');
        col.setAttribute('data-nav', 'v');
        col.setAttribute('data-key', 'c' + c);
        tracks.slice(c, c + rows).forEach(function (t, j) {
          col.appendChild(trackRow(t, c + j, { onPlay: function (i) { BC.player.playList(tracks, i, { radio: true }); } }));
        });
        track.appendChild(col);
      }
    } else {
      var size = opts.hero ? 400 : (s.items[0] && s.items[0].round ? 240 : 280);
      s.items.forEach(function (c) { track.appendChild(card(c, size)); });
    }
    sec.appendChild(scroller('x', track));
    return sec;
  }

  // ---- Page scaffolding and states --------------------------------------------------------
  /** A page: a vertical scroller whose track is the page's nav group. */
  function page(key, title) {
    var track = el('div', 'page-track');
    track.setAttribute('data-nav', 'v');
    track.setAttribute('data-key', key);
    if (title) track.appendChild(el('h1', 'page-title', title));
    var s = scroller('y', track);
    s.classList.add('page');
    s.setAttribute('data-pad', '120');
    s.setAttribute('data-pad-end', '220'); // clear of the floating mini player
    return { root: s, track: track };
  }

  function skeleton(rows) {
    var w = el('div', 'skeleton');
    w.setAttribute('aria-hidden', 'true');
    for (var r = 0; r < (rows || 2); r++) {
      w.appendChild(el('div', 'sk-title'));
      var line = el('div', 'sk-row');
      for (var i = 0; i < 6; i++) line.appendChild(el('div', 'sk-card'));
      w.appendChild(line);
    }
    return w;
  }

  /** An empty or error state: what this is, and one way forward. */
  function state(title, body, action) {
    var w = el('div', 'state');
    w.setAttribute('data-nav', 'h');
    w.setAttribute('data-key', 'state');
    w.appendChild(el('div', 'state-title', title));
    if (body) w.appendChild(el('div', 'state-body', body));
    if (action) w.appendChild(button(action.label, action.icon, action.run, 'btn-primary', 'state-action'));
    w.setAttribute('role', 'status');
    return w;
  }
  function errorState(e, retry) {
    if (e && e.status === 0) {
      return state('Unable to reach YouTube Music', 'Check that the TV is online, then try again. The connection check shows each request.', {
        label: 'Try again', icon: 'loader', run: retry
      });
    }
    return state('Unable to load this page', (e && e.message ? e.message + '. ' : '') + 'Try again in a moment.', { label: 'Try again', icon: 'loader', run: retry });
  }

  // ---- Overlays: menus, dialogs, toasts ------------------------------------------------------
  var overlayHost = null;
  function host() { return overlayHost || (overlayHost = document.getElementById('overlays')); }

  function openLayer(panel, cls) {
    var back = el('div', 'layer ' + (cls || ''));
    back.appendChild(panel);
    host().appendChild(back);
    var returnTo = BC.nav.focused();
    BC.later(function () { back.classList.add('in'); });
    BC.nav.pushLayer(panel);
    back.close = function () {
      if (back.closing) return;
      back.closing = true;
      back.classList.remove('in');
      BC.nav.popLayer(returnTo);
      setTimeout(function () { back.remove(); }, BC.reducedMotion() ? 0 : 160);
    };
    panel.close = back.close;
    return back;
  }

  /** A context menu: a list of actions with a title. Back closes it. */
  BC.menu = function (title, items) {
    var panel = el('div', 'menu');
    panel.setAttribute('data-nav', 'v');
    panel.setAttribute('data-key', 'menu');
    panel.setAttribute('role', 'menu');
    panel.appendChild(el('div', 'menu-title', title));
    items.forEach(function (it, i) {
      var b = el('div', 'menu-item fx');
      b.setAttribute('role', 'menuitem');
      b.setAttribute('data-key', 'm' + i);
      if (it.icon) b.appendChild(BC.icon(it.icon));
      b.appendChild(el('span', '', it.label));
      if (it.on) b.classList.add('on');
      b.onActivate = function () { panel.close(); it.run(); };
      panel.appendChild(b);
    });
    openLayer(panel, 'layer-menu');
  };

  /** Confirm before something that can't be undone: the title names the action and object. */
  BC.confirm = function (o) {
    var panel = el('div', 'dialog');
    panel.setAttribute('data-nav', 'v');
    panel.setAttribute('data-key', 'dialog');
    panel.setAttribute('role', 'alertdialog');
    panel.appendChild(el('div', 'dialog-title', o.title));
    if (o.body) panel.appendChild(el('div', 'dialog-body', o.body));
    var row = el('div', 'dialog-actions');
    row.setAttribute('data-nav', 'h');
    row.setAttribute('data-key', 'actions');
    var cancel = button(o.cancel || 'Cancel', null, function () { panel.close(); }, '', 'cancel');
    var ok = button(o.confirm, null, function () { panel.close(); o.onConfirm(); }, o.danger ? 'btn-danger' : 'btn-primary', 'ok');
    row.appendChild(cancel); row.appendChild(ok);
    panel.appendChild(row);
    openLayer(panel, 'layer-dialog');
    if (o.focusConfirm) BC.nav.focus(ok); else BC.nav.focus(cancel);
  };

  var toastEl = null, toastTimer = null;
  BC.toast = function (text) {
    if (!toastEl) {
      toastEl = el('div', 'toast');
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add('in');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('in'); }, 3200);
  };
  BC.on('toast', BC.toast);

  BC.ui = {
    button: button, iconButton: iconButton, card: card, trackRow: trackRow, trackList: trackList,
    shelf: shelf, page: page, scroller: scroller, skeleton: skeleton, state: state, errorState: errorState,
    openTarget: openTarget, playCard: playCard, trackMenu: trackMenu, cardMenu: cardMenu, openLayer: openLayer
  };
})(typeof window !== 'undefined' ? window : global);
