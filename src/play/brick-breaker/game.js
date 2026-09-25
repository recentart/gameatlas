(function () {
  'use strict';
  var W = 800, H = 450, PW = 110, PH = 12, R = 7, COLS = 12, ROWS = 6, BW = 60, BH = 20, GAP = 4;
  var TOP = 50, LEFT = (W - (COLS * BW + (COLS - 1) * GAP)) / 2;
  var canvas = document.getElementById('c');
  var ctx = GA.fitCanvas(canvas, W, H);
  var menu = document.getElementById('menu'), over = document.getElementById('over'), hud = document.getElementById('hud');
  var opts = GA.options(menu, { diff: 1 });
  var ROW_COLORS = ['#ff5a6a', '#ff8a3d', '#ffc233', '#3ccf8e', '#4f86ff', '#a46bff'];
  // Level layouts: '1' = brick, '2' = tough brick (two hits), '.' = empty.
  var LEVELS = [
    ['111111111111', '111111111111', '111111111111', '111111111111', '............', '............'],
    ['1.1.1.1.1.1.', '.1.1.1.1.1.1', '222222222222', '1.1.1.1.1.1.', '.1.1.1.1.1.1', '............'],
    ['.1111111111.', '11........11', '1..222222..1', '1..222222..1', '11........11', '.1111111111.'],
    ['222222222222', '1..........1', '1.22222222.1', '1.2......2.1', '1.22222222.1', '111111111111'],
  ];
  var state = 'menu', level = 0, lives = 3, score = 0, bricks, paddle, ball, stuck, pointerX = null, flash = 0;

  function loadLevel(n) {
    var map = LEVELS[n % LEVELS.length];
    bricks = [];
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      var t = map[r][c];
      if (t !== '.') bricks.push({ x: LEFT + c * (BW + GAP), y: TOP + r * (BH + GAP), hp: t === '2' ? 2 : 1, color: ROW_COLORS[r] });
    }
  }
  function speed() { return (330 + level * 35) * opts.diff; }
  function resetBall() { stuck = true; ball = { x: paddle.x, y: H - 40 - R, vx: 0, vy: 0 }; }
  function newGame() {
    level = 0; lives = 3; score = 0;
    paddle = { x: W / 2 };
    loadLevel(0); resetBall();
    state = 'play'; GA.hide(menu); GA.hide(over); loop.pause(false); updateHud();
  }
  function launch() {
    if (state !== 'play' || !stuck) return;
    stuck = false;
    var a = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    ball.vx = Math.cos(a) * speed(); ball.vy = Math.sin(a) * speed();
  }
  function updateHud() { hud.innerHTML = '<span class="tag">Level ' + (level + 1) + '</span><span class="tag">Score ' + score + '</span><span class="tag">' + '♥'.repeat(lives) + '</span>'; }

  function update(dt) {
    if (state !== 'play') return;
    var k = GA.keys, pads = GA.pads(), move = 0;
    if (k.ArrowLeft || k.KeyA) move -= 1;
    if (k.ArrowRight || k.KeyD) move += 1;
    if (pads[0]) { move += pads[0].x; if (pads[0].a) launch(); }
    if (k.Space) launch();
    paddle.x += GA.clamp(move, -1, 1) * 620 * dt;
    if (pointerX !== null) paddle.x += GA.clamp(pointerX - paddle.x, -1200 * dt, 1200 * dt);
    paddle.x = GA.clamp(paddle.x, PW / 2, W - PW / 2);
    flash = Math.max(0, flash - dt);
    if (stuck) { ball.x = paddle.x; ball.y = H - 40 - R; return; }
    // Sub-steps keep fast balls from tunnelling through bricks.
    var steps = Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / 5);
    for (var s = 0; s < steps && state === 'play'; s++) move1(dt / steps);
  }
  function move1(dt) {
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx); }
    if (ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx); }
    if (ball.y < R) { ball.y = R; ball.vy = Math.abs(ball.vy); }
    var py = H - 40;
    if (ball.vy > 0 && ball.y + R >= py && ball.y + R <= py + PH + 8 && Math.abs(ball.x - paddle.x) <= PW / 2 + R) {
      var off = GA.clamp((ball.x - paddle.x) / (PW / 2), -1, 1);
      var a = -Math.PI / 2 + off * 1.05, sp = speed();
      ball.vx = Math.cos(a) * sp; ball.vy = Math.sin(a) * sp; ball.y = py - R;
    }
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      var nx = GA.clamp(ball.x, b.x, b.x + BW), ny = GA.clamp(ball.y, b.y, b.y + BH);
      var dx = ball.x - nx, dy = ball.y - ny;
      if (dx * dx + dy * dy > R * R) continue;
      if (Math.abs(dx) > Math.abs(dy)) ball.vx = dx > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
      else ball.vy = dy > 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy);
      b.hp--;
      score += b.hp <= 0 ? 10 : 5;
      if (b.hp <= 0) bricks.splice(i, 1);
      flash = 0.06;
      updateHud();
      if (!bricks.length) { level++; loadLevel(level); resetBall(); updateHud(); }
      break;
    }
    if (ball.y > H + 20) {
      lives--; updateHud();
      if (lives <= 0) { state = 'over'; document.getElementById('winner').textContent = 'Game over'; document.getElementById('final').textContent = 'Score ' + score + ' · reached level ' + (level + 1); GA.show(over); return; }
      resetBall();
    }
  }
  function draw(paused) {
    ctx.fillStyle = '#0b0e14'; ctx.fillRect(0, 0, W, H);
    if (bricks) bricks.forEach(function (b) {
      ctx.fillStyle = b.color; ctx.globalAlpha = b.hp > 1 ? 1 : 0.8;
      ctx.fillRect(b.x, b.y, BW, BH);
      if (b.hp > 1) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(b.x + 2, b.y + 2, BW - 4, BH - 4); }
    });
    ctx.globalAlpha = 1;
    if (paddle) { ctx.fillStyle = '#e9ecf1'; ctx.fillRect(paddle.x - PW / 2, H - 40, PW, PH); ctx.fillStyle = '#6f86ff'; ctx.fillRect(paddle.x - PW / 2, H - 40, PW, 4); }
    if (ball) { ctx.fillStyle = flash > 0 ? '#ffe28a' : '#fff'; ctx.beginPath(); ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2); ctx.fill(); }
    if (state === 'play' && stuck) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.textAlign = 'center'; ctx.font = '600 16px system-ui, sans-serif'; ctx.fillText('Click, tap, Space or A to launch', W / 2, H - 70); }
    if (paused && state === 'play') GA.drawPaused(ctx, W, H);
  }
  // Mouse and touch steer the paddle; a tap or click launches.
  var stage = document.querySelector('.stage');
  function setPointer(clientX) { pointerX = GA.toLogical(canvas, W, H, clientX, 0).x; }
  stage.addEventListener('pointermove', function (e) { if (e.pointerType !== 'mouse' || state === 'play') setPointer(e.clientX); });
  stage.addEventListener('pointerdown', function (e) { setPointer(e.clientX); launch(); });
  stage.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') pointerX = null; });
  stage.addEventListener('mouseleave', function () { pointerX = null; });
  window.addEventListener('keydown', function (e) { if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD') pointerX = null; });
  GA.onPad(function (pad, button) { if (button === 'a' && state === 'play' && stuck) { launch(); return true; } });

  GA.rotateHint();
  GA.debug = function () { return { state: state, score: score, bricks: bricks ? bricks.length : 0, stuck: stuck }; };
  var loop = GA.loop(update, draw);
  GA.autoPause(loop, function () { return state === 'play'; });
  document.getElementById('start').addEventListener('click', newGame);
  document.getElementById('again').addEventListener('click', newGame);
  document.getElementById('tomenu').addEventListener('click', function () { GA.hide(over); state = 'menu'; GA.show(menu); });
  paddle = { x: W / 2 }; loadLevel(0); resetBall();
  loop.start();
})();
