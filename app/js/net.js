/* Network: YouTube Music InnerTube as CORS-simple requests, lyrics as plain GETs.
 * No proxy and no service app: a packaged Tizen app reads youtubei directly (verified on a
 * Tizen 6.5 TV with the probe in /probe, including preflighted requests).
 * Request shapes: ytmapi.rs (WEB_REMIX), innertube.rs (VISIONOS). */
(function (root) {
  'use strict';
  var BC = root.BC;

  var WEB_REMIX_VERSION = '1.20261006.10.00'; // ytmapi.rs FALLBACK_VERSION
  var VISION_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
  var YTM = 'https://music.youtube.com/youtubei/v1/';

  var log = [];          // every request, newest last, for the connection check
  var visitorData = BC.store.get('visitorData', '');

  function record(entry) {
    log.push(entry);
    if (log.length > 60) log.shift();
    BC.emit('net', entry);
  }

  function xhr(method, url, body) {
    return new Promise(function (resolve) {
      var x = new XMLHttpRequest();
      var t0 = Date.now();
      x.open(method, url, true);
      // text/plain keeps a POST "simple": no preflight, which youtubei answers with 400.
      if (body !== undefined) x.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
      x.timeout = 15000;
      x.onload = function () { resolve({ status: x.status, text: x.responseText, ms: Date.now() - t0 }); };
      x.onerror = function () { resolve({ status: 0, text: '', ms: Date.now() - t0, err: 'blocked or offline' }); };
      x.ontimeout = function () { resolve({ status: 0, text: '', ms: Date.now() - t0, err: 'timed out' }); };
      x.send(body === undefined ? null : body);
    });
  }

  /** One request, logged for the connection check. */
  function request(method, url, body, name) {
    return xhr(method, url, body).then(function (r) {
      record({ name: name, url: url, status: r.status, ms: r.ms, ok: r.status >= 200 && r.status < 300, err: r.err });
      return r;
    });
  }

  function parse(r, what) {
    if (r.status < 200 || r.status >= 300) {
      var e = new Error(r.status ? what + ' failed (HTTP ' + r.status + ')' : 'Unable to reach YouTube Music');
      e.status = r.status;
      e.blocked = r.status === 0;
      throw e;
    }
    try { return JSON.parse(r.text); } catch (x) { throw new Error(what + ': unreadable reply'); }
  }

  // ---- YouTube Music (WEB_REMIX) -----------------------------------------------------------
  function context() {
    var c = { clientName: 'WEB_REMIX', clientVersion: WEB_REMIX_VERSION, hl: 'en', gl: 'US' };
    if (visitorData) c.visitorData = visitorData;
    return { client: c };
  }

  function ytm(endpoint, body) {
    body = Object.assign({ context: context() }, body);
    return request('POST', YTM + endpoint + '?prettyPrint=false', JSON.stringify(body), endpoint).then(function (r) {
      var json = parse(r, endpoint);
      var vd = json.responseContext && json.responseContext.visitorData;
      if (vd && vd !== visitorData) { visitorData = vd; BC.store.set('visitorData', vd); }
      return json;
    });
  }

  /** visionOS player (innertube.rs): plain stream URLs, no cipher, no PO token. Needs visitor data. */
  function player(videoId) {
    var ready = visitorData ? Promise.resolve() : ytm('browse', { browseId: 'FEmusic_home' });
    return ready.then(function () {
      var body = {
        context: { client: { clientName: 'VISIONOS', clientVersion: '1.02', deviceMake: 'Apple', deviceModel: 'RealityDevice17,1', userAgent: VISION_UA, osName: 'visionOS', osVersion: '26.5.23O471', hl: 'en', gl: 'US', visitorData: visitorData } },
        videoId: videoId, contentCheckOk: true, racyCheckOk: true
      };
      return request('POST', 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false', JSON.stringify(body), 'player');
    }).then(function (r) { return parse(r, 'player'); });
  }

  function get(url, name) {
    return request('GET', url, undefined, name || 'get');
  }

  BC.net = {
    ytm: ytm,
    player: player,
    get: get,
    log: function () { return log.slice(); },
    hasVisitor: function () { return !!visitorData; }
  };
})(typeof window !== 'undefined' ? window : global);
