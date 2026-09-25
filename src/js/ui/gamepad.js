// Browse GameAtlas with a game controller (Xbox Edge, Steam Deck, a pad on a PC).
// D-pad / left stick: move between links and buttons (spatially)
// A: select   B: back / close   Y: search   LB / RB: scroll a screen up / down
// Only active once a controller is connected. While a game has focus the game
// owns the controller; its Select button hands control back here ('ga:leave-game').
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type=hidden]), select, [tabindex="0"]';
const REPEAT_DELAY = 380;
const REPEAT_RATE = 130;

function visibleItems() {
  const vh = window.innerHeight;
  return [...document.querySelectorAll(FOCUSABLE)].filter((el) => {
    if (el.closest('[hidden], [inert], .sprite') || el.matches('.visually-hidden')) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    // Checkboxes are visually hidden; their label is what you see.
    return r.bottom > -vh * 2 && r.top < vh * 3;
  });
}
function targetOf(el) {
  // Styled checkboxes: move between the visible labels, select toggles the input.
  return el.matches('input[type=checkbox]') ? el.closest('label') || el : el;
}
function rect(el) { return targetOf(el).getBoundingClientRect(); }

export function moveFocus(dir, scope = document) {
  const items = visibleItems().filter((el) => scope.contains(el));
  if (!items.length) return;
  const cur = document.activeElement;
  if (!cur || cur === document.body || !items.includes(cur)) {
    const inView = items.find((el) => { const r = rect(el); return r.top >= 0 && r.bottom <= window.innerHeight; }) || items[0];
    inView.focus({ preventScroll: false });
    return;
  }
  const a = rect(cur);
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of items) {
    if (el === cur) continue;
    const b = rect(el);
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const dx = bx - ax, dy = by - ay;
    const main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    if (main <= 4) continue;
    const cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = main + cross * 2.2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) {
    best.focus({ preventScroll: true });
    targetOf(best).scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
}

function openModal() {
  return document.querySelector('dialog[open]') || document.querySelector('.sidebar.is-open') || document.querySelector('.player.is-pseudo-fs');
}
function pressEscape() {
  const t = document.activeElement || document.body;
  t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
}

export function initGamepadNav({ onFirstConnect } = {}) {
  if (!('getGamepads' in navigator)) return;
  let running = false;
  let prev = {};
  let hold = null;
  const html = document.documentElement;

  function read() {
    let pads = [];
    try { pads = [...navigator.getGamepads()].filter((p) => p && p.connected); } catch { return null; }
    if (!pads.length) return null;
    // Merge all pads: any controller can drive the site.
    const s = { dir: null, a: false, b: false, y: false, lb: false, rb: false };
    for (const p of pads) {
      const btn = (n) => !!p.buttons[n]?.pressed;
      const x = p.axes[0] || 0, y = p.axes[1] || 0;
      const d = btn(12) || y < -0.6 ? 'up' : btn(13) || y > 0.6 ? 'down' : btn(14) || x < -0.6 ? 'left' : btn(15) || x > 0.6 ? 'right' : null;
      s.dir = s.dir || d;
      s.a ||= btn(0); s.b ||= btn(1); s.y ||= btn(3); s.lb ||= btn(4); s.rb ||= btn(5);
    }
    return s;
  }

  function act(kind, dir) {
    html.classList.add('pad-active');
    const modal = openModal();
    if (kind === 'dir') moveFocus(dir, modal || document);
    else if (kind === 'a') {
      const el = document.activeElement;
      if (!el || el === document.body) { moveFocus('down'); return; }
      if (el.matches('input[type=search], input[type=text]')) { el.form?.requestSubmit?.(); return; }
      el.click();
    } else if (kind === 'b') {
      if (modal) pressEscape();
      else if (history.length > 1) history.back();
    } else if (kind === 'y') {
      document.querySelector('[data-search-open]')?.click();
    } else if (kind === 'lb' || kind === 'rb') {
      window.scrollBy({ top: (kind === 'rb' ? 1 : -1) * window.innerHeight * 0.8, behavior: 'smooth' });
    }
  }

  function tick(t) {
    const s = read();
    if (!s) { running = false; return; }
    requestAnimationFrame(tick);
    // A focused game (iframe) or fullscreen game owns the controller.
    const ae = document.activeElement;
    if ((ae && ae.tagName === 'IFRAME') || document.fullscreenElement) { prev = s; hold = null; return; }
    if (s.dir && s.dir !== prev.dir) { hold = { dir: s.dir, next: t + REPEAT_DELAY }; act('dir', s.dir); }
    else if (s.dir && hold && t >= hold.next) { hold.next = t + REPEAT_RATE; act('dir', s.dir); }
    else if (!s.dir) hold = null;
    for (const k of ['a', 'b', 'y', 'lb', 'rb']) if (s[k] && !prev[k]) act(k);
    prev = s;
  }
  function start() {
    if (running) return;
    running = true;
    prev = read() || {};
    requestAnimationFrame(tick);
  }
  let greeted = false;
  window.addEventListener('gamepadconnected', () => {
    html.classList.add('pad-active');
    if (!greeted) { greeted = true; onFirstConnect?.(); }
    start();
  });
  window.addEventListener('mousemove', () => html.classList.remove('pad-active'), { passive: true });
  window.addEventListener('touchstart', () => html.classList.remove('pad-active'), { passive: true });
  // A controller that was already connected before this page loaded.
  try { if ([...navigator.getGamepads()].some((p) => p && p.connected)) start(); } catch { /* not allowed */ }
}
