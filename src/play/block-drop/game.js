(function () {
  'use strict';
  var W = 460, H = 640, COLS = 10, ROWS = 20, S = 28, OX = 20, OY = 40;
  var canvas = document.getElementById('c');
  var ctx = GA.fitCanvas(canvas, W, H);
  var menu = document.getElementById('menu'), over = document.getElementById('over');
  var opts = GA.options(menu, { level: 1 });
  var SHAPES = {
    I: { c: '#3cc8e8', m: [[0, 1], [1, 1], [2, 1], [3, 1]], size: 4 },
    O: { c: '#ffd23f', m: [[1, 0], [2, 0], [1, 1], [2, 1]], size: 4 },
    T: { c: '#a46bff', m: [[1, 0], [0, 1], [1, 1], [2, 1]], size: 3 },
    S: { c: '#3ccf7e', m: [[1, 0], [2, 0], [0, 1], [1, 1]], size: 3 },
    Z: { c: '#ff5a6a', m: [[0, 0], [1, 0], [1, 1], [2, 1]], size: 3 },
    J: { c: '#4f86ff', m: [[0, 0], [0, 1], [1, 1], [2, 1]], size: 3 },
    L: { c: '#ff8a3d', m: [[2, 0], [0, 1], [1, 1], [2, 1]], size: 3 },
  };
  var state = 'menu', grid, piece, nextQ, bag = [], score, lines, level, fallT, lockT, clearing = null;
  var input = { left: false, right: false, down: false }, das = { dir: 0, t: 0 };

  function nextType() {
    if (!bag.length) { bag = Object.keys(SHAPES); for (var i = bag.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = bag[i]; bag[i] = bag[j]; bag[j] = t; } }
    return bag.pop();
  }
  function spawn() {
    var t = nextQ.shift(); nextQ.push(nextType());
    piece = { t: t, cells: SHAPES[t].m.map(function (p) { return p.slice(); }), x: 3, y: t === 'I' ? -1 : 0 };
    lockT = 0;
    if (collides(piece.cells, piece.x, piece.y)) gameOver();
  }
  function collides(cells, x, y) {
    return cells.some(function (p) {
      var cx = p[0] + x, cy = p[1] + y;
      return cx < 0 || cx >= COLS || cy >= ROWS || (cy >= 0 && grid[cy][cx]);
    });
  }
  function rotate(dir) {
    if (!piece || piece.t === 'O') return;
    var n = SHAPES[piece.t].size - 1;
    var cells = piece.cells.map(function (p) { return dir > 0 ? [n - p[1], p[0]] : [p[1], n - p[0]]; });
    var kicks = [0, -1, 1, -2, 2];
    for (var i = 0; i < kicks.length; i++) {
      for (var up = 0; up <= 1; up++) {
        if (!collides(cells, piece.x + kicks[i], piece.y - up)) { piece.cells = cells; piece.x += kicks[i]; piece.y -= up; lockT = 0; return; }
      }
    }
  }
  function shift(dx) { if (piece && !collides(piece.cells, piece.x + dx, piece.y)) { piece.x += dx; lockT = 0; } }
  function hardDrop() {
    if (!piece || clearing) return;
    var d = 0; while (!collides(piece.cells, piece.x, piece.y + d + 1)) d++;
    piece.y += d; score += d * 2; lock();
  }
  function lock() {
    piece.cells.forEach(function (p) { var y = p[1] + piece.y; if (y >= 0) grid[y][p[0] + piece.x] = SHAPES[piece.t].c; });
    if (piece.cells.some(function (p) { return p[1] + piece.y < 0; })) { gameOver(); return; }
    piece = null;
    var full = [];
    for (var y = 0; y < ROWS; y++) if (grid[y].every(Boolean)) full.push(y);
    if (full.length) { clearing = { rows: full, t: 0.22 }; }
    else spawn();
  }
  function finishClear() {
    var n = clearing.rows.length;
    clearing.rows.forEach(function (y) { grid.splice(y, 1); grid.unshift(new Array(COLS).fill(null)); });
    score += [0, 100, 300, 500, 800][n] * level;
    lines += n;
    level = Math.max(level, opts.level + Math.floor(lines / 10));
    clearing = null;
    spawn();
  }
  function gravity() { return Math.max(0.05, 0.8 * Math.pow(0.85, level - 1)); }
  function newGame() {
    grid = []; for (var y = 0; y < ROWS; y++) grid.push(new Array(COLS).fill(null));
    score = 0; lines = 0; level = opts.level; fallT = 0; bag = []; clearing = null;
    nextQ = [nextType(), nextType(), nextType()];
    spawn();
    state = 'play'; GA.hide(menu); GA.hide(over); loop.pause(false);
  }
  function gameOver() {
    state = 'over'; piece = null;
    document.getElementById('winner').textContent = 'Game over';
    document.getElementById('final').textContent = 'Score ' + score + ' · ' + lines + ' lines · level ' + level;
    GA.show(over);
  }
  // Keyboard: edge-triggered actions; held left/right auto-repeat.
  window.addEventListener('keydown', function (e) {
    if (state !== 'play' || loop.paused) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { if (!e.repeat) { shift(-1); das = { dir: -1, t: 0 }; } }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { if (!e.repeat) { shift(1); das = { dir: 1, t: 0 }; } }
    else if (e.code === 'ArrowUp' || e.code === 'KeyX' || e.code === 'KeyW') { if (!e.repeat) rotate(1); }
    else if (e.code === 'KeyZ') { if (!e.repeat) rotate(-1); }
    else if (e.code === 'Space') { if (!e.repeat) hardDrop(); }
  });
  GA.onPad(function (pad, button, dir) {
    if (state !== 'play' || !menu.hidden || !over.hidden) return;
    if (button === 'a' || button === 'x') { rotate(button === 'a' ? 1 : -1); return true; }
    if (button === 'b' || button === 'y') { hardDrop(); return true; }
    if (button === 'dir' && dir === 'up') { hardDrop(); return true; }
    if (button === 'dir' && (dir === 'left' || dir === 'right')) { shift(dir === 'left' ? -1 : 1); return true; }
  });
  function update(dt) {
    if (state !== 'play') return;
    if (clearing) { clearing.t -= dt; if (clearing.t <= 0) finishClear(); return; }
    if (!piece) return;
    var k = GA.keys, pad = GA.pads()[0];
    var held = (k.ArrowLeft || k.KeyA || input.left) ? -1 : (k.ArrowRight || k.KeyD || input.right) ? 1 : 0;
    if (held && held === das.dir) { das.t += dt; if (das.t > 0.17) { shift(held); das.t -= 0.05; } } else if (!held) das = { dir: 0, t: 0 };
    var soft = k.ArrowDown || k.KeyS || input.down || (pad && pad.y > 0.5);
    fallT += dt * (soft ? 12 : 1);
    if (fallT >= gravity()) {
      fallT = 0;
      if (!collides(piece.cells, piece.x, piece.y + 1)) { piece.y++; if (soft) score += 1; }
    }
    if (collides(piece.cells, piece.x, piece.y + 1)) { lockT += dt; if (lockT > 0.5) lock(); }
  }
  function block(x, y, color, alpha) {
    ctx.globalAlpha = alpha || 1;
    ctx.fillStyle = color; ctx.fillRect(OX + x * S + 1, OY + y * S + 1, S - 2, S - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(OX + x * S + 1, OY + y * S + 1, S - 2, 4);
    ctx.globalAlpha = 1;
  }
  function draw(paused) {
    ctx.fillStyle = '#0b0e14'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#121722'; ctx.fillRect(OX, OY, COLS * S, ROWS * S);
    ctx.strokeStyle = '#1b2231'; ctx.lineWidth = 1;
    for (var x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(OX + x * S + 0.5, OY); ctx.lineTo(OX + x * S + 0.5, OY + ROWS * S); ctx.stroke(); }
    if (grid) for (var y = 0; y < ROWS; y++) for (var gx = 0; gx < COLS; gx++) if (grid[y][gx]) block(gx, y, clearing && clearing.rows.indexOf(y) >= 0 ? '#ffffff' : grid[y][gx]);
    if (piece) {
      var d = 0; while (!collides(piece.cells, piece.x, piece.y + d + 1)) d++;
      piece.cells.forEach(function (p) { if (p[1] + piece.y + d >= 0) block(p[0] + piece.x, p[1] + piece.y + d, SHAPES[piece.t].c, 0.22); });
      piece.cells.forEach(function (p) { if (p[1] + piece.y >= 0) block(p[0] + piece.x, p[1] + piece.y, SHAPES[piece.t].c); });
    }
    var px = OX + COLS * S + 20;
    ctx.fillStyle = '#aab3c5'; ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('NEXT', px, OY + 12);
    if (nextQ) nextQ.slice(0, 3).forEach(function (t, i) {
      SHAPES[t].m.forEach(function (p) { ctx.fillStyle = SHAPES[t].c; ctx.fillRect(px + p[0] * 18, OY + 26 + i * 64 + p[1] * 18, 16, 16); });
    });
    var stats = [['SCORE', score], ['LINES', lines], ['LEVEL', level]];
    stats.forEach(function (s, i) {
      ctx.fillStyle = '#aab3c5'; ctx.font = '700 13px system-ui, sans-serif'; ctx.fillText(s[0], px, OY + 250 + i * 60);
      ctx.fillStyle = '#fff'; ctx.font = '800 24px system-ui, sans-serif'; ctx.fillText(s[1] === undefined ? '0' : String(s[1]), px, OY + 278 + i * 60);
    });
    if (paused && state === 'play') GA.drawPaused(ctx, W, H);
  }
  // Touch buttons: tap to act, hold left/right/down to repeat.
  var touch = document.getElementById('touch');
  if (window.matchMedia('(pointer: coarse)').matches) touch.hidden = false;
  touch.addEventListener('pointerdown', function (e) {
    var b = e.target.closest('[data-k]'); if (!b || state !== 'play') return;
    e.preventDefault(); b.classList.add('on');
    var k = b.getAttribute('data-k');
    if (k === 'rotate') rotate(1); else if (k === 'drop') hardDrop();
    else { input[k] = true; if (k !== 'down') { shift(k === 'left' ? -1 : 1); das = { dir: k === 'left' ? -1 : 1, t: 0 }; } }
  });
  function release(e) { var b = e.target.closest('[data-k]'); if (!b) return; b.classList.remove('on'); var k = b.getAttribute('data-k'); if (k in input) input[k] = false; }
  touch.addEventListener('pointerup', release);
  touch.addEventListener('pointercancel', release);
  touch.addEventListener('pointerleave', release, true);

  GA.debug = function () { return { state: state, score: score, lines: lines, filled: grid ? grid.reduce(function (n, r) { return n + r.filter(Boolean).length; }, 0) : 0 }; };
  var loop = GA.loop(update, draw);
  GA.autoPause(loop, function () { return state === 'play'; });
  document.getElementById('start').addEventListener('click', newGame);
  document.getElementById('again').addEventListener('click', newGame);
  document.getElementById('tomenu').addEventListener('click', function () { GA.hide(over); state = 'menu'; GA.show(menu); });
  loop.start();
})();
