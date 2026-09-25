(function () {
  'use strict';
  var W = 800, H = 450, G = 300, BLAST = 32;
  var canvas = document.getElementById('c');
  var ctx = GA.fitCanvas(canvas, W, H);
  var menu = document.getElementById('menu'), over = document.getElementById('over'), hud = document.getElementById('hud');
  var opts = GA.options(menu, { tanks: 2, humans: 1 });
  GA.onOption = function (n, v) {
    if (n === 'humans' && opts.tanks < v) { opts.tanks = v; sync('tanks', v); }
    if (n === 'tanks' && opts.humans > v) { opts.humans = v; sync('humans', v); }
  };
  function sync(name, val) { menu.querySelectorAll('[data-opt="' + name + '"] button').forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-value')) === val)); }); }
  var state = 'menu', ground, tanks, turn, wind, shell = null, booms = [], cpuPlan = null, hold = {}, msg = '', msgT = 0;

  function makeGround() {
    ground = new Float32Array(W);
    var a = Math.random() * 6, b = Math.random() * 6, c = Math.random() * 6;
    for (var x = 0; x < W; x++) ground[x] = H * 0.62 + Math.sin(x / 90 + a) * 40 + Math.sin(x / 37 + b) * 16 + Math.sin(x / 190 + c) * 55;
  }
  function groundAt(x) { return ground[GA.clamp(Math.round(x), 0, W - 1)]; }
  function newGame() {
    makeGround();
    tanks = [];
    for (var i = 0; i < opts.tanks; i++) {
      var x = Math.round((i + 0.5) * W / opts.tanks + (Math.random() - 0.5) * 40);
      // Flatten a pad for each tank.
      for (var k = -12; k <= 12; k++) if (x + k >= 0 && x + k < W) ground[x + k] = ground[x];
      tanks.push({ id: i, x: x, y: ground[x], hp: 100, angle: x < W / 2 ? 50 : 130, power: 62, human: i < opts.humans, alive: true });
    }
    turn = 0; shell = null; booms = [];
    newTurn(true);
    state = 'play'; GA.hide(menu); GA.hide(over); loop.pause(false);
  }
  function current() { return tanks[turn]; }
  function newTurn(first) {
    if (!first) { do { turn = (turn + 1) % tanks.length; } while (!tanks[turn].alive); }
    wind = Math.round((Math.random() - 0.5) * 120);
    cpuPlan = current().human ? null : planShot(current());
    msg = name(current()) + (current().human ? ' — your turn' : ' is aiming…'); msgT = 1.4;
    updateHud();
    aimEl.hidden = !(coarse && current().human);
  }
  function name(t) { return GA.NAMES[t.id] + (t.human ? '' : ' (CPU)'); }
  function updateHud() {
    hud.innerHTML = tanks.map(function (t) {
      return '<span class="tag p' + (t.id + 1) + '">' + name(t) + ' ' + (t.alive ? Math.ceil(t.hp) : '✖') + (t.id === turn && state === 'play' ? ' ◂' : '') + '</span>';
    }).join('') + '<span class="tag">Wind ' + (wind === 0 ? '0' : (wind < 0 ? '← ' : '→ ') + Math.abs(wind)) + '</span>';
  }
  function muzzle(t) {
    var a = t.angle * Math.PI / 180;
    return { x: t.x + Math.cos(a) * 16, y: t.y - 10 - Math.sin(a) * 16, vx: Math.cos(a), vy: -Math.sin(a) };
  }
  function fire() {
    var t = current();
    if (shell || !t.alive || state !== 'play') return;
    var m = muzzle(t), sp = t.power * 7;
    shell = { x: m.x, y: m.y, vx: m.vx * sp, vy: m.vy * sp, owner: t.id, age: 0 };
    aimEl.hidden = true;
  }
  // Simulate a shot (for the computer): where does it land?
  function simulate(t, angle, power) {
    var a = angle * Math.PI / 180, sp = power * 7;
    var x = t.x + Math.cos(a) * 16, y = t.y - 10 - Math.sin(a) * 16, vx = Math.cos(a) * sp, vy = -Math.sin(a) * sp;
    for (var i = 0; i < 900; i++) {
      var dt = 1 / 120;
      vx += wind * dt; vy += G * dt; x += vx * dt; y += vy * dt;
      if (x < 0 || x >= W) return { x: x, y: y };
      if (y >= groundAt(x)) return { x: x, y: y };
    }
    return { x: x, y: y };
  }
  function planShot(t) {
    var targets = tanks.filter(function (o) { return o.alive && o !== t; });
    var target = targets.sort(function (a, b) { return Math.abs(a.x - t.x) - Math.abs(b.x - t.x); })[0];
    var best = null, bestD = Infinity;
    for (var ang = 15; ang <= 165; ang += 3) for (var pw = 30; pw <= 100; pw += 3) {
      var hit = simulate(t, ang, pw), d = Math.hypot(hit.x - target.x, hit.y - target.y);
      if (d < bestD) { bestD = d; best = { angle: ang, power: pw }; }
    }
    // A little human-like error.
    best.angle += Math.round((Math.random() - 0.5) * 6);
    best.power += Math.round((Math.random() - 0.5) * 5);
    return best;
  }
  function explode(x, y) {
    booms.push({ x: x, y: y, t: 0.5 });
    for (var gx = Math.max(0, Math.floor(x - BLAST)); gx < Math.min(W, x + BLAST); gx++) {
      var dy = Math.sqrt(Math.max(0, BLAST * BLAST - (gx - x) * (gx - x)));
      if (ground[gx] < y + dy) ground[gx] = Math.max(ground[gx], Math.min(H, y + dy));
    }
    tanks.forEach(function (t) {
      if (!t.alive) return;
      var d = Math.hypot(t.x - x, t.y - 6 - y);
      if (d < BLAST + 14) { t.hp -= Math.round(55 * (1 - d / (BLAST + 14))); if (t.hp <= 0) { t.hp = 0; t.alive = false; } }
      t.y = ground[GA.clamp(Math.round(t.x), 0, W - 1)];
    });
    updateHud();
    var alive = tanks.filter(function (t) { return t.alive; });
    if (alive.length <= 1) {
      state = 'over';
      setTimeout(function () {
        document.getElementById('winner').textContent = alive[0] ? name(alive[0]) + ' wins!' : 'Everyone is out — a draw';
        document.getElementById('final').textContent = tanks.map(function (t) { return name(t) + (t.alive ? ' ' + Math.ceil(t.hp) + ' HP' : ' destroyed'); }).join(' · ');
        GA.show(over);
      }, 700);
      return;
    }
    setTimeout(function () { if (state === 'play') newTurn(false); }, 600);
  }
  function update(dt) {
    booms.forEach(function (b) { b.t -= dt; }); booms = booms.filter(function (b) { return b.t > 0; });
    msgT = Math.max(0, msgT - dt);
    if (state !== 'play') return;
    var t = current();
    if (shell) {
      for (var s = 0; s < 4 && shell; s++) {
        var h = dt / 4;
        shell.vx += wind * h; shell.vy += G * h; shell.x += shell.vx * h; shell.y += shell.vy * h; shell.age += h;
        if (shell.x < -20 || shell.x > W + 20 || shell.y > H + 20) { shell = null; setTimeout(function () { if (state === 'play') newTurn(false); }, 400); break; }
        var hitTank = tanks.some(function (o) { return o.alive && (o.id !== shell.owner || shell.age > 0.4) && Math.abs(o.x - shell.x) < 13 && shell.y > o.y - 14 && shell.y < o.y + 2; });
        if (hitTank || (shell.x >= 0 && shell.x < W && shell.y >= groundAt(shell.x))) { var ex = shell.x, ey = shell.y; shell = null; explode(ex, ey); }
      }
      return;
    }
    if (!t.human) {
      if (msgT > 0 || !cpuPlan) return;
      t.angle += GA.clamp(cpuPlan.angle - t.angle, -60 * dt, 60 * dt);
      t.power += GA.clamp(cpuPlan.power - t.power, -40 * dt, 40 * dt);
      if (Math.abs(t.angle - cpuPlan.angle) < 0.5 && Math.abs(t.power - cpuPlan.power) < 0.5) fire();
      return;
    }
    var k = GA.keys, pad = GA.pads()[0] || { x: 0, y: 0 };
    var da = ((k.ArrowLeft || k.KeyA || hold['angle-']) ? 1 : 0) - ((k.ArrowRight || k.KeyD || hold['angle+']) ? 1 : 0) - pad.x;
    var dp = ((k.ArrowUp || k.KeyW || hold['power+']) ? 1 : 0) - ((k.ArrowDown || k.KeyS || hold['power-']) ? 1 : 0) - pad.y;
    t.angle = GA.clamp(t.angle + GA.clamp(da, -1, 1) * 50 * dt, 0, 180);
    t.power = GA.clamp(t.power + GA.clamp(dp, -1, 1) * 35 * dt, 10, 100);
    if (k.Space || k.Enter) fire();
  }
  function draw(paused) {
    var sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#1b2a4a'); sky.addColorStop(1, '#3b3150');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (ground) {
      ctx.fillStyle = '#3f6b3a'; ctx.beginPath(); ctx.moveTo(0, H);
      for (var x = 0; x < W; x += 2) ctx.lineTo(x, ground[x]);
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#7fbf5a'; ctx.lineWidth = 3; ctx.beginPath();
      for (var x2 = 0; x2 < W; x2 += 2) (x2 ? ctx.lineTo : ctx.moveTo).call(ctx, x2, ground[x2]);
      ctx.stroke();
    }
    if (tanks) tanks.forEach(function (t) {
      if (!t.alive) { ctx.fillStyle = '#444'; ctx.fillRect(t.x - 12, t.y - 6, 24, 6); return; }
      var a = t.angle * Math.PI / 180;
      ctx.strokeStyle = GA.COLORS[t.id]; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(t.x, t.y - 10); ctx.lineTo(t.x + Math.cos(a) * 16, t.y - 10 - Math.sin(a) * 16); ctx.stroke();
      ctx.fillStyle = GA.COLORS[t.id]; ctx.beginPath(); ctx.arc(t.x, t.y - 8, 8, Math.PI, 0); ctx.fill(); ctx.fillRect(t.x - 13, t.y - 8, 26, 8);
      ctx.fillStyle = '#111'; ctx.fillRect(t.x - 13, t.y - 2, 26, 3);
      if (t.id === turn && state === 'play') {
        ctx.fillStyle = '#fff'; ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(Math.round(t.angle) + '° · ' + Math.round(t.power) + '%', t.x, t.y - 34);
        ctx.beginPath(); ctx.moveTo(t.x - 5, t.y - 28); ctx.lineTo(t.x + 5, t.y - 28); ctx.lineTo(t.x, t.y - 22); ctx.fill();
      }
    });
    if (shell) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(shell.x, shell.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
    booms.forEach(function (b) { ctx.fillStyle = 'rgba(255,170,60,' + (b.t * 1.6).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(b.x, b.y, BLAST * (1.2 - b.t), 0, Math.PI * 2); ctx.fill(); });
    if (msgT > 0) { ctx.fillStyle = 'rgba(8,10,16,0.6)'; ctx.fillRect(W / 2 - 200, 60, 400, 40); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '800 18px system-ui, sans-serif'; ctx.fillText(msg, W / 2, 86); }
    if (paused && state === 'play') GA.drawPaused(ctx, W, H);
  }
  // Touch buttons (hold to adjust).
  var aimEl = document.getElementById('aim'), coarse = window.matchMedia('(pointer: coarse)').matches;
  aimEl.addEventListener('pointerdown', function (e) {
    var b = e.target.closest('[data-a]'); if (!b) return; e.preventDefault(); b.classList.add('on');
    var a = b.getAttribute('data-a'); if (a === 'fire') fire(); else hold[a] = true;
  });
  function release(e) { var b = e.target.closest('[data-a]'); if (!b) return; b.classList.remove('on'); hold[b.getAttribute('data-a')] = false; }
  aimEl.addEventListener('pointerup', release); aimEl.addEventListener('pointercancel', release);
  GA.onPad(function (pad, button) { if (button === 'a' && state === 'play' && menu.hidden && over.hidden && current().human) { fire(); return true; } });

  GA.rotateHint();
  GA.debug = function () { return { state: state, turn: turn, hp: tanks ? tanks.map(function (t) { return t.hp; }) : [], shell: !!shell }; };
  var loop = GA.loop(update, draw);
  GA.autoPause(loop, function () { return state === 'play'; });
  document.getElementById('start').addEventListener('click', newGame);
  document.getElementById('again').addEventListener('click', newGame);
  document.getElementById('tomenu').addEventListener('click', function () { GA.hide(over); state = 'menu'; GA.show(menu); });
  makeGround();
  loop.start();
})();
