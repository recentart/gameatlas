(function () {
  'use strict';
  GA.padMode = 'dom';
  var svg = document.getElementById('board'), scoresEl = document.getElementById('scores');
  var menu = document.getElementById('menu'), over = document.getElementById('over');
  var opts = GA.options(menu, { mode: 'cpu', size: 4 });
  var N, lines, owner, turn, nPlayers, isCpu, scores, lastLine, busy;
  var NS = 'http://www.w3.org/2000/svg';
  var PAD = 40, SPAN;

  // Lines: horizontal h-r-c (r in 0..N, c in 0..N-1), vertical v-r-c (r in 0..N-1, c in 0..N)
  function allLines() {
    var out = [];
    for (var r = 0; r <= N; r++) for (var c = 0; c < N; c++) out.push('h-' + r + '-' + c);
    for (var r2 = 0; r2 < N; r2++) for (var c2 = 0; c2 <= N; c2++) out.push('v-' + r2 + '-' + c2);
    return out;
  }
  function boxSides(r, c) { return ['h-' + r + '-' + c, 'h-' + (r + 1) + '-' + c, 'v-' + r + '-' + c, 'v-' + r + '-' + (c + 1)]; }
  function boxesOf(id) {
    var p = id.split('-'), t = p[0], r = +p[1], c = +p[2], out = [];
    if (t === 'h') { if (r > 0) out.push([r - 1, c]); if (r < N) out.push([r, c]); }
    else { if (c > 0) out.push([r, c - 1]); if (c < N) out.push([r, c]); }
    return out;
  }
  function count(taken, r, c) { return boxSides(r, c).filter(function (s) { return taken[s]; }).length; }

  function start() {
    GA.hide(menu); GA.hide(over);
    N = opts.size;
    isCpu = opts.mode === 'cpu';
    nPlayers = isCpu ? 2 : Number(opts.mode);
    lines = {}; owner = {}; turn = 0; lastLine = null; busy = false;
    scores = []; for (var i = 0; i < nPlayers; i++) scores.push(0);
    allLinesCache = allLines();
    build();
    update();
    var first = svg.querySelector('.line'); if (first) first.focus();
  }
  function name(i) { return isCpu ? (i === 0 ? 'You' : 'Computer') : GA.NAMES[i]; }

  function el(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function build() {
    SPAN = (400 - PAD * 2) / N;
    svg.setAttribute('viewBox', '0 0 400 400');
    svg.innerHTML = '';
    var gBoxes = el('g', {}), gLines = el('g', {}), gDots = el('g', {});
    svg.append(gBoxes, gLines, gDots);
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      gBoxes.append(el('rect', { class: 'box', id: 'b-' + r + '-' + c, x: PAD + c * SPAN + 4, y: PAD + r * SPAN + 4, width: SPAN - 8, height: SPAN - 8, rx: 6, fill: 'transparent' }));
      var t = el('text', { class: 'box-label', id: 'bl-' + r + '-' + c, x: PAD + c * SPAN + SPAN / 2, y: PAD + r * SPAN + SPAN / 2 });
      gBoxes.append(t);
    }
    allLines().forEach(function (id) {
      var p = id.split('-'), r = +p[1], c = +p[2], x1, y1, x2, y2;
      if (p[0] === 'h') { x1 = PAD + c * SPAN; y1 = y2 = PAD + r * SPAN; x2 = x1 + SPAN; }
      else { x1 = x2 = PAD + c * SPAN; y1 = PAD + r * SPAN; y2 = y1 + SPAN; }
      var g = el('g', { class: 'line', 'data-id': id, tabindex: '0', role: 'button', 'aria-label': (p[0] === 'h' ? 'Horizontal line, row ' + (r + 1) + ', between columns ' + (c + 1) + ' and ' + (c + 2) : 'Vertical line, column ' + (c + 1) + ', between rows ' + (r + 1) + ' and ' + (r + 2)) });
      g.append(el('line', { class: 'hit', x1: x1, y1: y1, x2: x2, y2: y2 }), el('line', { class: 'vis', x1: x1, y1: y1, x2: x2, y2: y2 }));
      gLines.append(g);
    });
    for (var r3 = 0; r3 <= N; r3++) for (var c3 = 0; c3 <= N; c3++) gDots.append(el('circle', { class: 'dot', cx: PAD + c3 * SPAN, cy: PAD + r3 * SPAN, r: 6 }));
  }

  function take(id) {
    if (lines[id] || busy) return false;
    lines[id] = true; owner[id] = turn; lastLine = id;
    var gained = 0;
    boxesOf(id).forEach(function (b) {
      if (count(lines, b[0], b[1]) === 4) {
        gained++;
        scores[turn]++;
        var rect = document.getElementById('b-' + b[0] + '-' + b[1]);
        rect.setAttribute('fill', GA.COLORS[turn]);
        document.getElementById('bl-' + b[0] + '-' + b[1]).textContent = isCpu ? (turn === 0 ? 'You' : 'CPU').slice(0, 3) : GA.NAMES[turn][0];
      }
    });
    if (!gained) turn = (turn + 1) % nPlayers;
    update();
    if (Object.keys(lines).length === 2 * N * (N + 1)) { finish(); return true; }
    if (isCpu && turn === 1) { busy = true; setTimeout(function () { busy = false; take(cpuPick()); }, 450); }
    return true;
  }
  function update() {
    svg.querySelectorAll('.line').forEach(function (g) {
      var id = g.getAttribute('data-id');
      if (lines[id]) {
        g.classList.add('taken');
        g.querySelector('.vis').setAttribute('stroke', GA.COLORS[owner[id]]);
        g.querySelector('.vis').style.stroke = GA.COLORS[owner[id]];
        g.setAttribute('aria-disabled', 'true');
        g.setAttribute('tabindex', '-1');
      }
      g.classList.toggle('last', id === lastLine);
    });
    scoresEl.innerHTML = scores.map(function (s, i) { return '<span class="tag p' + (i + 1) + (i === turn ? ' now' : '') + '">' + name(i) + (i === turn ? ' ▸ ' : ' ') + s + '</span>'; }).join('');
  }
  function finish() {
    var best = Math.max.apply(null, scores);
    var winners = scores.map(function (s, i) { return s === best ? name(i) : null; }).filter(Boolean);
    document.getElementById('winner').textContent = winners.length > 1 ? "It's a tie!" : (winners[0] === 'You' ? 'You win!' : winners[0] + ' wins!');
    document.getElementById('final').textContent = scores.map(function (s, i) { return name(i) + ' ' + s; }).join(' · ');
    setTimeout(function () { GA.show(over); }, 400);
  }

  // Computer: 1) complete a box; 2) play a line that doesn't hand over a box;
  // 3) otherwise give away the smallest chain.
  function cpuPick() {
    var free = allLines().filter(function (id) { return !lines[id]; });
    for (var i = 0; i < free.length; i++) if (boxesOf(free[i]).some(function (b) { return count(lines, b[0], b[1]) === 3; })) return free[i];
    var safe = free.filter(function (id) { return boxesOf(id).every(function (b) { return count(lines, b[0], b[1]) < 2; }); });
    if (safe.length) return safe[Math.floor(Math.random() * safe.length)];
    var best = free[0], bestLoss = Infinity;
    free.forEach(function (id) {
      var sim = Object.assign({}, lines); sim[id] = true;
      var loss = 0, moved = true;
      while (moved) {
        moved = false;
        for (var k = 0; k < allLinesCache.length; k++) {
          var l = allLinesCache[k];
          if (sim[l]) continue;
          if (boxesOf(l).some(function (b) { return count(sim, b[0], b[1]) === 3; })) {
            sim[l] = true;
            boxesOf(l).forEach(function (b) { if (count(sim, b[0], b[1]) === 4) loss++; });
            moved = true;
          }
        }
      }
      if (loss < bestLoss) { bestLoss = loss; best = id; }
    });
    return best;
  }
  var allLinesCache = [];

  svg.addEventListener('click', function (e) {
    var g = e.target.closest('.line');
    if (!g || (isCpu && turn === 1)) return;
    take(g.getAttribute('data-id'));
  });
  svg.addEventListener('keydown', function (e) {
    var dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
    if (dir) { e.preventDefault(); GA.moveFocus(dir, svg); return; }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var g = e.target.closest('.line');
    if (!g || (isCpu && turn === 1)) return;
    e.preventDefault();
    var id = g.getAttribute('data-id');
    if (take(id)) {
      var next = svg.querySelector('.line:not(.taken)');
      if (next) next.focus();
    }
  });
  document.getElementById('start').addEventListener('click', function () { start(); });
  document.getElementById('again').addEventListener('click', function () { start(); });
  document.getElementById('tomenu').addEventListener('click', function () { GA.hide(over); GA.show(menu); });
  document.getElementById('restart').addEventListener('click', function () { GA.show(menu); });
})();
