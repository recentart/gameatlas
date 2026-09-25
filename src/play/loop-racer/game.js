(function () {
  'use strict';
  var W = 1000, H = 562, HW = 40, LAPS = 3, SAMPLES = 720;
  var canvas = document.getElementById('c');
  var ctx = GA.fitCanvas(canvas, W, H);
  var menu = document.getElementById('menu'), over = document.getElementById('over'), hud = document.getElementById('hud');
  var opts = GA.options(menu, { humans: 1, pace: 0.92 });

  // ---- track: closed Catmull-Rom spline ----
  var CTRL = [[160, 110], [430, 80], [600, 170], [800, 90], [915, 220], [800, 330], [900, 460], [640, 490], [500, 380], [330, 470], [130, 440], [80, 270]];
  var track = [];
  (function () {
    var n = CTRL.length, per = SAMPLES / n;
    for (var i = 0; i < n; i++) {
      var p0 = CTRL[(i - 1 + n) % n], p1 = CTRL[i], p2 = CTRL[(i + 1) % n], p3 = CTRL[(i + 2) % n];
      for (var s = 0; s < per; s++) {
        var t = s / per, t2 = t * t, t3 = t2 * t;
        track.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
  })();
  var N = track.length;
  function nearest(x, y, hint) {
    var best = hint, bd = Infinity, from = hint === undefined ? 0 : hint - 40, to = hint === undefined ? N : hint + 40;
    for (var i = from; i < to; i++) {
      var k = ((i % N) + N) % N, dx = track[k][0] - x, dy = track[k][1] - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = k; }
    }
    return { idx: best, dist: Math.sqrt(bd) };
  }
  var startAngle = Math.atan2(track[4][1] - track[0][1], track[4][0] - track[0][0]);

  // ---- race state ----
  var cars = [], state = 'menu', countdown = 0, raceTime = 0, finishOrder = [];
  var touchKeys = {};
  function newRace() {
    GA.hide(menu); GA.hide(over);
    cars = [];
    for (var i = 0; i < 4; i++) {
      var human = i < opts.humans;
      var back = 14 + Math.floor(i / 2) * 26, side = i % 2 ? 13 : -13;
      var base = track[(N - back) % N];
      var nx = -Math.sin(startAngle), ny = Math.cos(startAngle);
      cars.push({
        id: i, human: human, color: human ? GA.COLORS[i] : ['#e8e9ee', '#b9bfcc', '#8d95a6', '#d8d1b8'][i],
        name: human ? (opts.humans === 1 ? 'You' : GA.NAMES[i]) : 'CPU ' + (i - opts.humans + 1),
        x: base[0] + nx * side, y: base[1] + ny * side, a: startAngle, v: 0,
        idx: (N - back) % N, lap: 0, maxIdx: 0, lapStart: 0, best: null, finished: false, finishTime: 0, started: false,
        skill: human ? 1 : opts.pace * (0.95 + 0.05 * Math.random()), wob: Math.random() * 6,
      });
    }
    state = 'countdown'; countdown = 3; raceTime = 0; finishOrder = [];
    loop.pause(false);
  }

  function inputFor(car) {
    var k = GA.keys, pads = GA.pads(), pad = pads[car.id], steer = 0, gas = 0, brake = 0;
    var sets = car.id === 0 ? [['KeyA', 'KeyD', 'KeyW', 'KeyS']] : [['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']];
    if (car.id === 0 && opts.humans === 1) sets.push(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
    sets.forEach(function (s) { if (k[s[0]]) steer -= 1; if (k[s[1]]) steer += 1; if (k[s[2]]) gas = 1; if (k[s[3]]) brake = 1; });
    if (pad) { if (Math.abs(pad.x) > 0.2) steer += pad.x; if (pad.a) gas = 1; if (pad.b) brake = 1; }
    if (car.id === 0) { if (touchKeys.left) steer -= 1; if (touchKeys.right) steer += 1; if (touchKeys.gas) gas = 1; if (touchKeys.brake) brake = 1; }
    return { steer: GA.clamp(steer, -1, 1), gas: gas, brake: brake };
  }
  function cpuInput(car) {
    var look = Math.round(16 + car.v / 14);
    var tgt = track[(car.idx + look) % N];
    var off = Math.sin((raceTime + car.wob) * 0.7) * 10;
    var want = Math.atan2(tgt[1] + off - car.y, tgt[0] + off - car.x);
    var diff = Math.atan2(Math.sin(want - car.a), Math.cos(want - car.a));
    var far = track[(car.idx + look * 2) % N];
    var turnAhead = Math.abs(Math.atan2(Math.sin(Math.atan2(far[1] - tgt[1], far[0] - tgt[0]) - want), Math.cos(Math.atan2(far[1] - tgt[1], far[0] - tgt[0]) - want)));
    var targetV = 330 * car.skill * (turnAhead > 0.9 ? 0.55 : turnAhead > 0.5 ? 0.75 : 1);
    return { steer: GA.clamp(diff * 2.4, -1, 1), gas: car.v < targetV ? 1 : 0, brake: car.v > targetV + 40 ? 1 : 0 };
  }

  function physics(car, inp, dt) {
    var near = nearest(car.x, car.y, car.idx);
    var onRoad = near.dist < HW;
    var maxV = onRoad ? 330 : 120;
    car.v += (inp.gas * 290 - inp.brake * 420) * dt;
    car.v -= car.v * (onRoad ? 0.55 : 2.6) * dt;
    if (!inp.gas && !inp.brake) car.v -= Math.sign(car.v) * Math.min(Math.abs(car.v), 40 * dt);
    car.v = GA.clamp(car.v, -90, maxV);
    car.a += inp.steer * 2.9 * dt * GA.clamp(car.v / 140, -1, 1);
    car.x = GA.clamp(car.x + Math.cos(car.a) * car.v * dt, 8, W - 8);
    car.y = GA.clamp(car.y + Math.sin(car.a) * car.v * dt, 8, H - 8);
    var prev = car.idx;
    car.idx = nearest(car.x, car.y, car.idx).idx;
    if (car.finished) return;
    // Lap logic. Cars start just behind the line: the first forward crossing starts
    // lap timing; later crossings complete a lap only if most of the lap was driven.
    if (prev > N * 0.85 && car.idx < N * 0.15) {
      if (!car.started) { car.started = true; car.lapStart = raceTime; car.maxIdx = 0; }
      else if (car.maxIdx > N * 0.6) {
        var lapTime = raceTime - car.lapStart;
        if (car.best === null || lapTime < car.best) car.best = lapTime;
        car.lap++;
        car.lapStart = raceTime;
        car.maxIdx = 0;
        if (car.lap >= LAPS) { car.finished = true; car.finishTime = raceTime; finishOrder.push(car); }
      }
    } else if (prev < N * 0.15 && car.idx > N * 0.85) {
      // Reversed over the line: undo, so driving forward again doesn't count twice.
      if (car.lap > 0) { car.lap--; car.maxIdx = N; } else car.started = false;
    } else if (car.idx > car.maxIdx && car.idx - car.maxIdx < 60) car.maxIdx = car.idx;
  }
  function collide() {
    for (var i = 0; i < cars.length; i++) for (var j = i + 1; j < cars.length; j++) {
      var a = cars[i], b = cars[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 16) {
        var push = (16 - d) / 2, ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
        a.v *= 0.97; b.v *= 0.97;
      }
    }
  }
  function progress(c) { return c.finished ? 1e9 - c.finishTime : c.lap * N + (c.started ? c.idx : c.idx - N); }
  function update(dt) {
    if (state === 'countdown') { countdown -= dt; if (countdown <= 0) { state = 'race'; raceTime = 0; } return; }
    if (state !== 'race') return;
    raceTime += dt;
    cars.forEach(function (c) { physics(c, c.human && !c.finished ? inputFor(c) : c.finished && c.human ? { steer: 0, gas: 0, brake: 1 } : cpuInput(c), dt); });
    collide();
    var humansDone = cars.filter(function (c) { return c.human; }).every(function (c) { return c.finished; });
    if (humansDone) endRace();
  }
  function fmt(t) { if (t === null || t === undefined) return '–'; var m = Math.floor(t / 60), s = (t % 60).toFixed(2); return (m ? m + ':' : '') + (m && s < 10 ? '0' : '') + s; }
  function endRace() {
    state = 'over';
    var order = cars.slice().sort(function (a, b) { return progress(b) - progress(a); });
    var first = order[0];
    document.getElementById('winner').textContent = first.human ? (first.name === 'You' ? 'You win!' : first.name + ' wins!') : first.name + ' wins';
    document.getElementById('results').innerHTML = order.map(function (c) {
      return '<li>' + c.name + (c.finished ? ' — ' + fmt(c.finishTime) + (c.best ? ' (best lap ' + fmt(c.best) + ')' : '') : ' — still racing') + '</li>';
    }).join('');
    GA.show(over);
  }

  function drawTrack() {
    ctx.fillStyle = '#1d4a2c';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#23573a';
    for (var y = 0; y < H; y += 40) for (var x = (y / 40) % 2 ? 0 : 40; x < W; x += 80) ctx.fillRect(x, y, 40, 40);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function path() { ctx.beginPath(); ctx.moveTo(track[0][0], track[0][1]); for (var i = 1; i < N; i++) ctx.lineTo(track[i][0], track[i][1]); ctx.closePath(); }
    path(); ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = HW * 2 + 10; ctx.stroke();
    path(); ctx.strokeStyle = '#3a3f4b'; ctx.lineWidth = HW * 2; ctx.stroke();
    path(); ctx.setLineDash([14, 18]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
    // start line
    var nx = -Math.sin(startAngle), ny = Math.cos(startAngle);
    for (var k = -4; k < 4; k++) for (var r = 0; r < 2; r++) {
      ctx.fillStyle = (k + r) % 2 ? '#111' : '#fff';
      ctx.fillRect(track[0][0] + nx * k * 10 + Math.cos(startAngle) * r * 6 - 3, track[0][1] + ny * k * 10 + Math.sin(startAngle) * r * 6 - 3, 7, 7);
    }
  }
  function drawCar(c) {
    ctx.save();
    ctx.translate(c.x, c.y); ctx.rotate(c.a);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-10, -5, 22, 12);
    ctx.fillStyle = c.color; ctx.fillRect(-11, -6, 22, 12);
    ctx.fillStyle = 'rgba(10,14,22,0.75)'; ctx.fillRect(1, -4.5, 6, 9);
    ctx.fillStyle = '#ffe9a6'; ctx.fillRect(9, -5, 2, 3); ctx.fillRect(9, 2, 2, 3);
    ctx.restore();
    if (c.human) { ctx.fillStyle = c.color; ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(c.name, c.x, c.y - 14); }
  }
  function draw(paused) {
    drawTrack();
    cars.forEach(drawCar);
    if (state === 'countdown') {
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '900 96px system-ui, sans-serif';
      ctx.fillText(Math.ceil(countdown), W / 2, H / 2 + 30);
    }
    if (state === 'race' || state === 'countdown') {
      var order = cars.slice().sort(function (a, b) { return progress(b) - progress(a); });
      hud.innerHTML = cars.filter(function (c) { return c.human; }).map(function (c) {
        return '<span class="tag p' + (c.id + 1) + '">' + c.name + ' · P' + (order.indexOf(c) + 1) + ' · Lap ' + Math.min(c.lap + 1, LAPS) + '/' + LAPS + (c.best ? ' · Best ' + fmt(c.best) : '') + '</span>';
      }).join('') + '<span class="tag">' + fmt(raceTime) + '</span>';
    }
    if (paused && (state === 'race' || state === 'countdown')) GA.drawPaused(ctx, W, H);
  }

  // Touch buttons
  var touchEl = document.getElementById('touch');
  if (window.matchMedia('(pointer: coarse)').matches) touchEl.hidden = false;
  touchEl.addEventListener('pointerdown', function (e) { var b = e.target.closest('[data-k]'); if (!b) return; e.preventDefault(); touchKeys[b.getAttribute('data-k')] = true; b.classList.add('on'); b.setPointerCapture(e.pointerId); });
  function release(e) { var b = e.target.closest('[data-k]'); if (!b) return; touchKeys[b.getAttribute('data-k')] = false; b.classList.remove('on'); }
  touchEl.addEventListener('pointerup', release);
  touchEl.addEventListener('pointercancel', release);

  GA.rotateHint();
  var loop = GA.loop(update, draw);
  GA.autoPause(loop, function () { return state === 'race' || state === 'countdown'; });
  document.getElementById('start').addEventListener('click', newRace);
  document.getElementById('again').addEventListener('click', newRace);
  document.getElementById('tomenu').addEventListener('click', function () { GA.hide(over); state = 'menu'; GA.show(menu); });
  loop.start();
})();
