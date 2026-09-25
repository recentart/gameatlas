/* Shared helpers for GameAtlas Originals. Classic script (no modules) because the
   games run in a sandboxed iframe with an opaque origin. Exposes window.GA. */
(function () {
  'use strict';
  var GA = {};
  GA.COLORS = ['#4f86ff', '#ff8a3d', '#37c98a', '#f45fae'];
  GA.NAMES = ['Blue', 'Orange', 'Green', 'Pink'];

  /* Fit a canvas with a fixed logical size into the window (letterboxed, HiDPI). */
  GA.fitCanvas = function (canvas, W, H) {
    var ctx = canvas.getContext('2d');
    function resize() {
      var vw = window.innerWidth, vh = window.innerHeight;
      var scale = Math.min(vw / W, vh / H);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = Math.floor(W * scale) + 'px';
      canvas.style.height = Math.floor(H * scale) + 'px';
      canvas.width = Math.floor(W * scale * dpr);
      canvas.height = Math.floor(H * scale * dpr);
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      GA.viewScale = scale;
    }
    window.addEventListener('resize', resize);
    resize();
    return ctx;
  };

  /* Convert a pointer event to logical canvas coordinates. */
  GA.toLogical = function (canvas, W, H, clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width * W, y: (clientY - r.top) / r.height * H };
  };

  /* Keyboard state; game keys never scroll the parent page. */
  GA.keys = {};
  var GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
  window.addEventListener('keydown', function (e) {
    GA.keys[e.code] = true;
    if (GAME_KEYS.indexOf(e.code) >= 0 && !(e.target && e.target.tagName === 'BUTTON' && e.code === 'Space')) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { GA.keys[e.code] = false; });
  window.addEventListener('blur', function () { GA.keys = {}; });

  /* Connected gamepads, in index order, as simple objects. */
  GA.pads = function () {
    var list = [];
    // getGamepads() throws where the gamepad permission is blocked (e.g. some embeds);
    // a game must keep running with keyboard and touch in that case.
    try { list = (navigator.getGamepads && navigator.getGamepads()) || []; } catch (e) { list = []; }
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.connected) continue;
      var b = function (n) { return !!(p.buttons[n] && p.buttons[n].pressed); };
      var ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      out.push({
        x: Math.abs(ax) > 0.25 ? ax : (b(14) ? -1 : b(15) ? 1 : 0),
        y: Math.abs(ay) > 0.25 ? ay : (b(12) ? -1 : b(13) ? 1 : 0),
        a: b(0) || b(7), b: b(1) || b(6), start: b(9),
      });
    }
    return out;
  };

  /* Fixed-timestep-ish loop with pause. */
  GA.updates = 0;
  GA.loop = function (update, draw) {
    var last = 0, running = false, paused = false, raf = 0;
    function frame(t) {
      raf = requestAnimationFrame(frame);
      var dt = last ? Math.min((t - last) / 1000, 1 / 20) : 0;
      last = t;
      if (!paused) { update(dt); GA.updates++; }
      draw(paused);
    }
    return {
      start: function () { if (!running) { running = true; last = 0; raf = requestAnimationFrame(frame); } },
      stop: function () { running = false; cancelAnimationFrame(raf); },
      pause: function (v) { paused = v === undefined ? !paused : v; last = 0; return paused; },
      get paused() { return paused; },
    };
  };

  /* Pause when the tab or iframe loses focus; P toggles. */
  GA.autoPause = function (loop, isActive) {
    function onHide() { if (isActive()) loop.pause(true); }
    document.addEventListener('visibilitychange', function () { if (document.hidden) onHide(); });
    window.addEventListener('blur', onHide);
    window.addEventListener('keydown', function (e) {
      if (e.code === 'KeyP' && isActive()) { e.preventDefault(); loop.pause(); }
    });
    window.addEventListener('pointerdown', function () { if (isActive() && loop.paused) loop.pause(false); });
  };

  GA.drawPaused = function (ctx, W, H) {
    ctx.fillStyle = 'rgba(8,10,16,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '800 36px system-ui, sans-serif';
    ctx.fillText('Paused', W / 2, H / 2 - 6);
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.fillText('Press P or click to resume', W / 2, H / 2 + 26);
  };

  /* Option buttons: <div class="options" data-opt="name"><button data-value=..> */
  GA.options = function (root, defaults) {
    var values = Object.assign({}, defaults);
    root.querySelectorAll('[data-opt]').forEach(function (group) {
      var name = group.getAttribute('data-opt');
      var buttons = group.querySelectorAll('button');
      function sync() {
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-value') === String(values[name]))); });
      }
      buttons.forEach(function (b) {
        b.type = 'button';
        b.classList.add('opt');
        b.addEventListener('click', function () {
          var v = b.getAttribute('data-value');
          values[name] = isNaN(Number(v)) ? v : Number(v);
          sync();
          if (GA.onOption) GA.onOption(name, values[name]);
        });
      });
      sync();
    });
    return values;
  };

  GA.show = function (el) { el.hidden = false; var f = el.querySelector('[autofocus], .btn-primary, button'); if (f) f.focus(); };
  GA.hide = function (el) { el.hidden = true; window.focus(); };

  GA.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  GA.rand = function (a, b) { return a + Math.random() * (b - a); };

  window.GA = GA;
})();
