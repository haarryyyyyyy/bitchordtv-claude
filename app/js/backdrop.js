/* Cover-driven backdrop: BitChord PC's warp shader (shader.rs) in WebGL, rendered at 192×108
 * from a 24 px texture and scaled to the screen by CSS. The tiny texture and the bilinear
 * upscale are the blur, so no CSS blur filter
 * ever runs on a moving surface. 30 fps, paused when hidden. Falls back to a still,
 * saturated 2D-canvas cover when WebGL is unavailable. Also samples the cover's accent. */
(function (root) {
  'use strict';
  var BC = root.BC;
  var W = 192, H = 108;
  // shader.rs FRAGMENT, as GLSL ES 1.0.
  var FRAG = [
    'precision mediump float;',
    'uniform sampler2D u_a; uniform sampler2D u_b;',
    'uniform float u_blend; uniform float u_time; uniform float u_intensity; uniform float u_scale;',
    'uniform float u_saturation; uniform float u_dim; uniform vec2 u_resolution;',
    'varying vec2 v_uv;',
    'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}',
    'float snoise(vec2 v){const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);',
    'vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);',
    'vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod289(i);',
    'vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));',
    'vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);m=m*m;m=m*m;',
    'vec3 x=2.0*fract(p*C.www)-1.0;vec3 h=abs(x)-0.5;vec3 ox=floor(x+0.5);vec3 a0=x-ox;',
    'm*=1.79284291400159-0.85373472095314*(a0*a0+h*h);vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;',
    'return 130.0*dot(m,g);}',
    'void main(){',
    ' vec2 uv=(v_uv-0.5)/u_scale+0.5; float t=u_time*0.05;',
    ' float cw=1.0-smoothstep(0.0,0.7,length(uv-0.5));',
    ' float n1=snoise(uv*0.35+vec2(t,t*0.7)); float n2=snoise(uv*0.35+vec2(-t*0.8,t*0.5)+vec2(50.0,50.0));',
    ' float n3=snoise(uv*0.9+vec2(t*1.2,-t)+vec2(100.0,0.0)); float n4=snoise(uv*0.9+vec2(-t,t*1.1)+vec2(0.0,100.0));',
    ' vec2 warp=vec2(n1*0.65+n3*0.35,n2*0.65+n4*0.35)*cw; vec2 w=clamp(uv+warp*u_intensity,0.0,1.0);',
    ' vec3 color=mix(texture2D(u_b,w).rgb,texture2D(u_a,w).rgb,u_blend);',
    ' vec2 c=v_uv-0.5; color*=1.0-dot(c,c)*0.3;',
    ' float gray=dot(color,vec3(0.299,0.587,0.114)); color=mix(vec3(gray),color,u_saturation); color*=u_dim;',
    ' gl_FragColor=vec4(color,1.0);}'
  ].join('\n');
  var VERT = 'attribute vec2 p; varying vec2 v_uv; void main(){ v_uv=vec2(p.x*0.5+0.5, 0.5-p.y*0.5); gl_Position=vec4(p,0.0,1.0); }';

  // preset.rs defaults: intensity 1.0, saturation 1.5, scale 1.2, speed 1.0, np_dim 0.85. page_dim is
  // 0.5 on PC; 0.3 here keeps page text legible from across a room (DESIGN_SPEC, Backdrop).
  var P = { intensity: 1.0, saturation: 1.5, scale: 1.2, speed: 1.0, npDim: 0.85, pageDim: 0.3 };

  var canvas, gl, prog, texA, texB, uni = {};
  var blend = 1, blendFrom = 0, blendStart = 0;
  var dim = P.pageDim, dimTarget = P.pageDim, dimFrom = P.pageDim, dimStart = 0;
  var running = false, lastFrame = 0, t0 = Date.now(), hasCover = false, frozen = false;
  var fallback = null;

  function makeTex() {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([12, 10, 14, 255]));
    return t;
  }

  function initGl() {
    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' }) || canvas.getContext('experimental-webgl');
    } catch (e) { gl = null; }
    if (!gl) return false;
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    } catch (e) { gl = null; return false; }
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['u_a', 'u_b', 'u_blend', 'u_time', 'u_intensity', 'u_scale', 'u_saturation', 'u_dim', 'u_resolution'].forEach(function (n) { uni[n] = gl.getUniformLocation(prog, n); });
    texA = makeTex(); texB = makeTex();
    gl.uniform1i(uni.u_a, 0); gl.uniform1i(uni.u_b, 1);
    gl.uniform1f(uni.u_intensity, P.intensity);
    gl.uniform1f(uni.u_scale, P.scale);
    gl.uniform1f(uni.u_saturation, P.saturation);
    gl.uniform2f(uni.u_resolution, W, H);
    gl.viewport(0, 0, W, H);
    return true;
  }

  function easeOut(t) { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); }

  function draw(now) {
    var b = blendStart ? easeOut((now - blendStart) / 900) : 1;
    blend = blendFrom + (1 - blendFrom) * b;
    var d = dimStart ? easeOut((now - dimStart) / 420) : 1;
    dim = dimFrom + (dimTarget - dimFrom) * d;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texB);
    gl.uniform1f(uni.u_blend, blend);
    gl.uniform1f(uni.u_time, frozen ? 7 : (Date.now() - t0) / 1000 * P.speed);
    gl.uniform1f(uni.u_dim, hasCover ? dim : 0.0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return b < 1 || d < 1;
  }

  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (now - lastFrame < 33) return; // 30 fps is plenty for a slow warp
    lastFrame = now;
    var moving = draw(now);
    if (frozen && !moving) running = false; // a still frame needs no loop
  }
  function start() {
    if (running || !gl) return;
    running = true;
    lastFrame = 0;
    requestAnimationFrame(loop);
  }
  function stop() { running = false; }

  /** Downscale on a small canvas before upload: cheaper than a 544 px texture. */
  function small(img, size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var x = c.getContext('2d');
    x.drawImage(img, 0, 0, size, size);
    return c;
  }

  function accentOf(img) {
    try {
      var c = small(img, 16);
      var px = c.getContext('2d').getImageData(0, 0, 16, 16).data;
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
      var k = L < 0.62 ? (0.62 - L) : 0;
      return 'rgb(' + best.map(function (v) { return Math.round(Math.min(1, v + k) * 255); }).join(',') + ')';
    } catch (e) { return null; } // a cover without CORS headers taints the canvas
  }

  var currentUrl = null;
  function setCover(url) {
    if (!url || url === currentUrl) return;
    currentUrl = url;
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      if (url !== currentUrl) return;
      BC.emit('accent', accentOf(img));
      if (gl) {
        var tmp = texB; texB = texA; texA = tmp;   // old cover becomes B, new loads into A
        gl.bindTexture(gl.TEXTURE_2D, texA);
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, small(img, 24)); } catch (e) { return; }
        blendFrom = hasCover ? 0 : 1;
        blendStart = performance.now();
        hasCover = true;
        start();
      } else if (fallback) {
        var x = fallback.getContext('2d');
        x.filter = 'saturate(1.5)';
        x.drawImage(img, 0, 0, fallback.width, fallback.height);
        fallback.classList.add('on');
      }
    };
    img.src = BC.sized(url, 226);
  }

  BC.backdrop = {
    init: function (host) {
      canvas = BC.el('canvas', 'bg-canvas');
      canvas.width = W; canvas.height = H;
      canvas.setAttribute('aria-hidden', 'true');
      host.appendChild(canvas);
      if (!initGl()) {
        canvas.remove();
        fallback = BC.el('canvas', 'bg-canvas bg-still');
        fallback.width = 48; fallback.height = 27;
        host.appendChild(fallback);
      }
      BC.backdrop.motion();
      document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (hasCover) start(); });
    },
    setCover: setCover,
    /** Now Playing shows the cover brighter (np_dim); pages sit on a darker one (page_dim). */
    mode: function (np) {
      var target = np ? P.npDim : P.pageDim;
      if (target === dimTarget) return;
      dimFrom = dim; dimTarget = target; dimStart = performance.now();
      start();
    },
    motion: function () {
      frozen = BC.reducedMotion() || !BC.settings.get('animatedBg');
      if (hasCover) start();
    },
    webgl: function () { return !!gl; }
  };
  BC.on('settings', function (k) { if (k === 'animatedBg' || k === 'reduceMotion') BC.backdrop.motion(); });
})(typeof window !== 'undefined' ? window : global);
