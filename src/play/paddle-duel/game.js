(function () {
  'use strict';
  var W = 800, H = 450, PW = 12, PH = 84, BALL = 10, WIN = 7;
  var canvas = document.getElementById('c');
  var ctx = GA.fitCanvas(canvas, W, H);
  var menu = document.getElementById('menu'), over = document.getElementById('over');
  var s1 = document.getElementById('s1'), s2 = document.getElementById('s2');
  var opts = GA.options(menu, { mode: 'cpu', diff: 'normal' });
  var diffRow = document.getElementById('diff-row');
  GA.onOption = function (name, v) { if (name === 'mode') diffRow.hidden = v !== 'cpu'; };

  var CPU = { easy: { speed: 230, react: 0.35, err: 60 }, normal: { speed: 330, react: 0.18, err: 30 }, hard: { speed: 460, react: 0.07, err: 10 } };
  var state = 'menu';
  var p = [{ y: H / 2, score: 0, touchY: null }, { y: H / 2, score: 0, touchY: null }];
  var ball, serveTimer, cpuTarget = H / 2, cpuTimer = 0, flash = 0;

  function resetBall(dir) {
    ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, speed: 360, dir: dir };
    serveTimer = 0.9;
  }
  function newGame() {
    p[0].score = p[1].score = 0;
    p[0].y = p[1].y = H / 2;
    resetBall(Math.random() < 0.5 ? -1 : 1);
    updateHud();
    state = 'play';
    GA.hide(menu); GA.hide(over);
    loop.pause(false);
  }
  function updateHud() {
    s1.textContent = (opts.mode === 'cpu' ? 'You ' : 'Left ') + p[0].score;
    s2.textContent = (opts.mode === 'cpu' ? 'Computer ' : 'Right ') + p[1].score;
  }

  function predictY() {
    // Where the ball will cross the right paddle's x, including wall bounces.
    if (ball.vx <= 0) return H / 2;
    var t = (W - 30 - ball.x) / ball.vx;
    var y = ball.y + ball.vy * t;
    var span = H - BALL;
    y = ((y % (2 * span)) + 2 * span) % (2 * span);
    return y > span ? 2 * span - y : y;
  }

  function update(dt) {
    if (state !== 'play') return;
    var pads = GA.pads();
    var k = GA.keys;
    var speed = 420;
    var up0 = k.KeyW || (opts.mode === 'cpu' && k.ArrowUp), dn0 = k.KeyS || (opts.mode === 'cpu' && k.ArrowDown);
    var move0 = (dn0 ? 1 : 0) - (up0 ? 1 : 0) + (pads[0] ? pads[0].y : 0);
    p[0].y += GA.clamp(move0, -1, 1) * speed * dt;
    if (p[0].touchY !== null) p[0].y += GA.clamp(p[0].touchY - p[0].y, -speed * dt * 1.6, speed * dt * 1.6);
    if (opts.mode === '2p') {
      var move1 = (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0) + (pads[1] ? pads[1].y : 0);
      p[1].y += GA.clamp(move1, -1, 1) * speed * dt;
      if (p[1].touchY !== null) p[1].y += GA.clamp(p[1].touchY - p[1].y, -speed * dt * 1.6, speed * dt * 1.6);
    } else {
      var c = CPU[opts.diff];
      cpuTimer -= dt;
      if (cpuTimer <= 0) { cpuTimer = c.react; cpuTarget = (ball.vx > 0 ? predictY() : H / 2) + GA.rand(-c.err, c.err); }
      p[1].y += GA.clamp(cpuTarget - p[1].y, -c.speed * dt, c.speed * dt);
    }
    p[0].y = GA.clamp(p[0].y, PH / 2, H - PH / 2);
    p[1].y = GA.clamp(p[1].y, PH / 2, H - PH / 2);

    if (serveTimer > 0) {
      serveTimer -= dt;
      if (serveTimer <= 0) { var a = GA.rand(-0.5, 0.5); ball.vx = Math.cos(a) * ball.speed * ball.dir; ball.vy = Math.sin(a) * ball.speed; }
      return;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.y < BALL / 2) { ball.y = BALL / 2; ball.vy = Math.abs(ball.vy); }
    if (ball.y > H - BALL / 2) { ball.y = H - BALL / 2; ball.vy = -Math.abs(ball.vy); }
    hit(0, 24 + PW, 1);
    hit(1, W - 24 - PW, -1);
    if (ball.x < -20) point(1);
    if (ball.x > W + 20) point(0);
    flash = Math.max(0, flash - dt);
  }
  function hit(i, faceX, dir) {
    var pl = p[i];
    var crossing = dir === 1 ? (ball.vx < 0 && ball.x - BALL / 2 <= faceX && ball.x > faceX - PW - BALL) : (ball.vx > 0 && ball.x + BALL / 2 >= faceX && ball.x < faceX + PW + BALL);
    if (!crossing || Math.abs(ball.y - pl.y) > PH / 2 + BALL / 2) return;
    var off = (ball.y - pl.y) / (PH / 2); // -1..1
    ball.speed = Math.min(ball.speed * 1.06, 900);
    var angle = off * 1.0;
    ball.vx = Math.cos(angle) * ball.speed * dir;
    ball.vy = Math.sin(angle) * ball.speed;
    ball.x = faceX + dir * BALL / 2;
    flash = 0.08;
  }
  function point(i) {
    p[i].score++;
    updateHud();
    if (p[i].score >= WIN) {
      state = 'over';
      var names = opts.mode === 'cpu' ? ['You win!', 'The computer wins'] : ['Left player wins!', 'Right player wins!'];
      document.getElementById('winner').textContent = names[i];
      document.getElementById('final').textContent = p[0].score + ' – ' + p[1].score;
      GA.show(over);
      return;
    }
    resetBall(i === 0 ? 1 : -1);
  }

  function draw(paused) {
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1f2636';
    for (var y = 10; y < H; y += 26) ctx.fillRect(W / 2 - 2, y, 4, 14);
    ctx.font = '800 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillText(p[0].score, W / 2 - 80, 80);
    ctx.fillText(p[1].score, W / 2 + 80, 80);
    ctx.fillStyle = GA.COLORS[0];
    ctx.fillRect(24, p[0].y - PH / 2, PW, PH);
    ctx.fillStyle = GA.COLORS[1];
    ctx.fillRect(W - 24 - PW, p[1].y - PH / 2, PW, PH);
    if (ball) {
      ctx.fillStyle = flash > 0 ? '#ffe28a' : '#f4f6fb';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL / 2 + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    if (paused && state === 'play') GA.drawPaused(ctx, W, H);
  }

  // Touch: each finger steers the paddle on its half.
  function touch(e) {
    e.preventDefault();
    p[0].touchY = p[1].touchY = null;
    for (var i = 0; i < e.touches.length; i++) {
      var t = e.touches[i];
      var pt = GA.toLogical(canvas, W, H, t.clientX, t.clientY);
      var side = opts.mode === 'cpu' ? 0 : (pt.x < W / 2 ? 0 : 1);
      p[side].touchY = pt.y;
    }
  }
  canvas.addEventListener('touchstart', touch, { passive: false });
  canvas.addEventListener('touchmove', touch, { passive: false });
  canvas.addEventListener('touchend', touch, { passive: false });

  var loop = GA.loop(update, draw);
  GA.autoPause(loop, function () { return state === 'play'; });
  document.getElementById('start').addEventListener('click', newGame);
  document.getElementById('again').addEventListener('click', newGame);
  document.getElementById('tomenu').addEventListener('click', function () { GA.hide(over); state = 'menu'; GA.show(menu); });
  diffRow.hidden = opts.mode !== 'cpu';
  resetBall(1);
  loop.start();
})();
