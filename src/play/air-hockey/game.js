(function () {
  'use strict';
  var W = 800, H = 450, MR = 26, PR = 15, GOAL = 150, WIN = 7, MAXV = 950;
  var canvas = document.getElementById('c');
  var ctx = GA.fitCanvas(canvas, W, H);
  var menu = document.getElementById('menu'), over = document.getElementById('over'), hud = document.getElementById('hud');
  var opts = GA.options(menu, { mode: 'cpu', diff: 'normal' });
  var diffRow = document.getElementById('diff-row');
  GA.onOption = function (n, v) { if (n === 'mode') diffRow.hidden = v !== 'cpu'; };
  diffRow.hidden = opts.mode !== 'cpu';
  var CPU = { easy: { speed: 260, aim: 0.6 }, normal: { speed: 380, aim: 0.85 }, hard: { speed: 520, aim: 1 } };
  var state = 'menu', m = [], puck, score = [0, 0], serve = 0, touches = {}, mouse = null;

  function reset(toward) {
    puck = { x: W / 2 + toward * 60, y: H / 2, vx: 0, vy: 0 };
    m[0] = { x: 90, y: H / 2, vx: 0, vy: 0, tx: null, ty: null };
    m[1] = { x: W - 90, y: H / 2, vx: 0, vy: 0, tx: null, ty: null };
    serve = 0.8;
  }
  function newGame() {
    score = [0, 0];
    reset(Math.random() < 0.5 ? -1 : 1);
    state = 'play'; GA.hide(menu); GA.hide(over); loop.pause(false); updateHud();
  }
  function updateHud() {
    var n = opts.mode === 'cpu' ? ['You', 'Computer'] : ['Blue', 'Orange'];
    hud.innerHTML = '<span class="tag p1">' + n[0] + ' ' + score[0] + '</span><span class="tag p2">' + n[1] + ' ' + score[1] + '</span>';
  }
  function moveMallet(i, dt) {
    var mm = m[i], k = GA.keys, pad = GA.pads()[i], dx = 0, dy = 0;
    var keys = i === 0 ? ['KeyA', 'KeyD', 'KeyW', 'KeyS'] : ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (k[keys[0]]) dx -= 1; if (k[keys[1]]) dx += 1; if (k[keys[2]]) dy -= 1; if (k[keys[3]]) dy += 1;
    if (pad) { dx += pad.x; dy += pad.y; }
    var ox = mm.x, oy = mm.y;
    if (mm.tx !== null) { mm.x += GA.clamp(mm.tx - mm.x, -1400 * dt, 1400 * dt); mm.y += GA.clamp(mm.ty - mm.y, -1400 * dt, 1400 * dt); }
    else { mm.x += GA.clamp(dx, -1, 1) * 520 * dt; mm.y += GA.clamp(dy, -1, 1) * 520 * dt; }
    clampMallet(i);
    mm.vx = (mm.x - ox) / Math.max(dt, 1e-3); mm.vy = (mm.y - oy) / Math.max(dt, 1e-3);
  }
  function clampMallet(i) {
    var mm = m[i];
    mm.y = GA.clamp(mm.y, MR, H - MR);
    mm.x = i === 0 ? GA.clamp(mm.x, MR, W / 2 - MR) : GA.clamp(mm.x, W / 2 + MR, W - MR);
  }
  function cpu(dt) {
    var c = CPU[opts.diff], mm = m[1], ox = mm.x, oy = mm.y;
    var defend = puck.x < W / 2 || puck.vx < -50;
    var tx = defend ? W - 70 : puck.x + 22, ty = defend ? H / 2 + (puck.y - H / 2) * 0.5 : puck.y + (puck.y - H / 2) * (1 - c.aim) * 0.3;
    mm.x += GA.clamp(tx - mm.x, -c.speed * dt, c.speed * dt);
    mm.y += GA.clamp(ty - mm.y, -c.speed * dt, c.speed * dt);
    clampMallet(1);
    mm.vx = (mm.x - ox) / Math.max(dt, 1e-3); mm.vy = (mm.y - oy) / Math.max(dt, 1e-3);
  }
  function hitMallet(mm) {
    var dx = puck.x - mm.x, dy = puck.y - mm.y, d = Math.hypot(dx, dy), min = MR + PR;
    if (d >= min || d === 0) return;
    var nx = dx / d, ny = dy / d;
    puck.x = mm.x + nx * min; puck.y = mm.y + ny * min;
    var rel = (puck.vx - mm.vx) * nx + (puck.vy - mm.vy) * ny;
    if (rel < 0) { puck.vx -= 1.9 * rel * nx; puck.vy -= 1.9 * rel * ny; }
    var sp = Math.hypot(puck.vx, puck.vy);
    if (sp > MAXV) { puck.vx *= MAXV / sp; puck.vy *= MAXV / sp; }
  }
  function update(dt) {
    if (state !== 'play') return;
    moveMallet(0, dt);
    if (opts.mode === '2p') moveMallet(1, dt); else cpu(dt);
    if (serve > 0) { serve -= dt; }
    var steps = 4;
    for (var s = 0; s < steps; s++) {
      var h = dt / steps;
      puck.x += puck.vx * h; puck.y += puck.vy * h;
      puck.vx *= 1 - 0.35 * h; puck.vy *= 1 - 0.35 * h;
      if (puck.y < PR) { puck.y = PR; puck.vy = Math.abs(puck.vy) * 0.9; }
      if (puck.y > H - PR) { puck.y = H - PR; puck.vy = -Math.abs(puck.vy) * 0.9; }
      var inGoal = Math.abs(puck.y - H / 2) < GOAL / 2;
      if (puck.x < PR && !inGoal) { puck.x = PR; puck.vx = Math.abs(puck.vx) * 0.9; }
      if (puck.x > W - PR && !inGoal) { puck.x = W - PR; puck.vx = -Math.abs(puck.vx) * 0.9; }
      if (puck.x < -PR) return goal(1);
      if (puck.x > W + PR) return goal(0);
      hitMallet(m[0]); hitMallet(m[1]);
    }
  }
  function goal(i) {
    score[i]++; updateHud();
    if (score[i] >= WIN) {
      state = 'over';
      var n = opts.mode === 'cpu' ? ['You win!', 'The computer wins'] : ['Blue wins!', 'Orange wins!'];
      document.getElementById('winner').textContent = n[i];
      document.getElementById('final').textContent = score[0] + ' – ' + score[1];
      GA.show(over);
      return;
    }
    reset(i === 0 ? 1 : -1);
  }
  function circle(x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  function draw(paused) {
    ctx.fillStyle = '#0f2a3a'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 60, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#081820'; ctx.fillRect(0, H / 2 - GOAL / 2, 8, GOAL); ctx.fillRect(W - 8, H / 2 - GOAL / 2, 8, GOAL);
    ctx.strokeStyle = 'rgba(79,134,255,0.6)'; ctx.beginPath(); ctx.arc(0, H / 2, GOAL / 2 + 20, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,138,61,0.6)'; ctx.beginPath(); ctx.arc(W, H / 2, GOAL / 2 + 20, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    if (puck) circle(puck.x, puck.y, PR, '#f4f6fb');
    if (m[0]) { circle(m[0].x, m[0].y, MR, GA.COLORS[0]); circle(m[0].x, m[0].y, MR * 0.45, '#9fbcff'); }
    if (m[1]) { circle(m[1].x, m[1].y, MR, GA.COLORS[1]); circle(m[1].x, m[1].y, MR * 0.45, '#ffc49b'); }
    if (paused && state === 'play') GA.drawPaused(ctx, W, H);
  }
  // Touch: every finger steers the mallet on its half. Mouse steers Blue.
  var stage = document.querySelector('.stage');
  function applyPointer(e) {
    var p = GA.toLogical(canvas, W, H, e.clientX, e.clientY);
    var i = e.pointerType === 'mouse' ? 0 : (p.x < W / 2 ? 0 : 1);
    if (i === 1 && opts.mode === 'cpu') i = 0;
    touches[e.pointerId] = i;
    m[i].tx = p.x; m[i].ty = p.y;
  }
  stage.addEventListener('pointerdown', function (e) { if (state === 'play') { e.preventDefault(); applyPointer(e); } });
  stage.addEventListener('pointermove', function (e) { if (state === 'play' && (e.pointerType === 'mouse' || touches[e.pointerId] !== undefined)) applyPointer(e); });
  function release(e) { var i = touches[e.pointerId]; delete touches[e.pointerId]; if (i !== undefined && e.pointerType !== 'mouse') m[i].tx = m[i].ty = null; }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('mouseleave', function () { if (m[0]) m[0].tx = m[0].ty = null; });
  window.addEventListener('keydown', function (e) { if (/^(Key[WASD]|Arrow)/.test(e.code) && m[0]) { m[0].tx = m[0].ty = null; if (m[1]) m[1].tx = m[1].ty = null; } });

  GA.rotateHint();
  GA.debug = function () { return { state: state, score: score.slice(), puck: puck ? [puck.x, puck.y] : null, m0: m[0] ? [m[0].x, m[0].y] : null }; };
  var loop = GA.loop(update, draw);
  GA.autoPause(loop, function () { return state === 'play'; });
  document.getElementById('start').addEventListener('click', newGame);
  document.getElementById('again').addEventListener('click', newGame);
  document.getElementById('tomenu').addEventListener('click', function () { GA.hide(over); state = 'menu'; GA.show(menu); });
  reset(1);
  loop.start();
})();
