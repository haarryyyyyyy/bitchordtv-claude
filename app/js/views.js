/* Pages. Each view renders into a page track; data is cached on the history entry so Back
 * re-renders instantly with focus memory intact. */
(function (root) {
  'use strict';
  var BC = root.BC;
  var el = BC.el, ui;

  /** Load once per history entry; show a skeleton meanwhile and an error with retry on failure. */
  function withData(ctx, load, render) {
    ui = BC.ui;
    if (ctx.entry.data) { render(ctx.entry.data); return; }
    var sk = ui.skeleton(3);
    ctx.track.appendChild(sk);
    load().then(function (d) {
      if (!ctx.alive()) return;
      ctx.entry.data = d;
      sk.remove();
      render(d);
      BC.app.settle();
    }, function (e) {
      if (!ctx.alive()) return;
      sk.remove();
      ctx.track.appendChild(ui.errorState(e, function () { BC.app.reload(); }));
      BC.app.settle();
    });
  }

  function chipsRow(chips, onPick) {
    var t = el('div', 'chips');
    t.setAttribute('data-nav', 'h');
    t.setAttribute('data-key', 'chips');
    chips.forEach(function (c) {
      var b = el('div', 'chip fx' + (c.selected ? ' on' : ''), c.title);
      b.setAttribute('role', 'button');
      b.setAttribute('aria-pressed', String(!!c.selected));
      b.setAttribute('data-key', 'chip:' + c.title);
      b.onActivate = function () { onPick(c); };
      t.appendChild(b);
    });
    var s = BC.ui.scroller('x', t);
    s.setAttribute('data-row', '');
    return s;
  }

  function actionsRow(buttons) {
    var r = el('div', 'actions');
    r.setAttribute('data-nav', 'h');
    r.setAttribute('data-key', 'actions');
    buttons.forEach(function (b) { r.appendChild(b); });
    return r;
  }

  var VIEWS = {};

  // ---- Home -------------------------------------------------------------------------------
  VIEWS.home = function (p, ctx) {
    withData(ctx, function () { return BC.yt.home(p.params); }, function (d) {
      if (d.chips.length) {
        ctx.track.appendChild(chipsRow(d.chips, function (c) {
          BC.app.replace('home', { params: c.params, chip: c.title });
        }));
      }
      if (!d.shelves.length) {
        ctx.track.appendChild(ui.state('Nothing here yet', 'YouTube Music sent an empty home feed. Try again, or search for something to play.', { label: 'Search', icon: 'search', run: function () { BC.app.go('search'); } }));
        return;
      }
      var loading = false, heroDone = false;
      /** Songs first, then shelves of songs, albums and artists, then playlist shelves. */
      function rank(sh) {
        if (sh.kind === 'songs') return 0;
        var songish = sh.items.filter(function (c) { return c.target.kind !== 'playlist'; }).length;
        return songish * 2 >= sh.items.length ? 1 : 2;
      }
      function ordered(list) {
        return list.map(function (sh, i) { return { sh: sh, i: i }; })
          .sort(function (x, y) { return rank(x.sh) - rank(y.sh) || x.i - y.i; })
          .map(function (x) { return x.sh; });
      }
      function make(sh) {
        // The first card shelf gets the large hero cards.
        var hero = !heroDone && sh.kind === 'cards';
        if (hero) heroDone = true;
        var sec = ui.shelf(sh, 'shelf:' + sh.title, { hero: hero });
        // Focus nearing the last shelves loads the next page of the feed (home_more).
        sec.__near = function () {
          var all = ctx.track.querySelectorAll('.shelf');
          if (Array.prototype.indexOf.call(all, sec) >= all.length - 3) more();
        };
        return sec;
      }
      function add(shelves, spread) {
        // Shelves from a continuation go in one per frame, so a held arrow never stalls.
        if (spread && shelves.length > 1) {
          add(shelves.slice(0, 1));
          BC.later(function () { if (ctx.alive()) add(shelves.slice(1), true); });
          return;
        }
        shelves.forEach(function (sh) { ctx.track.appendChild(make(sh)); });
      }
      function more() {
        if (loading || !d.continuation) return;
        loading = true;
        BC.yt.homeMore(d.continuation).then(function (m) {
          d.continuation = m.continuation;
          d.shelves = d.shelves.concat(m.shelves);
          if (ctx.alive()) add(ordered(m.shelves), true);
          loading = false;
        }, function () { loading = false; });
      }

      // Without a YouTube account, Home learns from what was played on this TV:
      // "Picked for you" is the radio of the last song, "Listen again" the history.
      var history = p.params ? [] : BC.library.history();
      if (history.length) {
        if (d.picks) add([d.picks]);
        add([{ title: 'Listen again', strapline: 'Played on this TV', kind: 'songs', items: history.slice(0, 16), rows: 4 }]);
        if (!d.picks) {
          var seed = history[0];
          var played = {};
          history.slice(0, 60).forEach(function (t) { played[t.id] = true; });
          BC.yt.radio(seed.id, 30).then(function (tracks) {
            var fresh = tracks.filter(function (t) { return !played[t.id]; }).slice(0, 20);
            if (!fresh.length || !ctx.alive()) return;
            d.picks = { title: 'Picked for you', strapline: 'Based on ' + seed.title, kind: 'songs', items: fresh, rows: 4 };
            var first = ctx.track.querySelector('.shelf');
            ctx.track.insertBefore(make(d.picks), first);
            var f = BC.nav.focused();
            if (f && ctx.track.contains(f)) BC.nav.reveal(f, true); // keep focus in view after the insert
          }, function () {});
        }
      }
      add(ordered(d.shelves));
      ctx.onFocus = function (f) {
        var sh = f.closest && f.closest('.shelf');
        if (sh && sh.__near) sh.__near();
      };
    });
  };

  // ---- New ----------------------------------------------------------------------------------
  VIEWS['new'] = function (p, ctx) {
    withData(ctx, function () {
      return Promise.all([
        BC.yt.newAlbums().catch(function () { return []; }),
        BC.yt.charts().catch(function () { return { top: [], playlists: [], artists: [] }; }),
        BC.yt.moods().catch(function () { return []; })
      ]).then(function (r) {
        if (!r[0].length && !r[1].top.length && !r[2].length) { var e = new Error('No reply from YouTube Music'); e.status = 0; throw e; }
        return { albums: r[0], charts: r[1], moods: r[2] };
      });
    }, function (d) {
      if (d.albums.length) ctx.track.appendChild(ui.shelf({ title: 'New releases', kind: 'cards', items: d.albums }, 'new', { hero: true }));
      if (d.charts.top.length) ctx.track.appendChild(ui.shelf({ title: 'Top songs', kind: 'songs', items: d.charts.top.slice(0, 40), rows: 4 }, 'top'));
      if (d.charts.playlists.length) ctx.track.appendChild(ui.shelf({ title: 'Charts', kind: 'cards', items: d.charts.playlists }, 'charts'));
      if (d.charts.artists.length) ctx.track.appendChild(ui.shelf({ title: 'Top artists', kind: 'cards', items: d.charts.artists }, 'artists'));
      d.moods.forEach(function (g, gi) {
        var sec = el('section', 'shelf');
        sec.setAttribute('data-row', '');
        sec.appendChild(el('h2', 'shelf-title', g.title || 'Moods & genres'));
        var grid = el('div', 'tiles');
        grid.setAttribute('data-nav', 'grid');
        grid.setAttribute('data-key', 'moods' + gi);
        g.tiles.forEach(function (t) {
          var b = el('div', 'tile fx');
          b.setAttribute('role', 'button');
          b.setAttribute('data-key', t.browseId + (t.params || ''));
          b.style.borderLeftColor = t.color;
          b.appendChild(el('span', '', t.title));
          b.onActivate = function () { BC.app.open('browse', { id: t.browseId, params: t.params, title: t.title }); };
          grid.appendChild(b);
        });
        sec.appendChild(grid);
        ctx.track.appendChild(sec);
      });
    });
  };

  // ---- Browse (mood, genre, See all) --------------------------------------------------------
  VIEWS.browse = function (p, ctx) {
    withData(ctx, function () { return BC.yt.browse(p.id, p.params); }, function (d) {
      var title = ctx.track.querySelector('.page-title');
      if (title && d.title) title.textContent = d.title;
      d.shelves.forEach(function (s, i) { ctx.track.appendChild(ui.shelf(s, 's' + i)); });
      if (d.grid.length) ctx.track.appendChild(ui.shelf({ title: 'Playlists', kind: 'cards', items: d.grid }, 'grid'));
      if (d.tracks.length) ctx.track.appendChild(ui.trackList(d.tracks, { onPlay: function (i) { BC.player.playList(d.tracks, i); } }));
      if (!d.shelves.length && !d.grid.length && !d.tracks.length) ctx.track.appendChild(ui.state('Nothing on this page', 'YouTube Music has nothing here right now.', null));
    });
  };

  // ---- Album / playlist ---------------------------------------------------------------------
  function collection(kind) {
    return function (p, ctx) {
      withData(ctx, function () { return kind === 'album' ? BC.yt.album(p.id) : BC.yt.playlist(p.id); }, function (d) {
        ctx.track.querySelector('.page-title').remove();
        var head = el('header', 'detail-head');
        head.setAttribute('data-row', '');
        var art = el('div', 'detail-art');
        art.appendChild(BC.img(d.thumb, 400));
        head.appendChild(art);
        var info = el('div', 'detail-info');
        info.appendChild(el('div', 'detail-kind', kind === 'album' ? (d.subtitle.split(' • ')[0] || 'Album') : 'Playlist'));
        info.appendChild(el('h1', 'detail-title', d.title));
        var sub = kind === 'album' ? d.subtitle.split(' • ').slice(1).join(' · ') : d.subtitle;
        if (sub) info.appendChild(el('div', 'detail-sub', sub));
        if (d.meta) info.appendChild(el('div', 'detail-meta', d.meta));
        var cardLike = { title: d.title, subtitle: d.subtitle, thumb: d.thumb, target: { kind: kind, id: d.id } };
        var saveBtn = ui.button(BC.library.isSaved(d.id) ? 'Saved' : 'Save', BC.library.isSaved(d.id) ? 'check' : 'plus', function () {
          var on = BC.library.toggleSaved(cardLike);
          saveBtn.querySelector('.btn-label').textContent = on ? 'Saved' : 'Save';
          BC.toast(on ? 'Saved to library on this TV' : 'Removed from library');
        }, '', 'save');
        info.appendChild(actionsRow([
          ui.button('Play', 'play', function () { BC.player.playList(d.tracks, 0); }, 'btn-primary', 'play'),
          ui.button('Shuffle', 'shuffle', function () { BC.player.playList(d.tracks, 0, { shuffle: true }); }, '', 'shuffle'),
          saveBtn
        ]));
        head.appendChild(info);
        ctx.track.appendChild(head);
        if (!d.tracks.length) { ctx.track.appendChild(ui.state('No songs here', 'This ' + kind + ' is empty on YouTube Music.', null)); return; }
        var list = ui.trackList(d.tracks, { number: kind === 'album', onPlay: function (i) { BC.player.playList(d.tracks, i); } });
        ctx.track.appendChild(list);
        // Playlists continue past the first page; mixes are capped at 500, as on PC.
        var cap = /^RD/.test(d.id) ? 500 : (d.count || 5000);
        (function more() {
          if (!d.token || d.tracks.length >= cap || !ctx.alive()) return;
          var tok = d.token; d.token = null;
          BC.yt.playlistMore(tok).then(function (m) {
            d.tracks = d.tracks.concat(m.tracks);
            d.token = m.tracks.length ? m.token : null;
            list.appendMore(m.tracks);
            more();
          }, function () {});
        })();
      });
    };
  }
  VIEWS.album = collection('album');
  VIEWS.playlist = collection('playlist');

  // ---- Artist ---------------------------------------------------------------------------
  VIEWS.artist = function (p, ctx) {
    withData(ctx, function () { return BC.yt.artist(p.id); }, function (d) {
      ctx.track.querySelector('.page-title').remove();
      var hero = el('header', 'artist-hero');
      hero.setAttribute('data-row', '');
      if (d.banner) hero.appendChild(BC.img(d.banner, 0, 'artist-banner', [1920, 800]));
      var info = el('div', 'artist-info');
      info.appendChild(el('h1', 'artist-name', d.name));
      if (d.subscribers) info.appendChild(el('div', 'detail-meta', d.subscribers));
      var btns = [];
      if (d.top.length) {
        btns.push(ui.button('Play', 'play', function () { BC.player.playList(d.top, 0, { radio: true }); }, 'btn-primary', 'play'));
        btns.push(ui.button('Shuffle', 'shuffle', function () { BC.player.playList(d.top, 0, { shuffle: true, radio: true }); }, '', 'shuffle'));
        btns.push(ui.button('Radio', 'radio', function () { BC.player.playRadio(d.top[0]); }, '', 'radio'));
      }
      if (btns.length) info.appendChild(actionsRow(btns));
      hero.appendChild(info);
      ctx.track.appendChild(hero);
      if (d.top.length) {
        var sec = el('section', 'shelf');
        sec.setAttribute('data-row', '');
        sec.appendChild(el('h2', 'shelf-title', 'Top songs'));
        sec.appendChild(ui.trackList(d.top.slice(0, 5), { onPlay: function (i) { BC.player.playList(d.top, i, { radio: true }); } }, 'top'));
        ctx.track.appendChild(sec);
      }
      d.shelves.forEach(function (s, i) { ctx.track.appendChild(ui.shelf(s, 's' + i)); });
      if (d.description) {
        var about = el('section', 'about');
        about.appendChild(el('h2', 'shelf-title', 'About'));
        about.appendChild(el('p', 'about-text', d.description));
        ctx.track.appendChild(about);
      }
    });
  };

  // ---- Search ---------------------------------------------------------------------------
  VIEWS.search = function (p, ctx) {
    ui = BC.ui;
    ctx.root.classList.add('page-search');
    var wrap = el('div', 'search');
    wrap.setAttribute('data-nav', 'h');
    wrap.setAttribute('data-key', 'search');
    var side = el('div', 'search-side');
    side.setAttribute('data-nav', 'v');
    side.setAttribute('data-key', 'side');
    var heading = el('h2', 'side-title');
    var list = el('div', 'side-list');
    list.setAttribute('data-nav', 'v');
    list.setAttribute('data-key', 'list');
    side.appendChild(heading);
    side.appendChild(list);
    function submit(q) {
      q = (q || '').trim();
      if (!q) return;
      BC.library.addSearch(q);
      ctx.entry.text = kb.text();
      BC.app.open('results', { q: q, title: q });
    }
    var kb = BC.Keyboard({ placeholder: 'Songs, albums, artists', onSubmit: submit, onChange: function (t) { ctx.entry.text = t; suggest(t); } });
    wrap.appendChild(kb);
    wrap.appendChild(side);
    ctx.track.appendChild(wrap);
    ctx.keyHandler = kb.handleKey;

    function fill(title, items, icon) {
      heading.textContent = title;
      list.innerHTML = '';
      items.forEach(function (s, i) {
        var b = el('div', 'side-item fx');
        b.setAttribute('role', 'button');
        b.setAttribute('data-key', 'q' + i);
        b.appendChild(BC.icon(icon));
        b.appendChild(el('span', '', s));
        b.onActivate = function () { kb.setText(s); submit(s); };
        list.appendChild(b);
      });
      if (!items.length && !kb.text()) list.appendChild(el('div', 'side-empty', 'Searches you run appear here.'));
    }
    var seq = 0;
    var suggest = BC.debounce(function (t) {
      if (!t.trim()) { fill('Recent searches', BC.library.searches(), 'history'); return; }
      var mine = ++seq;
      BC.yt.suggestions(t).then(function (s) { if (mine === seq && ctx.alive()) fill('Suggestions', s.slice(0, 8), 'search'); }, function () {});
    }, 200);
    if (ctx.entry.text) { kb.setText(ctx.entry.text); suggest(ctx.entry.text); }
    else fill('Recent searches', BC.library.searches(), 'history');
  };

  VIEWS.results = function (p, ctx) {
    withData(ctx, function () { return BC.yt.search(p.q); }, function (d) {
      var title = ctx.track.querySelector('.page-title');
      title.textContent = '“' + p.q + '”';
      var any = false;
      if (d.top) {
        any = true;
        var top = el('section', 'shelf top-result');
        top.setAttribute('data-row', '');
        top.appendChild(el('h2', 'shelf-title', 'Top result'));
        var row = el('div', 'top-row');
        row.setAttribute('data-nav', 'h');
        row.setAttribute('data-key', 'top');
        row.appendChild(ui.card(d.top, 320, 'card-top'));
        if (d.songs.length) {
          var songs = ui.trackList(d.songs.slice(0, 4), { onPlay: function (i) { BC.player.playList(d.songs, i, { radio: true }); } }, 'topsongs');
          songs.classList.add('top-songs');
          row.appendChild(songs);
        }
        top.appendChild(row);
        ctx.track.appendChild(top);
      }
      if (d.songs.length > 4 || (!d.top && d.songs.length)) {
        any = true;
        ctx.track.appendChild(ui.shelf({ title: 'Songs', kind: 'songs', items: d.songs.slice(d.top ? 4 : 0, 24), rows: 4 }, 'songs'));
      }
      [['Albums', d.albums], ['Artists', d.artists], ['Playlists', d.playlists]].forEach(function (g) {
        if (g[1].length) { any = true; ctx.track.appendChild(ui.shelf({ title: g[0], kind: 'cards', items: g[1] }, g[0])); }
      });
      if (!any) ctx.track.appendChild(ui.state('No results for “' + p.q + '”', 'Check the spelling, or search for an artist or album instead.', { label: 'Edit search', icon: 'search', run: function () { BC.app.back(); } }));
    });
  };

  // ---- Library (on this TV) -------------------------------------------------------------------
  VIEWS.library = function (p, ctx) {
    ui = BC.ui;
    var note = el('p', 'page-note', 'Saved on this TV. Signing in with a YouTube account is not available yet.');
    ctx.track.appendChild(note);
    var liked = BC.library.liked(), saved = BC.library.saved(), history = BC.library.history();
    if (!liked.length && !saved.length && !history.length) {
      ctx.track.appendChild(ui.state('Your library is empty', 'Songs you like and albums or playlists you save appear here. Long-press OK on any song or album to save it.', { label: 'Go to Home', icon: 'home', run: function () { BC.app.go('home'); } }));
      return;
    }
    if (liked.length) {
      var sec = el('section', 'shelf');
      sec.setAttribute('data-row', '');
      var head = el('div', 'shelf-head shelf-head-actions');
      head.appendChild(el('h2', 'shelf-title', 'Liked songs'));
      head.appendChild(actionsRow([
        ui.button('Play', 'play', function () { BC.player.playList(liked, 0); }, 'btn-primary btn-small', 'play-liked'),
        ui.button('Shuffle', 'shuffle', function () { BC.player.playList(liked, 0, { shuffle: true }); }, 'btn-small', 'shuffle-liked')
      ]));
      sec.appendChild(head);
      ctx.track.appendChild(sec);
      ctx.track.appendChild(ui.shelf({ title: '', kind: 'songs', items: liked, rows: 4 }, 'liked'));
    }
    if (saved.length) ctx.track.appendChild(ui.shelf({ title: 'Albums and playlists', kind: 'cards', items: saved }, 'saved'));
    if (history.length) ctx.track.appendChild(ui.shelf({ title: 'Recently played', kind: 'songs', items: history.slice(0, 60), rows: 4 }, 'history'));
  };

  // ---- Settings ---------------------------------------------------------------------------
  VIEWS.settings = function (p, ctx) {
    ui = BC.ui;
    var list = el('div', 'settings');
    list.setAttribute('data-nav', 'v');
    list.setAttribute('data-key', 'settings');
    function group(title) { list.appendChild(el('h2', 'settings-group', title)); }
    function toggle(key, title, desc) {
      var r = el('div', 'setting fx');
      r.setAttribute('role', 'switch');
      r.setAttribute('data-key', key);
      var text = el('div', 'setting-text');
      text.appendChild(el('div', 'setting-title', title));
      if (desc) text.appendChild(el('div', 'setting-desc', desc));
      r.appendChild(text);
      var sw = el('div', 'switch');
      sw.appendChild(el('div', 'switch-knob'));
      r.appendChild(sw);
      function paint() { var on = !!BC.settings.get(key); r.classList.toggle('on', on); r.setAttribute('aria-checked', String(on)); }
      r.onActivate = function () { BC.settings.set(key, !BC.settings.get(key)); paint(); };
      paint();
      list.appendChild(r);
    }
    function action(key, title, desc, run) {
      var r = el('div', 'setting fx');
      r.setAttribute('role', 'button');
      r.setAttribute('data-key', key);
      var text = el('div', 'setting-text');
      text.appendChild(el('div', 'setting-title', title));
      var d = el('div', 'setting-desc', desc || '');
      text.appendChild(d);
      r.appendChild(text);
      r.appendChild(BC.icon('right', 'setting-go'));
      r.onActivate = function () { run(d); };
      list.appendChild(r);
      return d;
    }
    group('Playback');
    toggle('autoplay', 'Autoplay', 'When the queue ends, keep playing similar songs.');
    toggle('normalize', 'Volume normalization', 'Turn loud songs down to YouTube’s loudness level.');
    toggle('showQuality', 'Show audio quality', 'Show the format and bitrate in Now Playing.');
    group('Lyrics');
    var NAMES = { unison: 'Unison', lrcred: 'lrc.red', lrclib: 'LRCLIB' };
    function srcText() { return BC.settings.get('lyricSources').map(function (k) { return NAMES[k]; }).join(', then '); }
    action('sources', 'Lyrics sources', srcText(), function (d) {
      var order = BC.settings.get('lyricSources');
      BC.menu('First source to try', Object.keys(NAMES).map(function (k) {
        return { label: NAMES[k], on: order[0] === k, run: function () {
          BC.settings.set('lyricSources', [k].concat(order.filter(function (x) { return x !== k; })));
          d.textContent = srcText();
        } };
      }));
    });
    var SIZES = [[0.85, 'Small'], [1, 'Default'], [1.2, 'Large']];
    function sizeText() { var s = BC.settings.get('lyricSize'); return (SIZES.filter(function (x) { return x[0] === s; })[0] || SIZES[1])[1]; }
    action('lyricsize', 'Lyrics text size', sizeText(), function (d) {
      BC.menu('Lyrics text size', SIZES.map(function (s) {
        return { label: s[1], on: BC.settings.get('lyricSize') === s[0], run: function () { BC.settings.set('lyricSize', s[0]); d.textContent = s[1]; } };
      }));
    });
    group('Appearance');
    toggle('animatedBg', 'Animated background', 'The cover slowly flows behind Now Playing.');
    toggle('reduceMotion', 'Reduce motion', 'Cross-fade instead of sliding and scaling.');
    group('Library on this TV');
    action('clear-searches', 'Clear search history', BC.library.searches().length + ' searches', function (d) {
      BC.confirm({ title: 'Clear search history?', body: 'Your recent searches on this TV will be removed. This can’t be undone.', confirm: 'Clear searches', danger: true, onConfirm: function () { BC.library.clearSearches(); d.textContent = '0 searches'; BC.toast('Search history cleared'); } });
    });
    action('clear-library', 'Clear library', BC.library.liked().length + ' liked songs, ' + BC.library.saved().length + ' saved', function (d) {
      BC.confirm({ title: 'Clear the library on this TV?', body: 'Liked songs, saved albums and playlists, and listening history on this TV will be removed. This can’t be undone.', confirm: 'Clear library', danger: true, onConfirm: function () { BC.library.clearAll(); d.textContent = '0 liked songs, 0 saved'; BC.toast('Library cleared'); } });
    });
    group('About');
    action('connection', 'Connection check', 'See each request to YouTube Music and the lyrics sources.', function () { BC.app.open('connection', {}); });
    action('about', 'About BitChord', 'Version ' + BC.VERSION + ' · GPL-3.0', function () { BC.app.open('about', {}); });
    ctx.track.appendChild(list);
  };

  // ---- Connection check (the probe, built in) ---------------------------------------------
  VIEWS.connection = function (p, ctx) {
    ui = BC.ui;
    var a = document.createElement('audio');
    var info = el('div', 'diag-env');
    info.textContent = navigator.userAgent + '\nViewport ' + innerWidth + '×' + innerHeight + ' · screen ' + screen.width + '×' + screen.height + ' · pixel ratio ' + (window.devicePixelRatio || 1) +
      '\nAAC: “' + a.canPlayType('audio/mp4; codecs="mp4a.40.2"') + '” · Opus: “' + a.canPlayType('audio/webm; codecs="opus"') + '” · Media Source: ' + (window.MediaSource ? 'yes' : 'no');
    ctx.track.appendChild(info);
    var list = el('div', 'diag');
    function paint() {
      list.innerHTML = '';
      var log = BC.net.log().slice(-14).reverse();
      if (!log.length) list.appendChild(el('div', 'side-empty', 'No requests yet.'));
      log.forEach(function (r) {
        var row = el('div', 'diag-row ' + (r.ok ? 'ok' : 'bad'));
        row.appendChild(el('span', 'diag-pill', r.ok ? 'OK' : 'Failed'));
        row.appendChild(el('span', 'diag-name', r.name));
        row.appendChild(el('span', 'diag-detail', (r.err ? r.err + ' · ' : '') + 'HTTP ' + r.status + ' · ' + r.ms + ' ms'));
        list.appendChild(row);
      });
    }
    paint();
    ctx.track.appendChild(actionsRow([
      ui.button('Test again', 'loader', function () {
        Promise.all([
          BC.yt.home().catch(function () {}),
          BC.yt.suggestions('a').catch(function () {}),
          BC.net.get('https://lrclib.net/api/get?artist_name=Radiohead&track_name=Let%20Down', 'LRCLIB').catch(function () {})
        ]).then(paint);
      }, 'btn-primary', 'retry'),
      ui.button('Go to Home', 'home', function () { BC.app.go('home'); }, '', 'home')
    ]));
    ctx.track.appendChild(list);
    BC.on('net', paint);
    ctx.onLeave = function () { BC.off('net', paint); };
  };

  VIEWS.about = function (p, ctx) {
    ctx.track.appendChild(el('p', 'about-text', 'BitChord for Samsung TV ' + BC.VERSION + '. A port of BitChord by jackychan4891 (PC) and kushagrasinghx (Android, TV, web), released under the GNU General Public License v3.0. Source: github.com/haarryyyyyyy/bitchordtv-claude.'));
    ctx.track.appendChild(el('p', 'about-text', 'Music and artwork come from YouTube Music. Lyrics come from Unison, lrc.red and LRCLIB. Fonts: Inter and Figtree (SIL Open Font License); icons: Lucide (ISC License).'));
    ctx.track.appendChild(actionsRow([BC.ui.button('Back', 'left', function () { BC.app.back(); }, '', 'back')]));
  };

  BC.views = VIEWS;
  BC.viewTitles = { home: 'Home', 'new': 'New', search: 'Search', library: 'Library', settings: 'Settings', connection: 'Connection check', about: 'About' };
})(typeof window !== 'undefined' ? window : global);
