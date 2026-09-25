(function () {
  'use strict';
  var WIN = 5;
  var KEYS = ['KeyQ', 'KeyP', 'KeyZ', 'KeyM'];
  var KEY_LABEL = ['Q', 'P', 'Z', 'M'];
  var COLOR_WORDS = [['RED', '#ff5a5a'], ['BLUE', '#5b8cff'], ['GREEN', '#3ccf7e'], ['YELLOW', '#ffd23f']];
  var zones = document.getElementById('zones'), ruleEl = document.getElementById('rule'), sig = document.getElementById('signal'), sub = document.getElementById('sub');
  var menu = document.getElementById('menu'), over = document.getElementById('over');
  var opts = GA.options(menu, { players: 2 });
  var players = [], round = null, timers = [], roundNo = 0, active = false;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function start() {
    GA.hide(menu); GA.hide(over);
    players = [];
    for (var i = 0; i < opts.players; i++) players.push({ id: i, score: 0 });
    zones.className = 'zones n' + opts.players;
    zones.innerHTML = players.map(function (p) {
      return '<button type="button" class="zone z' + (p.id + 1) + '" data-p="' + p.id + '" aria-label="' + GA.NAMES[p.id] + ' button"><span class="who">' + GA.NAMES[p.id] + ' <span class="key">[' + KEY_LABEL[p.id] + ']</span></span><span class="score" id="sc' + p.id + '">0</span></button>';
    }).join('');
    roundNo = 0;
    active = true;
    nextRound();
  }
  function flashZone(i, cls) {
    var z = zones.querySelector('[data-p="' + i + '"]');
    if (!z) return;
    z.classList.add(cls);
    setTimeout(function () { z.classList.remove(cls); }, 450);
  }
  function setScore(i, delta) {
    players[i].score = Math.max(0, players[i].score + delta);
    document.getElementById('sc' + i).textContent = players[i].score;
  }
  function nextRound() {
    clearTimers();
    var champ = players.filter(function (p) { return p.score >= WIN; })[0];
    if (champ) {
      active = false;
      document.getElementById('winner').textContent = GA.NAMES[champ.id] + ' wins!';
      document.getElementById('final').textContent = players.map(function (p) { return GA.NAMES[p.id] + ' ' + p.score; }).join(' · ');
      ruleEl.textContent = ''; sig.textContent = ''; sub.textContent = '';
      GA.show(over);
      return;
    }
    roundNo++;
    var types = ['go', 'color', 'seven'];
    var type = roundNo === 1 ? 'go' : types[Math.floor(Math.random() * types.length)];
    round = { type: type, armed: false, done: false, out: {} };
    sig.style.color = '';
    sub.textContent = 'Round ' + roundNo;
    if (type === 'go') {
      ruleEl.textContent = 'Press when you see GO!';
      sig.textContent = 'Wait…';
      later(function () { if (!round.done) { round.armed = true; sig.textContent = 'GO!'; sig.style.color = '#3ccf7e'; } }, 1500 + Math.random() * 3000);
    } else if (type === 'color') {
      ruleEl.textContent = 'Press when the word matches its colour';
      sig.textContent = 'Get ready';
      var shown = 0;
      (function tick() {
        if (round.done) return;
        var matchNow = shown >= 2 && Math.random() < 0.35 || shown > 9;
        var w = COLOR_WORDS[Math.floor(Math.random() * 4)];
        var ink = matchNow ? w : COLOR_WORDS.filter(function (c) { return c !== w; })[Math.floor(Math.random() * 3)];
        sig.textContent = w[0];
        sig.style.color = ink[1];
        round.armed = matchNow;
        shown++;
        later(tick, matchNow ? 1400 : 950);
      })();
    } else {
      ruleEl.textContent = 'Press when you see the number 7';
      sig.textContent = 'Get ready';
      var count = 0;
      (function tick() {
        if (round.done) return;
        var seven = count >= 2 && Math.random() < 0.3 || count > 10;
        var n = seven ? 7 : [1, 2, 3, 4, 5, 6, 8, 9][Math.floor(Math.random() * 8)];
        sig.textContent = String(n);
        sig.style.color = '';
        round.armed = seven;
        count++;
        later(tick, seven ? 1300 : 850);
      })();
    }
  }
  function press(i) {
    if (!active || !round || round.done || i >= players.length || round.out[i]) return;
    if (round.armed) {
      round.done = true;
      setScore(i, 1);
      flashZone(i, 'good');
      sub.textContent = GA.NAMES[i] + ' scores!';
      clearTimers();
      later(nextRound, 1500);
    } else {
      round.out[i] = true;
      setScore(i, -1);
      flashZone(i, 'bad');
      sub.textContent = GA.NAMES[i] + ' pressed too early and sits this round out';
      if (Object.keys(round.out).length >= players.length) {
        round.done = true;
        clearTimers();
        sub.textContent = 'Everyone jumped the gun. Nobody scores.';
        later(nextRound, 1600);
      }
    }
  }
  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var i = KEYS.indexOf(e.code);
    if (i >= 0) { e.preventDefault(); press(i); }
  });
  zones.addEventListener('pointerdown', function (e) {
    var z = e.target.closest('[data-p]');
    if (z) { e.preventDefault(); press(Number(z.getAttribute('data-p'))); }
  });
  zones.addEventListener('click', function (e) { if (e.detail === 0) { var z = e.target.closest('[data-p]'); if (z) press(Number(z.getAttribute('data-p'))); } });
  document.addEventListener('visibilitychange', function () { if (document.hidden && active) { clearTimers(); round && (round.done = true); sub.textContent = 'Paused — restarting the round'; later(nextRound, 800); } });
  document.getElementById('start').addEventListener('click', start);
  document.getElementById('again').addEventListener('click', start);
  document.getElementById('tomenu').addEventListener('click', function () { GA.hide(over); GA.show(menu); });
})();
