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
    GA.pauseToggle = function () { if (isActive()) loop.pause(); };
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
    ctx.fillText('Press P, Start or click to resume', W / 2, H / 2 + 26);
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

  /* ---- Spatial focus: move to the nearest focusable element in a direction ---- */
  var FOCUSABLE = 'button:not([disabled]), a[href], input, select, [tabindex]:not([tabindex="-1"]), [data-focusable]';
  GA.moveFocus = function (dir, root) {
    root = root || document;
    var items = Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE + ', [role="button"], [role="gridcell"]'), function (el) {
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.closest('[hidden]') && el.getAttribute('aria-disabled') !== 'true';
    });
    if (!items.length) return false;
    var cur = document.activeElement;
    if (!cur || items.indexOf(cur) < 0) { items[0].focus(); return true; }
    var a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    var best = null, bestScore = Infinity;
    items.forEach(function (el) {
      if (el === cur) return;
      var b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      var dx = bx - ax, dy = by - ay;
      var main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      var cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (main <= 2) return;
      var score = main + cross * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) { best.focus(); if (best.scrollIntoView) best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return true; }
    return false;
  };

  function activate(el) {
    if (!el || el === document.body) return;
    if (typeof el.click === 'function') el.click();
    else el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
  function openOverlay() {
    var list = document.querySelectorAll('.overlay');
    for (var i = 0; i < list.length; i++) if (!list[i].hidden) return list[i];
    return null;
  }

  /* ---- Controller layer ------------------------------------------------------
     Every game gets: D-pad / left stick to move between menu buttons and board
     cells, A to select, B to go back, Start to pause, Select to hand control back
     to the GameAtlas page. Real-time games still read GA.pads() for movement.
     GA.padMode: 'canvas' (default; menus only) or 'dom' (board games: the D-pad
     sends arrow keys to the focused cell, falling back to spatial focus). */
  GA.padMode = 'canvas';
  GA.padHandlers = [];
  GA.onPad = function (fn) { GA.padHandlers.push(fn); };
  var prev = [], held = {};
  function dirOf(p) {
    if (p.y < -0.5) return 'up';
    if (p.y > 0.5) return 'down';
    if (p.x < -0.5) return 'left';
    if (p.x > 0.5) return 'right';
    return null;
  }
  function rawPads() {
    var list = [];
    try { list = (navigator.getGamepads && navigator.getGamepads()) || []; } catch (e) { list = []; }
    return list;
  }
  function pollPads(t) {
    requestAnimationFrame(pollPads);
    var list = rawPads(), idx = 0;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.connected) continue;
      var btn = function (n) { return !!(p.buttons[n] && p.buttons[n].pressed); };
      var ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      var state = {
        dir: dirOf({ x: Math.abs(ax) > 0.5 ? ax : (btn(14) ? -1 : btn(15) ? 1 : 0), y: Math.abs(ay) > 0.5 ? ay : (btn(12) ? -1 : btn(13) ? 1 : 0) }),
        a: btn(0), b: btn(1), x: btn(2), y: btn(3), start: btn(9), select: btn(8),
      };
      var old = prev[idx] || {};
      // Direction with auto-repeat while held (menus and boards).
      var key = idx + ':' + state.dir;
      if (state.dir && state.dir !== old.dir) { held[idx] = { dir: state.dir, next: t + 380 }; fire(idx, 'dir', state.dir); }
      else if (state.dir && held[idx] && t >= held[idx].next) { held[idx].next = t + 130; fire(idx, 'dir', state.dir); }
      ['a', 'b', 'x', 'y', 'start', 'select'].forEach(function (k) { if (state[k] && !old[k]) fire(idx, k); });
      void key;
      prev[idx] = state;
      idx++;
    }
  }
  function fire(pad, button, dir) {
    GA.lastInput = 'pad';
    document.documentElement.classList.add('pad-active');
    for (var i = 0; i < GA.padHandlers.length; i++) if (GA.padHandlers[i](pad, button, dir) === true) return;
    var overlay = openOverlay();
    if (button === 'select') { try { window.parent.postMessage({ type: 'ga:leave-game' }, location.origin); } catch (e) { /* standalone */ } return; }
    if (overlay) {
      if (button === 'dir') GA.moveFocus(dir, overlay);
      else if (button === 'a') activate(overlay.contains(document.activeElement) ? document.activeElement : overlay.querySelector('.btn-primary, button'));
      return;
    }
    if (button === 'start') { if (GA.pauseToggle) GA.pauseToggle(); else { var m = document.querySelector('#restart'); if (m) activate(m); } return; }
    if (GA.padMode === 'dom') {
      if (button === 'dir') {
        var target = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
        var code = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[dir];
        var ev = new KeyboardEvent('keydown', { key: code, code: code, bubbles: true, cancelable: true });
        if (!target || target.dispatchEvent(ev)) GA.moveFocus(dir, document.querySelector('.game') || document);
      } else if (button === 'a') activate(document.activeElement);
    }
  }
  window.addEventListener('mousemove', function () { document.documentElement.classList.remove('pad-active'); });
  window.addEventListener('gamepadconnected', function () { document.documentElement.classList.add('pad-active'); });
  requestAnimationFrame(pollPads);

  /* Portrait phones: suggest rotating for canvas games (shown by CSS only when it applies). */
  GA.rotateHint = function () {
    document.querySelectorAll('.panel').forEach(function (panel) {
      if (panel.querySelector('.rotate-hint')) return;
      var p = document.createElement('p');
      p.className = 'rotate-hint';
      p.textContent = 'Tip: turn your phone sideways or use Fullscreen for a bigger view.';
      panel.insertBefore(p, panel.querySelector('.actions'));
    });
  };

  GA.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  GA.rand = function (a, b) { return a + Math.random() * (b - a); };

  // Keep Start disabled until the game's own script has loaded (slow connections).
  var startBtn = document.getElementById('start');
  if (startBtn) {
    startBtn.disabled = true;
    window.addEventListener('load', function () { startBtn.disabled = false; if (!document.getElementById('menu').hidden) startBtn.focus(); });
  }

  window.GA = GA;
})();
