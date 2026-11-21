/* Full-screen on-screen keyboard for a remote.
 * Keys are .fx items in rows (data-nav="h") inside a column (data-nav="v"), so the nav
 * engine moves between them by position. Color keys: red Shift, green Clear, yellow Space,
 * blue Search. Number keys type digits. Rewind / Fast-forward move the cursor. Character
 * keys and Delete repeat while OK is held (el.repeat). */
(function (root) {
  'use strict';
  var BC = root.BC;

  var LAYOUTS = {
    en: { name: 'English', rows: ['1234567890', 'qwertyuiop', 'asdfghjkl\'', 'zxcvbnm,.-'] },
    de: { name: 'Deutsch', rows: ['1234567890ß', 'qwertzuiopü', 'asdfghjklöä', 'yxcvbnm,.-'] },
    es: { name: 'Español', rows: ['1234567890', 'qwertyuiop', 'asdfghjklñ', 'zxcvbnm,.-', 'áéíóúü¿¡'] },
    fr: { name: 'Français', rows: ['1234567890', 'azertyuiop', 'qsdfghjklm', 'wxcvbn,.\'-', 'éèêàâçùôî'] },
    ru: { name: 'Русский', rows: ['1234567890', 'йцукенгшщзх', 'фывапролджэ', 'ячсмитьбюё'] }
  };
  var SYMBOLS = ['1234567890', '@#$%&*-+=/', '!?\'",.:;()', '_~^[]{}<>|'];
  var LANG_ORDER = ['en', 'de', 'es', 'fr', 'ru'];

  /** opts: { onChange(text), onSubmit(text), placeholder } */
  BC.Keyboard = function (opts) {
    var text = '', cursor = 0, shift = false, symbols = false;
    var lang = BC.store.get('kbLang', 'en');
    if (!LAYOUTS[lang]) lang = 'en';

    var el = BC.el('div', 'kb');
    el.setAttribute('data-nav', 'v');
    el.setAttribute('data-key', 'kb');
    var field = BC.el('div', 'kb-field');
    field.setAttribute('role', 'textbox');
    field.setAttribute('aria-label', opts.placeholder || 'Search');
    var before = BC.el('span'), caret = BC.el('span', 'kb-caret'), after = BC.el('span');
    var hint = BC.el('span', 'kb-placeholder', opts.placeholder || '');
    field.appendChild(BC.icon('search', 'kb-field-ic'));
    field.appendChild(hint); field.appendChild(before); field.appendChild(caret); field.appendChild(after);
    var keys = BC.el('div', 'kb-keys');
    keys.setAttribute('data-nav', 'v');
    keys.setAttribute('data-key', 'keys');
    var legend = BC.el('div', 'kb-legend');
    [['red', 'Shift'], ['green', 'Clear'], ['yellow', 'Space'], ['blue', 'Search']].forEach(function (p) {
      var s = BC.el('span', 'kb-legend-item');
      s.appendChild(BC.el('i', 'dot dot-' + p[0]));
      s.appendChild(document.createTextNode(p[1]));
      legend.appendChild(s);
    });
    el.appendChild(field);
    el.appendChild(keys);
    el.appendChild(legend);

    function paint() {
      before.textContent = text.slice(0, cursor);
      after.textContent = text.slice(cursor);
      hint.style.display = text ? 'none' : '';
    }
    function changed() { paint(); if (opts.onChange) opts.onChange(text); }
    function insert(ch) { text = text.slice(0, cursor) + ch + text.slice(cursor); cursor += ch.length; changed(); }
    function backspace() { if (cursor > 0) { text = text.slice(0, cursor - 1) + text.slice(cursor); cursor--; changed(); } }

    function key(label, cls, action, keyId, repeat) {
      var k = BC.el('div', 'kb-key fx' + (cls ? ' ' + cls : ''));
      if (typeof label === 'string') k.textContent = label; else k.appendChild(label);
      k.setAttribute('data-key', keyId);
      k.setAttribute('role', 'button');
      k.onActivate = action;
      k.repeat = !!repeat;
      return k;
    }
    function labeled(icon, label) {
      var f = document.createDocumentFragment();
      f.appendChild(BC.icon(icon));
      f.appendChild(BC.el('span', 'kb-key-label', label));
      return f;
    }

    function build() {
      var focusedKey = BC.nav.focused() && keys.contains(BC.nav.focused()) ? BC.nav.focused().getAttribute('data-key') : null;
      keys.innerHTML = '';
      var rows = symbols ? SYMBOLS : LAYOUTS[lang].rows;
      rows.forEach(function (r, ri) {
        var row = BC.el('div', 'kb-row');
        row.setAttribute('data-nav', 'h');
        row.setAttribute('data-key', 'r' + ri);
        Array.from(r).forEach(function (ch, ci) {
          var shown = shift ? ch.toUpperCase() : ch;
          var k = key(shown, '', function () { insert(shown); if (shift) { shift = false; build(); } }, 'k' + ri + '-' + ci, true);
          k.setAttribute('aria-label', shown);
          row.appendChild(k);
        });
        keys.appendChild(row);
      });
      var actions = BC.el('div', 'kb-row kb-actions');
      actions.setAttribute('data-nav', 'h');
      actions.setAttribute('data-key', 'actions');
      actions.appendChild(key(symbols ? 'ABC' : '?#1', 'kb-wide', function () { symbols = !symbols; build(); }, 'sym'));
      var sh = key(labeled('up', 'Shift'), 'kb-wide' + (shift ? ' on' : ''), function () { shift = !shift; build(); }, 'shift');
      sh.setAttribute('aria-pressed', String(shift));
      actions.appendChild(sh);
      actions.appendChild(key(LAYOUTS[lang].name, 'kb-wide', function () {
        lang = LANG_ORDER[(LANG_ORDER.indexOf(lang) + 1) % LANG_ORDER.length];
        BC.store.set('kbLang', lang);
        symbols = false;
        build();
      }, 'lang'));
      actions.appendChild(key('Space', 'kb-space', function () { insert(' '); }, 'space', true));
      var del = key(labeled('del', 'Delete'), 'kb-wide', backspace, 'del', true);
      del.setAttribute('aria-label', 'Delete');
      actions.appendChild(del);
      actions.appendChild(key(labeled('search', 'Search'), 'kb-wide kb-go', function () { if (opts.onSubmit) opts.onSubmit(text); }, 'go'));
      keys.appendChild(actions);
      if (focusedKey) BC.nav.focusKey(keys, focusedKey);
    }
    build();
    paint();

    /** Remote keys while the keyboard is on screen; true when handled. */
    el.handleKey = function (name) {
      switch (name) {
        case 'red': shift = !shift; build(); return true;
        case 'green': text = ''; cursor = 0; changed(); return true;
        case 'yellow': insert(' '); return true;
        case 'blue': if (opts.onSubmit) opts.onSubmit(text); return true;
        case 'rewind': if (cursor > 0) { cursor--; paint(); } return true;
        case 'ff': if (cursor < text.length) { cursor++; paint(); } return true;
      }
      if (/^digit\d$/.test(name)) { insert(name.slice(5)); return true; }
      return false;
    };
    el.setText = function (t) { text = t || ''; cursor = text.length; paint(); };
    el.text = function () { return text; };
    el.cursor = function () { return cursor; };
    el._insert = insert;
    el._backspace = backspace;
    return el;
  };
  BC.Keyboard.LAYOUTS = LAYOUTS;
})(typeof window !== 'undefined' ? window : global);
