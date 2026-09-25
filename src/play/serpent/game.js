(function () {
  'use strict';
  var C = 25, GW = 32, GH = 18, W = GW * C, H = GH * C, WIN = 3;
  var canvas = document.getElementById('c');
  var ctx = GA.fitCanvas(canvas, W, H);
  var menu = document.getElementById('menu'), over = document.getElementById('over'), hud = document.getElementById('hud');
  var opts = GA.options(menu, { mode: 'solo', speed: 10 });
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var KEYS = [
    { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' },
    { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' },
  ];
  var state = 'menu', snakes = [], fruit = null, acc = 0, rate = 10, best = 0, roundMsg = '', roundPause = 0;

  function opposite(a, b) { return DIRS[a][0] === -DIRS[b][0] && DIRS[a][1] === -DIRS[b][1]; }
  function newMatch() {
    snakes = [];
    var n = opts.mode === 'versus' ? 2 : 1;
    for (var i = 0; i < n; i++) snakes.push({ id: i, score: 0, wins: 0 });
    GA.hide(menu); GA.hide(over);
    newRound();
    state = 'play';
    loop.pause(false);
  }
  function newRound() {
    rate = opts.speed;
    snakes.forEach(function (s, i) {
      var y = snakes.length === 1 ? 9 : (i === 0 ? 5 : 12);
      var x = i === 0 ? 6 : GW - 7, dir = i === 0 ? 'right' : 'left';
      s.body = [[x, y], [x - DIRS[dir][0], y], [x - 2 * DIRS[dir][0], y]];
      s.dir = dir; s.queue = []; s.alive = true; s.grow = 0; s.score = 0;
    });
    placeFruit();
    roundPause = 1; roundMsg = 'Ready';
    updateHud();
  }
  function occupied(x, y) { return snakes.some(function (s) { return s.body.some(function (p) { return p[0] === x && p[1] === y; }); }); }
  function placeFruit() {
    var free = [];
    for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) if (!occupied(x, y)) free.push([x, y]);
    fruit = free[Math.floor(Math.random() * free.length)];
  }
  function queue(s, d) {
    if (!s || !s.alive) return;
    var last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    if (d !== last && !opposite(d, last) && s.queue.length < 3) s.queue.push(d);
  }
  function updateHud() {
    hud.innerHTML = snakes.map(function (s) {
      return '<span class="tag p' + (s.id + 1) + '">' + (snakes.length === 1 ? 'Length ' + s.body.length + ' · Best ' + best : GA.NAMES[s.id] + ' ' + s.wins) + '</span>';
    }).join('');
  }
  function step() {
    snakes.forEach(function (s) { if (s.alive && s.queue.length) s.dir = s.queue.shift(); });
    var heads = snakes.map(function (s) { var h = s.body[0]; return [h[0] + DIRS[s.dir][0], h[1] + DIRS[s.dir][1]]; });
    snakes.forEach(function (s, i) {
      if (!s.alive) return;
      var h = heads[i];
      var hit = h[0] < 0 || h[1] < 0 || h[0] >= GW || h[1] >= GH;
      snakes.forEach(function (o) {
        var body = o.body.slice(0, o.grow > 0 ? o.body.length : o.body.length - 1);
        if (body.some(function (p) { return p[0] === h[0] && p[1] === h[1]; })) hit = true;
      });
      heads.forEach(function (o, j) { if (j !== i && snakes[j].alive && o[0] === h[0] && o[1] === h[1]) hit = true; });
      s.dead = hit;
    });
    snakes.forEach(function (s, i) {
      if (!s.alive) return;
      if (s.dead) { s.alive = false; return; }
      s.body.unshift(heads[i]);
      if (fruit && heads[i][0] === fruit[0] && heads[i][1] === fruit[1]) { s.grow += 2; placeFruit(); if (snakes.length === 1) rate = Math.min(rate + 0.35, 22); }
      if (s.grow > 0) s.grow--; else s.body.pop();
    });
    if (snakes.length === 1) {
      best = Math.max(best, snakes[0].body.length);
      updateHud();
      if (!snakes[0].alive) endGame('Length ' + snakes[0].body.length, 'Best this session: ' + best);
    } else {
      var alive = snakes.filter(function (s) { return s.alive; });
      if (alive.length <= 1) {
        if (alive[0]) alive[0].wins++;
        updateHud();
        var champ = snakes.filter(function (s) { return s.wins >= WIN; })[0];
        if (champ) endGame(GA.NAMES[champ.id] + ' wins!', snakes.map(function (s) { return GA.NAMES[s.id] + ' ' + s.wins; }).join(' · '));
        else { roundMsg = alive[0] ? GA.NAMES[alive[0].id] + ' takes the round' : 'Draw'; roundPause = 1.4; state = 'between'; }
      }
    }
  }
  function endGame(title, detail) {
    state = 'over';
    document.getElementById('winner').textContent = title;
    document.getElementById('final').textContent = detail;
    GA.show(over);
  }
  var held = {}, padDir = [];
  function input() {
    KEYS.forEach(function (map, i) {
      var s = snakes.length === 1 ? snakes[0] : snakes[i];
      for (var k in map) { if (GA.keys[k] && !held[k]) queue(s, map[k]); held[k] = !!GA.keys[k]; }
    });
    GA.pads().forEach(function (p, i) {
      var s = snakes[Math.min(i, snakes.length - 1)];
      var d = Math.abs(p.x) > Math.abs(p.y) ? (p.x < -0.5 ? 'left' : p.x > 0.5 ? 'right' : null) : (p.y < -0.5 ? 'up' : p.y > 0.5 ? 'down' : null);
      if (d && d !== padDir[i]) queue(s, d);
      padDir[i] = d;
    });
  }
  function update(dt) {
    if (state !== 'play' && state !== 'between') return;
    if (roundPause > 0) { roundPause -= dt; if (roundPause <= 0) { if (state === 'between') { newRound(); state = 'play'; roundPause = 1; return; } roundMsg = ''; } return; }
    input();
    acc += dt;
    var tick = 1 / rate;
    while (acc >= tick && state === 'play') { acc -= tick; step(); }
  }
  function draw(paused) {
    ctx.fillStyle = '#0b0e14'; ctx.fillRect(0, 0, W, H);
    for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) if ((x + y) % 2) { ctx.fillStyle = '#10141d'; ctx.fillRect(x * C, y * C, C, C); }
    if (fruit) { ctx.fillStyle = '#ff5a6a'; ctx.beginPath(); ctx.arc(fruit[0] * C + C / 2, fruit[1] * C + C / 2, C * 0.36, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#5bd18b'; ctx.fillRect(fruit[0] * C + C / 2, fruit[1] * C + 3, 3, 5); }
    snakes.forEach(function (s) {
      if (!s.body) return;
      s.body.forEach(function (p, i) {
        ctx.fillStyle = GA.COLORS[s.id];
        ctx.globalAlpha = s.alive ? (i === 0 ? 1 : 0.85 - Math.min(i, 20) * 0.015) : 0.35;
        ctx.fillRect(p[0] * C + 2, p[1] * C + 2, C - 4, C - 4);
        if (i === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(p[0] * C + 7, p[1] * C + 7, 4, 4); ctx.fillRect(p[0] * C + 14, p[1] * C + 7, 4, 4); }
      });
      ctx.globalAlpha = 1;
    });
    if (roundMsg) { ctx.fillStyle = 'rgba(8,10,16,0.55)'; ctx.fillRect(0, H / 2 - 36, W, 64); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '800 28px system-ui, sans-serif'; ctx.fillText(roundMsg, W / 2, H / 2 + 6); }
    if (paused && (state === 'play' || state === 'between')) GA.drawPaused(ctx, W, H);
  }
  // Touch: swipe anywhere, or the on-screen pad (player 1).
  var sx = 0, sy = 0, stage = document.querySelector('.stage');
  stage.addEventListener('touchstart', function (e) { e.preventDefault(); sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: false });
  stage.addEventListener('touchmove', function (e) {
    e.preventDefault();
    var dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    queue(snakes[0], Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: false });
  var dpad = document.getElementById('dpad');
  if (window.matchMedia('(pointer: coarse)').matches) dpad.hidden = false;
  dpad.addEventListener('pointerdown', function (e) { var b = e.target.closest('[data-d]'); if (b) { e.preventDefault(); queue(snakes[0], b.getAttribute('data-d')); } });

  // Used by scripts/capture-originals.mjs to stage a cover screenshot.
  GA.demoGrow = function (n) { snakes.forEach(function (s) { s.grow += n; }); };
  GA.rotateHint();
  GA.debug = function () { return { state: state, length: snakes[0] ? snakes[0].body.length : 0, head: snakes[0] ? snakes[0].body[0].slice() : null }; };
  var loop = GA.loop(update, draw);
  GA.autoPause(loop, function () { return state === 'play' || state === 'between'; });
  document.getElementById('start').addEventListener('click', newMatch);
  document.getElementById('again').addEventListener('click', newMatch);
  document.getElementById('tomenu').addEventListener('click', function () { GA.hide(over); state = 'menu'; GA.show(menu); });
  loop.start();
})();
