/* Spatial navigation for a remote: row/column model with per-group focus memory.
 *
 * Markup: a group is any element with data-nav="h" | "v" | "grid"; a focusable item has
 * class "fx". Items and groups carry data-key, so memory is a path of keys that survives
 * re-renders. Arrows move within the nearest group that has that axis, bubbling up when a
 * group has nothing further that way. Scrollers (data-scroll="x" | "y") move their first
 * child with transform only. Items may define el.onActivate, el.onMenu, el.onFocus. */
(function (root) {
  'use strict';
  var BC = root.BC;

  var focused = null;
  var layers = [];          // overlay roots; the last one traps focus
  var memory = {};          // groupPath -> child key last focused in it
  var listeners = [];

  function isUnit(el) { return el.classList.contains('fx') || el.hasAttribute('data-nav'); }
  function parentUnit(el) {
    var p = el.parentElement;
    while (p && !isUnit(p)) p = p.parentElement;
    return p;
  }
  function visible(el) { return el.offsetParent !== null && !el.hasAttribute('data-skip'); }

  /** Direct units of a group: items and subgroups not nested in another unit. */
  function unitsOf(group) {
    var all = group.querySelectorAll('.fx,[data-nav]');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (parentUnit(all[i]) === group && visible(all[i]) && hasFocusable(all[i])) out.push(all[i]);
    }
    return out;
  }
  function hasFocusable(u) {
    if (u.classList.contains('fx')) return true;
    return !!u.querySelector('.fx');
  }
  function keyOf(u, i) { return u.getAttribute('data-key') || ('#' + i); }
  function pathOf(group) {
    var parts = [];
    for (var n = group; n && n !== document.body; n = parentUnit(n)) parts.unshift(n.getAttribute('data-key') || n.id || n.tagName);
    return parts.join('/');
  }
  function layerRoot() { return layers.length ? layers[layers.length - 1] : document.getElementById('app'); }
  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  /** Columns of a grid group: units sharing the first unit's top. */
  function gridCols(units) {
    if (!units.length) return 1;
    var top = units[0].offsetTop, n = 0;
    while (n < units.length && units[n].offsetTop === top) n++;
    return Math.max(1, n);
  }

  /** Enter a unit from a direction: an item is itself; a group restores memory, else nearest. */
  function enter(u, dir, from) {
    if (u.classList.contains('fx')) return u;
    var units = unitsOf(u);
    if (!units.length) return null;
    var pick = null;
    // A group may name the child to enter first (the top bar enters on the current tab).
    var prefer = u.getAttribute('data-prefer');
    if (prefer) pick = units.filter(function (c) { return c.matches(prefer); })[0] || null;
    var mem = pick ? undefined : memory[pathOf(u)];
    if (mem !== undefined) {
      for (var i = 0; i < units.length; i++) if (keyOf(units[i], i) === mem) { pick = units[i]; break; }
    }
    if (!pick && from) {
      // Nearest along the axis we are not moving on (entering a row from above keeps the x).
      var best = Infinity;
      units.forEach(function (c) {
        var cc = center(c.getBoundingClientRect());
        var d = (dir === 'up' || dir === 'down') ? Math.abs(cc.x - from.x) : Math.abs(cc.y - from.y);
        if (d < best) { best = d; pick = c; }
      });
    }
    if (!pick) pick = (dir === 'up' || dir === 'left') && u.getAttribute('data-nav') !== 'h' && u.getAttribute('data-nav') !== 'grid' ? units[units.length - 1] : units[0];
    return enter(pick, dir, from);
  }

  function step(group, unit, dir) {
    var kind = group.getAttribute('data-nav');
    var units = unitsOf(group);
    var i = units.indexOf(unit);
    if (i < 0) return null;
    var d = { left: -1, right: 1, up: -1, down: 1 }[dir];
    if (kind === 'h' && (dir === 'left' || dir === 'right')) return units[i + d] || null;
    if (kind === 'v' && (dir === 'up' || dir === 'down')) return units[i + d] || null;
    if (kind === 'grid') {
      var cols = gridCols(units);
      if (dir === 'left' || dir === 'right') {
        var j = i + d;
        return j >= 0 && j < units.length && Math.floor(j / cols) === Math.floor(i / cols) ? units[j] : null;
      }
      var k = i + d * cols;
      if (k >= units.length && Math.floor(i / cols) < Math.floor((units.length - 1) / cols)) k = units.length - 1;
      return units[k] || null;
    }
    return null;
  }

  function move(dir) {
    if (!focused || !document.body.contains(focused)) { restore(); return !!focused; }
    var from = center(focused.getBoundingClientRect());
    var stop = layerRoot();
    var node = focused;
    while (node && node !== stop) {
      var group = parentUnit(node);
      if (!group || !stop.contains(group)) break;
      var next = step(group, node, dir);
      if (next) {
        var target = enter(next, dir, from);
        if (target) { focus(target); return true; }
      }
      node = group;
    }
    BC.emit('nav-edge', dir);
    return false;
  }

  function remember(el) {
    for (var u = el, g = parentUnit(el); g; u = g, g = parentUnit(g)) {
      var units = unitsOf(g);
      var i = units.indexOf(u);
      if (i >= 0) memory[pathOf(g)] = keyOf(u, i);
    }
  }

  var supportsPreventScroll = false;
  try {
    document.createElement('div').focus({ get preventScroll() { supportsPreventScroll = true; return true; } });
  } catch (e) { /* old engines */ }

  function focus(el, opts) {
    if (!el) return;
    if (focused && focused !== el) {
      focused.classList.remove('focused');
      if (focused.onBlur) focused.onBlur();
    }
    focused = el;
    el.classList.add('focused');
    remember(el);
    // Real DOM focus lets Samsung Voice Guide read the aria-label; never let it scroll.
    if (supportsPreventScroll) { if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
    reveal(el, opts && opts.instant);
    if (el.onFocus) el.onFocus();
    listeners.forEach(function (fn) { fn(el); });
  }

  /** Bring an element into view inside every scroller it sits in (transform only). */
  function reveal(el, instant) {
    for (var s = el.parentElement; s; s = s.parentElement) {
      var axis = s.getAttribute && s.getAttribute('data-scroll');
      if (!axis) continue;
      var track = s.firstElementChild;
      if (!track) continue;
      // Reveal the whole row (header included) vertically when the item marks one.
      var subject = axis === 'y' ? (closestAttr(el, 'data-row', s) || el) : el;
      var tr = track.getBoundingClientRect(), er = subject.getBoundingClientRect(), sr = s.getBoundingClientRect();
      var off = track.__off || 0;
      var pad = Number(s.getAttribute('data-pad') || 64);
      var padEnd = Number(s.getAttribute('data-pad-end') || pad);
      var next = off;
      if (axis === 'y') {
        var top = er.top - tr.top, bottom = top + er.height, view = sr.height;
        var anchor = s.getAttribute('data-anchor');
        if (anchor) next = Math.max(0, top - view * Number(anchor));
        else if (top - off < pad) next = Math.max(0, top - pad);
        else if (bottom - off > view - padEnd) next = bottom - view + padEnd;
        var maxY = Math.max(0, track.scrollHeight - view);
        next = Math.min(next, maxY);
      } else {
        var left = er.left - tr.left, right = left + er.width, w = sr.width;
        if (left - off < pad) next = Math.max(0, left - pad);
        else if (right - off > w - pad) next = right - w + pad;
        next = Math.min(next, Math.max(0, track.scrollWidth - w));
      }
      if (next !== off) setOffset(track, axis, next, instant);
    }
  }
  function closestAttr(el, attr, stopAt) {
    for (var n = el; n && n !== stopAt; n = n.parentElement) if (n.hasAttribute && n.hasAttribute(attr)) return n;
    return null;
  }
  function setOffset(track, axis, v, instant) {
    track.__off = v;
    if (instant) { track.style.transition = 'none'; }
    track.style.transform = axis === 'y' ? 'translate3d(0,' + (-v) + 'px,0)' : 'translate3d(' + (-v) + 'px,0,0)';
    if (instant) { void track.offsetWidth; track.style.transition = ''; }
    BC.emit('scrolled', { track: track, axis: axis, offset: v });
  }

  /** Focus the remembered path inside the current layer, else its first item. */
  function restore() {
    var rootEl = layerRoot();
    if (focused && rootEl.contains(focused) && document.body.contains(focused)) { focus(focused, { instant: true }); return; }
    var start = rootEl.hasAttribute('data-nav') ? rootEl : rootEl.querySelector('[data-nav]');
    var target = start ? enter(start, 'down', null) : rootEl.querySelector('.fx');
    if (target) focus(target, { instant: true });
  }

  /** Focus an element by its key path inside a container (for Back and re-renders). */
  function focusKey(container, key) {
    var el = container.querySelector('[data-key="' + String(key).replace(/"/g, '\\"') + '"]');
    if (el && !el.classList.contains('fx')) el = enter(el, 'down', null);
    if (el) focus(el, { instant: true });
    return !!el;
  }

  BC.nav = {
    move: move,
    focus: focus,
    restore: restore,
    focusKey: focusKey,
    reveal: reveal,
    setOffset: setOffset,
    focused: function () { return focused; },
    pushLayer: function (el) { layers.push(el); var t = enter(el.hasAttribute('data-nav') ? el : el.querySelector('[data-nav]') || el, 'down', null); if (t) focus(t, { instant: true }); },
    popLayer: function (returnTo) {
      layers.pop();
      if (returnTo && document.body.contains(returnTo)) focus(returnTo, { instant: true }); else restore();
    },
    hasLayer: function () { return layers.length > 0; },
    topLayer: function () { return layers[layers.length - 1] || null; },
    onFocus: function (fn) { listeners.push(fn); },
    memory: memory,
    _unitsOf: unitsOf
  };
})(typeof window !== 'undefined' ? window : global);
