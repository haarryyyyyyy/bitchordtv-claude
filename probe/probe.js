/* BitChord TV probe: can a Tizen web app read YouTube Music directly?
 * ES5 on purpose (runs on Tizen 3.0+ / Chromium 47+). GPL-3.0.
 * Request shapes mirror BitChord PC: src/ytmapi.rs (WEB_REMIX), src/innertube.rs (VISIONOS),
 * src/lyrics.rs (Unison, lrc.red); LRCLIB per web/fixtures/README.md. */
(function () {
  'use strict';
  var WEB_REMIX_VERSION = '1.20261006.10.00'; // ytmapi.rs FALLBACK_VERSION
  var VISION_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
  var SONGS_FILTER = 'EgWKAQIIAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D'; // ytm.rs Filter::Songs
  var list = document.getElementById('list');
  var verdictEl = document.getElementById('verdict');
  var state = {};
  var results = [];

  function row(name) {
    var li = document.createElement('li');
    li.innerHTML = '<div class="pill">…</div><div><div class="name"></div><div class="detail"></div></div>';
    li.querySelector('.name').textContent = name;
    list.appendChild(li);
    return function (kind, detail) {
      li.className = kind;
      li.querySelector('.pill').textContent = kind === 'pass' ? 'PASS' : kind === 'fail' ? 'FAIL' : 'INFO';
      li.querySelector('.detail').textContent = detail || '';
      results.push({ name: name, kind: kind, detail: detail });
      console.log('[probe] ' + kind.toUpperCase() + ' ' + name + ' :: ' + detail);
    };
  }

  // XHR so a CORS failure shows up as status 0 instead of a thrown TypeError.
  function xhr(method, url, body, ctype) {
    return new Promise(function (resolve) {
      var x = new XMLHttpRequest();
      var t0 = Date.now();
      x.open(method, url, true);
      if (ctype) x.setRequestHeader('Content-Type', ctype);
      x.timeout = 12000;
      x.onload = function () { resolve({ ok: x.status >= 200 && x.status < 300, status: x.status, text: x.responseText, ms: Date.now() - t0 }); };
      x.onerror = function () { resolve({ ok: false, status: x.status, text: '', ms: Date.now() - t0, err: 'network or CORS error' }); };
      x.ontimeout = function () { resolve({ ok: false, status: 0, text: '', ms: Date.now() - t0, err: 'timeout' }); };
      x.send(body || null);
    });
  }

  function simplePost(url, obj) { return xhr('POST', url, JSON.stringify(obj), 'text/plain;charset=UTF-8'); }

  function json(r) { try { return JSON.parse(r.text); } catch (e) { return null; } }

  function describe(r) {
    return (r.err ? r.err + ', ' : '') + 'HTTP ' + r.status + ', ' + r.text.length + ' bytes, ' + r.ms + ' ms';
  }

  function webRemix() {
    var c = { clientName: 'WEB_REMIX', clientVersion: WEB_REMIX_VERSION, hl: 'en', gl: 'US' };
    if (state.visitorData) c.visitorData = state.visitorData;
    return { client: c };
  }

  function env() {
    var a = document.createElement('audio');
    var lines = [
      'origin: ' + location.origin + '   href: ' + location.href.slice(0, 80),
      'UA: ' + navigator.userAgent,
      'canPlayType  opus/webm: "' + a.canPlayType('audio/webm; codecs="opus"') + '"   aac/mp4: "' + a.canPlayType('audio/mp4; codecs="mp4a.40.2"') + '"'
    ];
    try {
      lines.push('Tizen platform: ' + tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version') +
        '   model: ' + (window.webapis && webapis.productinfo ? webapis.productinfo.getRealModel() : 'n/a'));
    } catch (e) { lines.push('Tizen API: not available (' + e.message + ')'); }
    document.getElementById('env').textContent = lines.join('\n');
  }

  var tests = [
    function browseHome() {
      var done = row('WEB_REMIX browse FEmusic_home (simple POST, XHR)');
      return simplePost('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', { context: webRemix(), browseId: 'FEmusic_home' }).then(function (r) {
        var j = json(r);
        state.visitorData = j && j.responseContext && j.responseContext.visitorData;
        state.ytmReadable = !!j;
        done(j ? 'pass' : 'fail', describe(r) + (state.visitorData ? ', visitorData ok' : ''));
      });
    },
    function browseFetch() {
      var done = row('Same call via fetch() (mode: cors)');
      var t0 = Date.now();
      return fetch('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ context: webRemix(), browseId: 'FEmusic_home' })
      }).then(function (res) { return res.text().then(function (t) { done(t.length > 1000 ? 'pass' : 'fail', 'HTTP ' + res.status + ', ' + t.length + ' bytes, ' + (Date.now() - t0) + ' ms'); }); },
        function (e) { done('fail', String(e && e.message || e)); });
    },
    function jsonType() {
      var done = row('Preflighted request (application/json), info only');
      return xhr('POST', 'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', JSON.stringify({ context: webRemix(), browseId: 'FEmusic_home' }), 'application/json').then(function (r) {
        done('info', (json(r) ? 'readable: ' : 'not readable: ') + describe(r));
      });
    },
    function search() {
      var done = row('WEB_REMIX search (songs filter)');
      return simplePost('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', { context: webRemix(), query: 'radiohead let down', params: SONGS_FILTER }).then(function (r) {
        var m = r.text.match(/"videoId":"([\w-]{11})"/);
        state.videoId = m ? m[1] : 'ZVgHPSyEIqk';
        done(m ? 'pass' : 'fail', describe(r) + (m ? ', first videoId ' + m[1] : ''));
      });
    },
    function suggestions() {
      var done = row('Search suggestions');
      return simplePost('https://music.youtube.com/youtubei/v1/music/get_search_suggestions?prettyPrint=false', { context: webRemix(), input: 'radioh' }).then(function (r) {
        done(json(r) ? 'pass' : 'fail', describe(r));
      });
    },
    function radio() {
      var done = row('next: song radio (RDAMVM)');
      return simplePost('https://music.youtube.com/youtubei/v1/next?prettyPrint=false', { context: webRemix(), videoId: state.videoId, playlistId: 'RDAMVM' + state.videoId, isAudioOnly: true }).then(function (r) {
        done(json(r) ? 'pass' : 'fail', describe(r));
      });
    },
    function player() {
      var done = row('VISIONOS /player (simple POST, no headers)');
      return simplePost('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        context: { client: { clientName: 'VISIONOS', clientVersion: '1.02', deviceMake: 'Apple', deviceModel: 'RealityDevice17,1', userAgent: VISION_UA, osName: 'visionOS', osVersion: '26.5.23O471', hl: 'en', gl: 'US', visitorData: state.visitorData || '' } },
        videoId: state.videoId, contentCheckOk: true, racyCheckOk: true
      }).then(function (r) {
        var j = json(r);
        if (!j) return done('fail', describe(r));
        var ps = j.playabilityStatus || {};
        var formats = (j.streamingData && j.streamingData.adaptiveFormats) || [];
        state.urls = {};
        formats.forEach(function (f) { if ((f.itag === 251 || f.itag === 140 || f.itag === 139) && f.url) state.urls[f.itag] = f.url; });
        var itags = Object.keys(state.urls).join(', ') || 'none';
        done(ps.status === 'OK' && itags !== 'none' ? 'pass' : 'fail', describe(r) + ', ' + ps.status + (ps.reason ? ' (' + ps.reason + ')' : '') + ', itags: ' + itags);
      });
    },
    function play251() { return playItag(251, 'Play Opus 251 in <audio>'); },
    function play140() { return playItag(140, 'Play AAC 140 in <audio>'); },
    function lrclib() {
      var done = row('LRCLIB get');
      return xhr('GET', 'https://lrclib.net/api/get?artist_name=Radiohead&track_name=Let%20Down&album_name=OK%20Computer&duration=299').then(function (r) {
        var j = json(r);
        done(j && j.syncedLyrics ? 'pass' : 'fail', describe(r) + (j && j.syncedLyrics ? ', synced lyrics' : ''));
      });
    },
    function lrcred() {
      var done = row('lrc.red search');
      return xhr('GET', 'https://lrc.red/search.json?q=' + encodeURIComponent('Let Down Radiohead')).then(function (r) {
        done(json(r) ? 'pass' : 'fail', describe(r));
      });
    },
    function unison() {
      var done = row('Unison lyrics');
      return xhr('GET', 'https://unison.betterlyrics.org/lyrics?v=' + state.videoId + '&song=Let%20Down&artist=Radiohead&duration=299&album=OK%20Computer').then(function (r) {
        done(r.status === 404 || json(r) ? 'pass' : 'fail', describe(r) + (r.status === 404 ? ' (no lyrics, but readable)' : ''));
      });
    },
    serviceTest
  ];

  function playItag(itag, name) {
    var done = row(name);
    var url = state.urls && state.urls[itag];
    if (!url) { done('fail', 'no URL from /player'); return Promise.resolve(); }
    return new Promise(function (resolve) {
      var a = new Audio();
      var t0 = Date.now();
      var finished = false;
      function end(kind, msg) {
        if (finished) return;
        finished = true;
        a.pause(); a.removeAttribute('src'); a.load();
        done(kind, msg);
        resolve();
      }
      a.addEventListener('timeupdate', function () {
        if (a.currentTime > 1) end('pass', 'playing after ' + (Date.now() - t0) + ' ms, duration ' + Math.round(a.duration) + ' s');
      });
      a.addEventListener('error', function () { end('fail', 'media error ' + (a.error && a.error.code)); });
      setTimeout(function () { end('fail', 'no playback within 15 s (readyState ' + a.readyState + ')'); }, 15000);
      a.volume = 0.4;
      a.src = url;
      var p = a.play();
      if (p && p.catch) p.catch(function (e) { end('fail', 'play() rejected: ' + e.message); });
    });
  }

  // Experimental: launch the bundled service app and let it try the same browse call outside the page.
  function serviceTest() {
    var done = row('On-TV service app: browse from service (experimental)');
    return new Promise(function (resolve) {
      var timer;
      function end(kind, msg) { clearTimeout(timer); done(kind, msg); resolve(); }
      try {
        var port = tizen.messageport.requestLocalMessagePort('BC_PROBE_UI');
        port.addMessagePortListener(function (data) {
          var m = {};
          data.forEach(function (d) { m[d.key] = d.value; });
          end(m.ok === 'true' ? 'pass' : 'fail', 'service says: ' + m.detail);
        });
        var svc = tizen.application.getCurrentApplication().appInfo.packageId + '.ProbeService';
        tizen.application.launchAppControl(new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/service'), svc,
          function () { timer = setTimeout(function () { end('fail', 'service launched but sent nothing in 20 s'); }, 20000); },
          function (e) { end('fail', 'could not launch service: ' + e.name + ' ' + e.message); });
      } catch (e) { end('fail', 'Tizen API unavailable: ' + e.message); }
    });
  }

  var running = false;
  function run() {
    if (running) return; // OK during a run would overlap audio and duplicate rows
    running = true;
    list.innerHTML = '';
    results = [];
    state = {};
    verdictEl.textContent = 'Running…';
    env();
    var chain = Promise.resolve();
    tests.forEach(function (t) { chain = chain.then(t).catch(function (e) { console.log('[probe] test crashed', e); }); });
    chain.then(function () {
      running = false;
      var fails = results.filter(function (r) { return r.kind === 'fail'; }).length;
      verdictEl.textContent = state.ytmReadable
        ? (fails ? 'YouTube is readable directly. ' + fails + ' other check(s) failed: photograph this screen.' : 'All checks passed: direct YouTube works on this TV.')
        : 'YouTube is NOT readable from the page (CORS). Photograph this screen.';
      console.log('[probe] RESULT ' + JSON.stringify(results));
    });
  }

  try { tizen.tvinputdevice.registerKey('MediaPlayPause'); } catch (e) { /* not on a TV */ }
  document.addEventListener('keydown', function (e) {
    if (e.keyCode === 13) run();
    if (e.keyCode === 10009) { try { tizen.application.getCurrentApplication().exit(); } catch (x) { /* browser */ } }
  });
  run();
})();
