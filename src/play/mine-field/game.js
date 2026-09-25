(function () {
  'use strict';
  GA.padMode = 'dom';
  var MINES = { 9: 10, 12: 22, 16: 40 };
  var boardEl = document.getElementById('board'), minesEl = document.getElementById('mines'), timeEl = document.getElementById('time');
  var statusEl = document.getElementById('status'), modeBtn = document.getElementById('mode');
  var menu = document.getElementById('menu'), over = document.getElementById('over');
  var opts = GA.options(menu, { size: 9 });
  var N, cells, placed, done, flags, focusIdx, t0, timer, flagMode = false, pressTimer = null, longPressed = false;

  function start() {
    GA.hide(menu); GA.hide(over);
    N = opts.size; placed = false; done = false; flags = 0; focusIdx = Math.floor(N * N / 2); t0 = 0;
    cells = []; for (var i = 0; i < N * N; i++) cells.push({ mine: false, open: false, flag: false, n: 0 });
    clearInterval(timer); timeEl.textContent = '0:00';
    statusEl.textContent = '';
    build(); update(); focus(focusIdx);
  }
  function neighbours(i) {
    var r = Math.floor(i / N), c = i % N, out = [];
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      var rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < N && cc < N) out.push(rr * N + cc);
    }
    return out;
  }
  function place(safe) {
    var avoid = neighbours(safe).concat(safe), pool = [];
    for (var i = 0; i < N * N; i++) if (avoid.indexOf(i) < 0) pool.push(i);
    for (var k = 0; k < MINES[N]; k++) { var j = Math.floor(Math.random() * pool.length); cells[pool.splice(j, 1)[0]].mine = true; }
    cells.forEach(function (cell, i) { cell.n = neighbours(i).filter(function (x) { return cells[x].mine; }).length; });
    placed = true; t0 = Date.now();
    timer = setInterval(function () { var s = Math.floor((Date.now() - t0) / 1000); timeEl.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 500);
  }
  function reveal(i) {
    if (done) return;
    var cell = cells[i];
    if (cell.flag) return;
    if (cell.open) { chord(i); return; }
    if (!placed) place(i);
    if (cell.mine) { lose(i); return; }
    var stack = [i];
    while (stack.length) {
      var k = stack.pop(), c = cells[k];
      if (c.open || c.flag) continue;
      c.open = true;
      if (c.n === 0) neighbours(k).forEach(function (x) { if (!cells[x].open) stack.push(x); });
    }
    update();
    if (cells.every(function (c) { return c.mine || c.open; })) win();
  }
  // Revealing an open number whose flags are all placed opens its other neighbours.
  function chord(i) {
    var nb = neighbours(i), f = nb.filter(function (x) { return cells[x].flag; }).length;
    if (f !== cells[i].n) return;
    nb.forEach(function (x) { if (!cells[x].open && !cells[x].flag) reveal(x); });
  }
  function toggleFlag(i) {
    var c = cells[i];
    if (done || c.open) return;
    c.flag = !c.flag; flags += c.flag ? 1 : -1;
    update();
  }
  function lose(i) {
    done = true; clearInterval(timer);
    cells.forEach(function (c) { if (c.mine) c.open = true; });
    update();
    var el = boardEl.querySelector('[data-i="' + i + '"]'); if (el) el.classList.add('boom');
    statusEl.textContent = 'Boom! You hit a mine.';
    setTimeout(function () { finish('Boom!', 'You hit a mine. Try again?'); }, 900);
  }
  function win() {
    done = true; clearInterval(timer);
    finish('Cleared!', 'Every safe square found in ' + timeEl.textContent + '.');
  }
  function finish(title, detail) {
    document.getElementById('winner').textContent = title;
    document.getElementById('final').textContent = detail;
    GA.show(over);
  }
  function size() {
    var s = Math.floor(Math.min((window.innerWidth - 24) / N, (window.innerHeight - 150) / N)) - 2;
    return Math.max(22, Math.min(s, 48));
  }
  function build() {
    boardEl.style.gridTemplateColumns = 'repeat(' + N + ', auto)';
    boardEl.style.setProperty('--s', size() + 'px');
    var html = '';
    for (var i = 0; i < N * N; i++) html += '<button type="button" class="cell" data-i="' + i + '" role="gridcell" tabindex="-1"></button>';
    boardEl.innerHTML = html;
  }
  function update() {
    minesEl.textContent = 'Mines ' + (MINES[N] - flags);
    cells.forEach(function (c, i) {
      var el = boardEl.children[i];
      el.className = 'cell' + (c.open ? ' open' + (c.mine ? ' mine' : c.n ? ' n' + c.n : '') : '') + (c.flag && !c.open ? ' flag' : '');
      el.textContent = c.open ? (c.mine ? '✹' : c.n || '') : '';
      var r = Math.floor(i / N) + 1, col = i % N + 1;
      el.setAttribute('aria-label', 'Row ' + r + ', column ' + col + ': ' + (c.open ? (c.mine ? 'mine' : c.n ? c.n + ' nearby' : 'empty') : c.flag ? 'flagged' : 'hidden'));
      el.tabIndex = i === focusIdx ? 0 : -1;
    });
  }
  function focus(i) {
    focusIdx = i;
    Array.prototype.forEach.call(boardEl.children, function (b, k) { b.tabIndex = k === i ? 0 : -1; });
    boardEl.children[i].focus();
  }
  boardEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-i]'); if (!b) return;
    if (longPressed) { longPressed = false; return; }
    focusIdx = Number(b.getAttribute('data-i'));
    if (flagMode) toggleFlag(focusIdx); else reveal(focusIdx);
    focus(focusIdx);
  });
  boardEl.addEventListener('contextmenu', function (e) {
    var b = e.target.closest('[data-i]'); if (!b) return;
    e.preventDefault(); toggleFlag(Number(b.getAttribute('data-i')));
  });
  boardEl.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse') return;
    var b = e.target.closest('[data-i]'); if (!b) return;
    longPressed = false;
    pressTimer = setTimeout(function () { longPressed = true; toggleFlag(Number(b.getAttribute('data-i'))); if (navigator.vibrate) navigator.vibrate(30); }, 420);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { boardEl.addEventListener(t, function () { clearTimeout(pressTimer); }); });
  boardEl.addEventListener('keydown', function (e) {
    var d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -N, ArrowDown: N }[e.key];
    if (d !== undefined) {
      e.preventDefault();
      var n = focusIdx + d;
      if ((e.key === 'ArrowLeft' && focusIdx % N === 0) || (e.key === 'ArrowRight' && focusIdx % N === N - 1)) return;
      if (n >= 0 && n < N * N) focus(n);
    } else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFlag(focusIdx); }
  });
  GA.onPad(function (pad, button) { if (button === 'x' && menu.hidden && over.hidden) { toggleFlag(focusIdx); return true; } });
  modeBtn.addEventListener('click', function () { flagMode = !flagMode; modeBtn.setAttribute('aria-pressed', String(flagMode)); modeBtn.textContent = 'Tap to: ' + (flagMode ? 'Flag' : 'Reveal'); });
  window.addEventListener('resize', function () { if (cells) boardEl.style.setProperty('--s', size() + 'px'); });
  document.getElementById('start').addEventListener('click', start);
  document.getElementById('again').addEventListener('click', start);
  document.getElementById('tomenu').addEventListener('click', function () { GA.hide(over); GA.show(menu); });
  document.getElementById('restart').addEventListener('click', function () { GA.show(menu); });
  GA.debug = function () { return { open: cells ? cells.filter(function (c) { return c.open; }).length : 0, flags: flags, done: done }; };
})();
