/* Cover backdrop. Once per song the cover is blurred into a small canvas (two layers drawn
 * and blurred at 160×90); CSS scales it to the screen and drifts it slowly with transform
 * only, so no filter ever runs per frame. Songs cross-fade between two canvases.
 *
 * TV note: BitChord PC warps the cover in a shader (shader.rs). On a Tizen 6.5 TV the
 * WebGL version of that looked poor, so this is the Apple-Music-style soft blur instead.
 * Also samples the cover's accent colour. */
(function (root) {
  'use strict';
  var BC = root.BC;
  var W = 160, H = 90;
  var layers = [], front = 0, currentUrl = null, scrim = null;

  /** Two copies of the cover, one turned half round, blurred and saturated: a soft colour field. */
  function paint(canvas, img) {
    var x = canvas.getContext('2d');
    x.clearRect(0, 0, W, H);
    x.filter = 'blur(10px) saturate(1.6)';
    x.drawImage(img, -W * 0.15, -H * 0.9, W * 1.3, W * 1.3);
    x.globalAlpha = 0.65;
    x.save();
    x.translate(W * 0.72, H * 0.6);
    x.rotate(Math.PI);
    x.drawImage(img, -W * 0.5, -W * 0.5, W, W);
    x.restore();
    x.globalAlpha = 1;
    x.filter = 'none';
  }

  function accentOf(img) {
    try {
      var c = document.createElement('canvas');
      c.width = c.height = 16;
      var x = c.getContext('2d');
      x.drawImage(img, 0, 0, 16, 16);
      var px = x.getImageData(0, 0, 16, 16).data;
      var best = null, bestS = -1;
      for (var i = 0; i < px.length; i += 4) {
        var r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
        if (l < 0.12 || l > 0.92) continue;
        var s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
        if (s > bestS) { bestS = s; best = [r, g, b]; }
      }
      if (!best || bestS < 0.18) return null;
      // Lift to at least 0.62 lightness so it reads on the dark backdrop.
      var L = (Math.max.apply(null, best) + Math.min.apply(null, best)) / 2;
      var k = L < 0.62 ? 0.62 - L : 0;
      return 'rgb(' + best.map(function (v) { return Math.round(Math.min(1, v + k) * 255); }).join(',') + ')';
    } catch (e) { return null; } // a cover without CORS headers taints the canvas
  }

  function setCover(url, plain) {
    if (!url || (url === currentUrl && !plain)) return;
    currentUrl = url;
    var img = new Image();
    // CORS copy first (the accent needs readable pixels); if it fails, a plain copy still paints.
    if (!plain) img.crossOrigin = 'anonymous';
    img.onerror = function () { if (!plain && url === currentUrl) setCover(url, true); };
    img.onload = function () {
      if (url !== currentUrl) return;
      BC.emit('accent', plain ? null : accentOf(img));
      var next = layers[1 - front];
      paint(next, img);
      next.classList.add('on');
      layers[front].classList.remove('on');
      front = 1 - front;
    };
    img.src = BC.sized(url, 840); // the Now Playing cover's own URL: a cache hit, not a new request
  }

  BC.backdrop = {
    init: function (host) {
      for (var i = 0; i < 2; i++) {
        var c = BC.el('canvas', 'bg-layer');
        c.width = W; c.height = H;
        host.appendChild(c);
        layers.push(c);
      }
      scrim = BC.el('div', 'bg-scrim');
      host.appendChild(scrim);
      BC.backdrop.motion();
    },
    setCover: setCover,
    /** Now Playing shows the cover brighter; pages sit on a darker scrim so text stays legible. */
    mode: function (np) { scrim.classList.toggle('bright', !!np); },
    motion: function () {
      document.body.classList.toggle('bg-still', BC.reducedMotion() || !BC.settings.get('animatedBg'));
    }
  };
  BC.on('settings', function (k) { if (k === 'animatedBg' || k === 'reduceMotion') BC.backdrop.motion(); });
})(typeof window !== 'undefined' ? window : global);
