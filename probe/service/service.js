/* Experimental Tizen web service: does a request made here escape the page's CORS rules?
 * Tries Node's https module first, then XMLHttpRequest, and reports to the UI's message port. */
var UI_APP = 'bcprobe001.BitChordProbe';
var BODY = JSON.stringify({ context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20261006.10.00', hl: 'en', gl: 'US' } }, browseId: 'FEmusic_home' });

function report(ok, detail) {
  try {
    var port = tizen.messageport.requestRemoteMessagePort(UI_APP, 'BC_PROBE_UI');
    port.sendMessage([{ key: 'ok', value: String(ok) }, { key: 'detail', value: detail }]);
  } catch (e) { console.log('[probe-svc] report failed ' + e.message); }
  try { tizen.application.getCurrentApplication().exit(); } catch (e) { /* ignore */ }
}

function viaHttps() {
  var https = require('https');
  var t0 = Date.now();
  var req = https.request({ host: 'music.youtube.com', path: '/youtubei/v1/browse?prettyPrint=false', method: 'POST', headers: { 'Content-Type': 'application/json' } }, function (res) {
    var n = 0;
    res.on('data', function (c) { n += c.length; });
    res.on('end', function () { report(res.statusCode === 200 && n > 1000, 'node https: HTTP ' + res.statusCode + ', ' + n + ' bytes, ' + (Date.now() - t0) + ' ms'); });
  });
  req.on('error', function (e) { report(false, 'node https error: ' + e.message); });
  req.end(BODY);
}

function viaXhr() {
  var x = new XMLHttpRequest();
  x.open('POST', 'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', true);
  x.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
  x.onload = function () { report(x.responseText.length > 1000, 'service XHR: HTTP ' + x.status + ', ' + x.responseText.length + ' bytes'); };
  x.onerror = function () { report(false, 'service XHR: network or CORS error'); };
  x.send(BODY);
}

module.exports.onStart = function () { console.log('[probe-svc] start'); };
module.exports.onRequest = function () {
  try {
    if (typeof require === 'function') return viaHttps();
  } catch (e) { console.log('[probe-svc] no https: ' + e.message); }
  if (typeof XMLHttpRequest !== 'undefined') return viaXhr();
  report(false, 'no https module and no XMLHttpRequest in service');
};
module.exports.onExit = function () { console.log('[probe-svc] exit'); };
