(function () {
  'use strict';
  var SHAPES = {
    circle: '<circle cx="50" cy="50" r="36"/>',
    square: '<rect x="16" y="16" width="68" height="68" rx="8"/>',
    triangle: '<path d="M50 12 90 86H10Z"/>',
    star: '<path d="m50 8 12 27 29 3-22 20 7 29-26-15-26 15 7-29L9 38l29-3Z"/>',
    heart: '<path d="M50 86S12 62 12 36a19 19 0 0 1 38-6 19 19 0 0 1 38 6c0 26-38 50-38 50Z"/>',
    diamond: '<path d="M50 8 88 50 50 92 12 50Z"/>',
  };
  var COLORS = [['blue', '#3d6cf0'], ['orange', '#f07a26'], ['green', '#1fa56b'], ['purple', '#8a4cd8'], ['red', '#e0404f'], ['teal', '#118a95']];
  var FACES = [];
  Object.keys(SHAPES).forEach(function (s, si) { COLORS.forEach(function (c, ci) { FACES.push({ name: c[0] + ' ' + s, svg: '<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="' + c[1] + '">' + SHAPES[s] + '</g></svg>', order: (si * 7 + ci * 3) % 36 }); }); });

  var boardEl = document.getElementById('board'), scoresEl = document.getElementById('scores');
  var menu = document.getElementById('menu'), over = document.getElementById('over');
  var opts = GA.options(menu, { players: 1, size: 8 });
  var cards, cols, up, current, scores, moves, locked, focusIdx, t0;

  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function start() {
    GA.hide(menu); GA.hide(over);
    var faces = shuffle(FACES.slice()).slice(0, opts.size);
    cards = shuffle(faces.concat(faces).map(function (f, i) { return { face: f, id: i, done: false }; }));
    cols = opts.size === 8 ? 4 : 6;
    up = []; current = 0; moves = 0; locked = false; focusIdx = 0; t0 = Date.now();
    scores = []; for (var i = 0; i < opts.players; i++) scores.push(0);
    render();
    boardEl.querySelector('.card').focus();
  }
  function size() {
    var rows = cards.length / cols;
    var s = Math.floor(Math.min((window.innerWidth - 32 - (cols - 1) * 8) / cols, (window.innerHeight - 130 - (rows - 1) * 8) / rows));
    return Math.max(40, Math.min(s, 130));
  }
  function render() {
    boardEl.style.gridTemplateColumns = 'repeat(' + cols + ', auto)';
    boardEl.style.setProperty('--s', size() + 'px');
    boardEl.innerHTML = cards.map(function (c, i) {
      var shown = c.done || up.indexOf(i) >= 0;
      return '<button type="button" class="card' + (c.done ? ' done' : shown ? ' up' : '') + '" data-i="' + i + '" tabindex="' + (i === focusIdx ? 0 : -1) + '" aria-label="' + (shown ? c.face.name : 'Face-down card') + ', row ' + (Math.floor(i / cols) + 1) + ' column ' + (i % cols + 1) + (c.done ? ', matched' : '') + '"' + (c.done ? ' aria-disabled="true"' : '') + '><span class="in"><span class="b"></span><span class="f">' + c.face.svg + '</span></span></button>';
    }).join('');
    renderScores();
  }
  function renderScores() {
    if (opts.players === 1) {
      scoresEl.innerHTML = '<span class="tag">Moves ' + moves + '</span><span class="tag">Pairs ' + scores[0] + ' / ' + opts.size + '</span>';
    } else {
      scoresEl.innerHTML = scores.map(function (s, i) { return '<span class="tag p' + (i + 1) + (i === current ? ' now' : '') + '">' + GA.NAMES[i] + (i === current ? ' ▸ ' : ' ') + s + '</span>'; }).join('');
    }
  }
  function flip(i) {
    var c = cards[i];
    if (locked || c.done || up.indexOf(i) >= 0) return;
    up.push(i);
    var el = boardEl.querySelector('[data-i="' + i + '"]');
    el.classList.add('up');
    el.setAttribute('aria-label', c.face.name);
    if (up.length < 2) return;
    moves++;
    var a = cards[up[0]], b = cards[up[1]];
    if (a.face === b.face) {
      a.done = b.done = true;
      scores[current]++;
      up = [];
      render();
      focusCard(focusIdx);
      if (cards.every(function (x) { return x.done; })) finish();
    } else {
      locked = true;
      renderScores();
      setTimeout(function () {
        up = [];
        locked = false;
        if (opts.players > 1) current = (current + 1) % opts.players;
        render();
        focusCard(focusIdx);
      }, 900);
    }
  }
  function finish() {
    var title, detail;
    if (opts.players === 1) {
      title = 'Board cleared!';
      detail = moves + ' moves in ' + Math.round((Date.now() - t0) / 1000) + ' seconds.';
    } else {
      var best = Math.max.apply(null, scores);
      var winners = scores.map(function (s, i) { return s === best ? GA.NAMES[i] : null; }).filter(Boolean);
      title = winners.length > 1 ? "It's a tie: " + winners.join(' & ') : winners[0] + ' wins!';
      detail = scores.map(function (s, i) { return GA.NAMES[i] + ' ' + s; }).join(' · ');
    }
    setTimeout(function () {
      document.getElementById('winner').textContent = title;
      document.getElementById('final').textContent = detail;
      GA.show(over);
    }, 500);
  }
  function focusCard(i) {
    focusIdx = i;
    boardEl.querySelectorAll('.card').forEach(function (b) { b.tabIndex = Number(b.getAttribute('data-i')) === i ? 0 : -1; });
    var el = boardEl.querySelector('[data-i="' + i + '"]');
    if (el) el.focus();
  }
  boardEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-i]');
    if (!b) return;
    focusIdx = Number(b.getAttribute('data-i'));
    flip(focusIdx);
  });
  boardEl.addEventListener('keydown', function (e) {
    var d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
    if (d === undefined) return;
    e.preventDefault();
    var n = focusIdx + d;
    if (n >= 0 && n < cards.length) focusCard(n);
  });
  window.addEventListener('resize', function () { if (cards) boardEl.style.setProperty('--s', size() + 'px'); });
  document.getElementById('start').addEventListener('click', start);
  document.getElementById('again').addEventListener('click', start);
  document.getElementById('tomenu').addEventListener('click', function () { GA.hide(over); GA.show(menu); });
  document.getElementById('restart').addEventListener('click', function () { GA.show(menu); });
})();
