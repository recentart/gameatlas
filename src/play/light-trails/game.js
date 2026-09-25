(function () {
  'use strict';
  var CELL = 10, GW = 80, GH = 45, W = GW * CELL, H = GH * CELL, TICK = 1 / 14, WIN = 5;
  var canvas = document.getElementById('c');
  var ctx = GA.fitCanvas(canvas, W, H);
  var menu = document.getElementById('menu'), over = document.getElementById('over'), hud = document.getElementById('hud');
  var opts = GA.options(menu, { humans: 1, total: 4 });
  GA.onOption = function (n, v) {
    if (n === 'humans' && opts.total < v) { opts.total = Math.max(v, 2); syncTotal(); }
    if (n === 'total' && opts.total < opts.humans) { opts.humans = opts.total; syncHumans(); }
  };
  function syncGroup(name, val) { menu.querySelectorAll('[data-opt="' + name + '"] button').forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-value')) === val)); }); }
  function syncTotal() { syncGroup('total', opts.total); }
  function syncHumans() { syncGroup('humans', opts.humans); }

  var KEYS = [
    { up: 'KeyW', left: 'KeyA', down: 'KeyS', right: 'KeyD' },
    { up: 'ArrowUp', left: 'ArrowLeft', down: 'ArrowDown', right: 'ArrowRight' },
    { up: 'KeyI', left: 'KeyJ', down: 'KeyK', right: 'KeyL' },
    { up: 'Numpad8', left: 'Numpad4', down: 'Numpad5', right: 'Numpad6' },
  ];
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var START = [[10, 10, 'right'], [GW - 11, GH - 11, 'left'], [GW - 11, 10, 'down'], [10, GH - 11, 'up']];
  var state = 'menu', riders = [], board, acc = 0, roundPause = 0, roundMsg = '';

  function newMatch() {
    riders = [];
    for (var i = 0; i < opts.total; i++) riders.push({ id: i, human: i < opts.humans, score: 0 });
    GA.hide(menu); GA.hide(over);
    newRound();
    state = 'play';
    loop.pause(false);
  }
  function newRound() {
    board = new Uint8Array(GW * GH);
    riders.forEach(function (r, i) {
      var s = START[i];
      r.x = s[0]; r.y = s[1]; r.dir = s[2]; r.next = s[2]; r.alive = true; r.queue = [];
      board[r.y * GW + r.x] = i + 1;
    });
    roundPause = 1.2; roundMsg = 'Get ready';
    updateHud();
  }
  function updateHud() {
    hud.innerHTML = riders.map(function (r) {
      return '<span class="tag p' + (r.id + 1) + '">' + GA.NAMES[r.id] + (r.human ? '' : ' (CPU)') + ' ' + r.score + '</span>';
    }).join('');
  }
  function opposite(a, b) { return DIRS[a][0] === -DIRS[b][0] && DIRS[a][1] === -DIRS[b][1]; }
  function queueTurn(r, d) {
    var last = r.queue.length ? r.queue[r.queue.length - 1] : r.dir;
    if (d !== last && !opposite(d, last) && r.queue.length < 2) r.queue.push(d);
  }
  function free(x, y) { return x >= 0 && y >= 0 && x < GW && y < GH && board[y * GW + x] === 0; }
  function space(x, y, limit) {
    // Flood-fill size (capped) of the free area reachable from x,y.
    if (!free(x, y)) return 0;
    var seen = new Set([y * GW + x]), stack = [[x, y]], n = 0;
    while (stack.length && n < limit) {
      var p = stack.pop(); n++;
      for (var k in DIRS) {
        var nx = p[0] + DIRS[k][0], ny = p[1] + DIRS[k][1], key = ny * GW + nx;
        if (free(nx, ny) && !seen.has(key)) { seen.add(key); stack.push([nx, ny]); }
      }
    }
    return n;
  }
  function botThink(r) {
    var best = r.dir, bestScore = -1;
    for (var d in DIRS) {
      if (opposite(d, r.dir)) continue;
      var nx = r.x + DIRS[d][0], ny = r.y + DIRS[d][1];
      var s = space(nx, ny, 400);
      // Look one more step ahead in the same direction to avoid dead ends.
      if (s > 0 && free(nx + DIRS[d][0], ny + DIRS[d][1])) s += 20;
      s += d === r.dir ? 8 : 0;
      s += Math.random() * 6;
      if (s > bestScore) { bestScore = s; best = d; }
    }
    r.next = best;
  }
  var lastPad = [];
  function readInput() {
    var pads = GA.pads();
    riders.forEach(function (r, i) {
      if (!r.human || !r.alive) return;
      var k = KEYS[i];
      for (var d in k) if (GA.keys[k[d]] && !r['held_' + d]) { queueTurn(r, d); }
      for (var d2 in k) r['held_' + d2] = !!GA.keys[k[d2]];
      if (opts.humans === 1 && i === 0) {
        var k2 = KEYS[1];
        for (var d3 in k2) { if (GA.keys[k2[d3]] && !r['alt_' + d3]) queueTurn(r, d3); r['alt_' + d3] = !!GA.keys[k2[d3]]; }
      }
      var p = pads[i];
      if (p) {
        var pd = Math.abs(p.x) > Math.abs(p.y) ? (p.x < -0.5 ? 'left' : p.x > 0.5 ? 'right' : null) : (p.y < -0.5 ? 'up' : p.y > 0.5 ? 'down' : null);
        if (pd && pd !== lastPad[i]) queueTurn(r, pd);
        lastPad[i] = pd;
      }
    });
  }
  function step() {
    riders.forEach(function (r) {
      if (!r.alive) return;
      if (r.human) { if (r.queue.length) r.dir = r.queue.shift(); }
      else { botThink(r); r.dir = r.next; }
      r.nx = r.x + DIRS[r.dir][0]; r.ny = r.y + DIRS[r.dir][1];
    });
    var alive = riders.filter(function (r) { return r.alive; });
    alive.forEach(function (r) {
      var crash = !free(r.nx, r.ny);
      alive.forEach(function (o) { if (o !== r && o.nx === r.nx && o.ny === r.ny) crash = true; });
      r.crash = crash;
    });
    alive.forEach(function (r) {
      if (r.crash) { r.alive = false; return; }
      r.x = r.nx; r.y = r.ny; board[r.y * GW + r.x] = r.id + 1;
    });
    var left = riders.filter(function (r) { return r.alive; });
    if (left.length <= 1) endRound(left[0]);
  }
  function endRound(winner) {
    if (winner) { winner.score++; roundMsg = GA.NAMES[winner.id] + ' wins the round'; }
    else roundMsg = 'Draw — nobody scores';
    updateHud();
    var champ = riders.filter(function (r) { return r.score >= WIN; })[0];
    if (champ) {
      state = 'over';
      document.getElementById('winner').textContent = GA.NAMES[champ.id] + (champ.human ? '' : ' (computer)') + ' wins the match!';
      document.getElementById('final').textContent = riders.map(function (r) { return GA.NAMES[r.id] + ' ' + r.score; }).join(' · ');
      GA.show(over);
      return;
    }
    roundPause = 1.6;
    state = 'between';
  }
  function update(dt) {
    if (state === 'menu' || state === 'over') return;
    if (roundPause > 0) {
      roundPause -= dt;
      if (roundPause <= 0) { if (state === 'between') { newRound(); state = 'play'; } roundMsg = ''; }
      return;
    }
    readInput();
    acc += dt;
    while (acc >= TICK && state === 'play') { acc -= TICK; step(); }
  }
  function draw(paused) {
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#151b27';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0; x <= GW; x += 5) { ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, H); }
    for (var y = 0; y <= GH; y += 5) { ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(W, y * CELL + 0.5); }
    ctx.stroke();
    if (board) {
      for (var i = 0; i < board.length; i++) {
        var v = board[i];
        if (!v) continue;
        ctx.fillStyle = GA.COLORS[v - 1];
        ctx.globalAlpha = riders[v - 1] && riders[v - 1].alive ? 0.85 : 0.35;
        ctx.fillRect((i % GW) * CELL + 1, Math.floor(i / GW) * CELL + 1, CELL - 2, CELL - 2);
      }
      ctx.globalAlpha = 1;
      riders.forEach(function (r) {
        if (!r.alive) return;
        ctx.fillStyle = '#fff';
        ctx.fillRect(r.x * CELL + 2, r.y * CELL + 2, CELL - 4, CELL - 4);
      });
    }
    if (roundMsg) {
      ctx.fillStyle = 'rgba(8,10,16,0.55)';
      ctx.fillRect(0, H / 2 - 40, W, 70);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = '800 30px system-ui, sans-serif';
      ctx.fillText(roundMsg, W / 2, H / 2 + 6);
    }
    if (paused && state !== 'menu' && state !== 'over') GA.drawPaused(ctx, W, H);
  }
  // Swipe steering for player 1.
  var sx = 0, sy = 0;
  canvas.addEventListener('touchstart', function (e) { e.preventDefault(); sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    var dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24 || !riders[0]) return;
    queueTurn(riders[0], Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: false });

  var loop = GA.loop(update, draw);
  GA.autoPause(loop, function () { return state === 'play' || state === 'between'; });
  document.getElementById('start').addEventListener('click', newMatch);
  document.getElementById('again').addEventListener('click', newMatch);
  document.getElementById('tomenu').addEventListener('click', function () { GA.hide(over); state = 'menu'; GA.show(menu); });
  loop.start();
})();
