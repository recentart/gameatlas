(function () {
  'use strict';
  var COLS = 7, ROWS = 6;
  var boardEl = document.getElementById('board'), statusEl = document.getElementById('status');
  var menu = document.getElementById('menu');
  var opts = GA.options(menu, { mode: 'cpu', diff: 3 });
  var diffRow = document.getElementById('diff-row');
  GA.onOption = function (n, v) { if (n === 'mode') diffRow.hidden = v !== 'cpu'; };
  diffRow.hidden = opts.mode !== 'cpu';
  var NAMES = ['Blue', 'Yellow'];
  var grid, turn, over, history, focusCol = 3, thinking = false;

  // grid[c][r], r = 0 is the bottom row
  function reset() {
    grid = []; for (var c = 0; c < COLS; c++) grid.push([]);
    turn = 0; over = false; history = []; thinking = false;
    render(-1);
  }
  function canDrop(g, c) { return g[c].length < ROWS; }
  function winLine(g, c, r) {
    var who = g[c][r];
    var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (var d = 0; d < 4; d++) {
      var line = [[c, r]];
      for (var s = -1; s <= 1; s += 2) {
        var x = c + dirs[d][0] * s, y = r + dirs[d][1] * s;
        while (x >= 0 && x < COLS && y >= 0 && y < ROWS && g[x][y] === who) { line.push([x, y]); x += dirs[d][0] * s; y += dirs[d][1] * s; }
      }
      if (line.length >= 4) return line;
    }
    return null;
  }
  function full(g) { for (var c = 0; c < COLS; c++) if (g[c].length < ROWS) return false; return true; }

  function play(c) {
    if (over || thinking || !canDrop(grid, c)) return false;
    grid[c].push(turn);
    history.push(c);
    var r = grid[c].length - 1;
    var line = winLine(grid, c, r);
    if (line) { over = true; render(c, line); statusEl.innerHTML = '<span class="' + (turn ? 'p-y' : 'p1') + '">' + label(turn) + '</span> ' + (label(turn) === 'You' ? 'win!' : 'wins!') + ' Press New game to play again.'; return true; }
    if (full(grid)) { over = true; render(c); statusEl.textContent = "It's a draw."; return true; }
    turn = 1 - turn;
    render(c);
    if (opts.mode === 'cpu' && turn === 1) cpuMove();
    return true;
  }
  function label(t) { return opts.mode === 'cpu' ? (t === 0 ? 'You' : 'Computer') : NAMES[t]; }

  // ---- computer: alpha-beta over a window-scoring heuristic ----
  function scoreWindow(a, me) {
    var mine = 0, theirs = 0, empty = 0;
    for (var i = 0; i < 4; i++) { if (a[i] === me) mine++; else if (a[i] === undefined) empty++; else theirs++; }
    if (mine === 4) return 1000;
    if (mine === 3 && empty === 1) return 6;
    if (mine === 2 && empty === 2) return 2;
    if (theirs === 3 && empty === 1) return -8;
    return 0;
  }
  function evaluate(g, me) {
    var s = 0, c, r, i, w;
    for (r = 0; r < ROWS; r++) if (g[3][r] === me) s += 3;
    var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (c = 0; c < COLS; c++) for (r = 0; r < ROWS; r++) for (i = 0; i < 4; i++) {
      var ec = c + dirs[i][0] * 3, er = r + dirs[i][1] * 3;
      if (ec < 0 || ec >= COLS || er < 0 || er >= ROWS) continue;
      w = [];
      for (var k = 0; k < 4; k++) w.push(g[c + dirs[i][0] * k][r + dirs[i][1] * k]);
      s += scoreWindow(w, me);
    }
    return s;
  }
  var ORDER = [3, 2, 4, 1, 5, 0, 6];
  function negamax(g, depth, alpha, beta, who) {
    if (full(g)) return 0;
    if (depth === 0) return evaluate(g, who) - evaluate(g, 1 - who);
    var best = -Infinity;
    for (var i = 0; i < 7; i++) {
      var c = ORDER[i];
      if (!canDrop(g, c)) continue;
      g[c].push(who);
      var v = winLine(g, c, g[c].length - 1) ? 100000 + depth : -negamax(g, depth - 1, -beta, -alpha, 1 - who);
      g[c].pop();
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  function cpuMove() {
    thinking = true;
    statusEl.textContent = 'Computer is thinking…';
    setTimeout(function () {
      var best = -Infinity, choice = 3, depth = opts.diff;
      var moves = ORDER.filter(function (c) { return canDrop(grid, c); });
      if (depth === 1 && Math.random() < 0.35) choice = moves[Math.floor(Math.random() * moves.length)];
      else moves.forEach(function (c) {
        grid[c].push(1);
        var v = winLine(grid, c, grid[c].length - 1) ? 1e6 : -negamax(grid, depth, -Infinity, Infinity, 0);
        grid[c].pop();
        if (v > best) { best = v; choice = c; }
      });
      thinking = false;
      play(choice);
    }, 280);
  }

  // ---- rendering (buttons per column; accessible) ----
  function render(lastCol, line) {
    var html = '';
    for (var c = 0; c < COLS; c++) {
      var free = ROWS - grid[c].length;
      html += '<button class="col" type="button" data-col="' + c + '" role="gridcell" tabindex="' + (c === focusCol ? 0 : -1) + '" aria-label="Column ' + (c + 1) + ', ' + (free ? free + ' free' : 'full') + '"' + (free ? '' : ' aria-disabled="true"') + '>';
      for (var r = ROWS - 1; r >= 0; r--) {
        var v = grid[c][r];
        var cls = 'cell' + (v === undefined ? '' : ' p' + v);
        if (c === lastCol && r === grid[c].length - 1) cls += ' drop';
        if (line && line.some(function (p) { return p[0] === c && p[1] === r; })) cls += ' win';
        html += '<span class="' + cls + '"></span>';
      }
      html += '</button>';
    }
    boardEl.innerHTML = html;
    if (!over && !thinking) statusEl.innerHTML = '<span class="' + (turn ? 'p-y' : 'p1') + '">' + label(turn) + '</span>' + (label(turn) === 'You' ? ' — your move' : ' to play');
    var f = boardEl.querySelector('[data-col="' + focusCol + '"]');
    if (f && boardEl.contains(document.activeElement) || lastCol === -2) f.focus();
  }

  boardEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-col]');
    if (!b) return;
    focusCol = Number(b.getAttribute('data-col'));
    play(focusCol);
    var f = boardEl.querySelector('[data-col="' + focusCol + '"]'); if (f) f.focus();
  });
  boardEl.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      focusCol = (focusCol + (e.key === 'ArrowRight' ? 1 : COLS - 1)) % COLS;
      boardEl.querySelectorAll('[data-col]').forEach(function (b) { b.tabIndex = Number(b.getAttribute('data-col')) === focusCol ? 0 : -1; });
      boardEl.querySelector('[data-col="' + focusCol + '"]').focus();
    }
  });
  document.getElementById('undo').addEventListener('click', function () {
    if (thinking || !history.length) return;
    var steps = opts.mode === 'cpu' ? (turn === 0 || over ? 2 : 1) : 1;
    if (over && opts.mode === 'cpu' && history.length % 2 === 1) steps = 1;
    for (var i = 0; i < steps && history.length; i++) grid[history.pop()].pop();
    over = false;
    turn = history.length % 2;
    render(-1);
  });
  document.getElementById('restart').addEventListener('click', function () { GA.show(menu); });
  document.getElementById('start').addEventListener('click', function () { GA.hide(menu); reset(); render(-2); });
  reset();
})();
