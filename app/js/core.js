/* BitChord TV: shared helpers. ES2017, no optional chaining (Tizen 4+ / Chromium 56+).
 * GPL-3.0. Derived from BitChord PC (jackychan4891/BitChord-PC-Official). */
(function (root) {
  'use strict';
  var BC = root.BC = root.BC || {};

  // ---- DOM ------------------------------------------------------------------------------
  BC.el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  };

  // Icons: inline SVG from app/js/icons.js (Lucide), plus two Lucide shapes the PC's subset
  // font lacks. SVG, not font glyphs: glyphs drifted off-centre with text metrics.
  var EXTRA = {
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="m12 9 6 6"/><path d="m18 9-6 6"/></svg>'
  };
  function svgFor(name) {
    if (EXTRA[name]) return EXTRA[name];
    var d = BC.ICON_PATHS && BC.ICON_PATHS[name];
    // The 24-unit stroke thickens Lucide's 2 px lines to about 2.5 px, matching the 600-weight labels.
    return '<svg viewBox="0 0 1000 1000" fill="currentColor" stroke="currentColor" stroke-width="24" stroke-linejoin="round"><path d="' + (d || '') + '"/></svg>';
  }
  BC.icon = function (name, cls) {
    var i = BC.el('span', 'ic' + (cls ? ' ' + cls : ''));
    i.setAttribute('aria-hidden', 'true');
    i.innerHTML = svgFor(name);
    i.__name = name;
    return i;
  };
  /** Swap the icon inside `host` (play/pause, repeat/repeat-one). */
  BC.setIcon = function (host, name) {
    var i = host.querySelector('.ic');
    if (i && i.__name !== name) { i.innerHTML = svgFor(name); i.__name = name; }
  };

  // ---- Images (model.rs `sized`) --------------------------------------------------------
  function squareCrop(opts) {
    var parts = opts.split('-');
    if (parts.indexOf('p') < 0 && parts.indexOf('c') < 0) return false;
    var num = function (prefix) {
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].charAt(0) === prefix && /^\d+$/.test(parts[i].slice(1))) return Number(parts[i].slice(1));
      }
      return null;
    };
    var s = parts.some(function (p) { return /^s\d+$/.test(p); });
    var w = num('w'), h = num('h');
    return s || (w !== null && w === h);
  }

  /** Ask Google's image CDN for exactly `px` square, so art is sharp without huge downloads. */
  BC.sized = function (url, px) {
    if (!url) return '';
    if (url.indexOf('googleusercontent.com') >= 0 || url.indexOf('ggpht.com') >= 0) {
      var i = url.lastIndexOf('=');
      if (i >= 0) return url.slice(0, i) + '=w' + px + '-h' + px + (squareCrop(url.slice(i + 1)) ? '-p' : '') + '-l90-rj';
    }
    return url;
  };

  /** Wide (banner) variant: width only, height follows. */
  BC.sizedWide = function (url, w, h) {
    if (!url) return '';
    if (url.indexOf('googleusercontent.com') >= 0 || url.indexOf('ggpht.com') >= 0) {
      var i = url.lastIndexOf('=');
      if (i >= 0) return url.slice(0, i) + '=w' + w + '-h' + h + '-p-l90-rj';
    }
    return url;
  };

  // ---- Formatting -----------------------------------------------------------------------
  BC.fmtTime = function (sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var ss = (s < 10 ? '0' : '') + s;
    return h ? h + ':' + (m < 10 ? '0' : '') + m + ':' + ss : m + ':' + ss;
  };

  BC.artistLine = function (t) {
    return (t && t.artists ? t.artists : []).map(function (a) { return a.name; }).join(', ');
  };

  // ---- Storage (try/catch: storage can be unavailable) ----------------------------------
  BC.store = {
    get: function (key, fallback) {
      try {
        var v = root.localStorage.getItem('bc.' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { root.localStorage.setItem('bc.' + key, JSON.stringify(value)); } catch (e) { /* full or unavailable */ }
    },
    remove: function (key) {
      try { root.localStorage.removeItem('bc.' + key); } catch (e) { /* ignore */ }
    }
  };

  // ---- Events ---------------------------------------------------------------------------
  var handlers = {};
  BC.on = function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); };
  BC.off = function (name, fn) {
    var list = handlers[name] || [];
    var i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
  BC.emit = function (name, data) {
    (handlers[name] || []).slice().forEach(function (fn) {
      try { fn(data); } catch (e) { if (root.console) console.error('[bc] ' + name, e); }
    });
  };

  // ---- Settings -------------------------------------------------------------------------
  var DEFAULTS = {
    autoplay: true,
    normalize: true,
    animatedBg: true,
    reduceMotion: false,
    showQuality: true,
    lyricSources: ['unison', 'lrcred', 'lrclib'],
    lyricSize: 1          // multiplier on the lyric type size
  };
  var settings = Object.assign({}, DEFAULTS, BC.store.get('settings', {}));
  BC.settings = {
    get: function (k) { return settings[k]; },
    set: function (k, v) {
      settings[k] = v;
      BC.store.set('settings', settings);
      BC.emit('settings', k);
    },
    defaults: DEFAULTS
  };

  BC.reducedMotion = function () {
    if (settings.reduceMotion) return true;
    try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  };

  BC.debounce = function (fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };

  /** Run work after the current frame so a key press paints first. */
  BC.later = function (fn) {
    if (root.requestAnimationFrame) root.requestAnimationFrame(function () { setTimeout(fn, 0); });
    else setTimeout(fn, 16);
  };

  if (typeof module === 'object' && module.exports) module.exports = BC;
})(typeof window !== 'undefined' ? window : global);
