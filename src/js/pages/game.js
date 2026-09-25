// Game page: click-to-load player for GameAtlas Originals, fullscreen, restart,
// and recently-played tracking.
import { store } from '../app.js';

export function init() {
  const player = document.querySelector('[data-player]');
  if (!player) return;
  const frame = player.querySelector('[data-player-frame]');
  const fsBtn = player.querySelector('[data-fullscreen]');
  const restartBtn = player.querySelector('[data-player-restart]');
  const exitBar = player.querySelector('[data-exit-bar]');
  const { src, title, slug } = player.dataset;
  let iframe = null;

  function start() {
    if (iframe) { iframe.focus(); return; }
    iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = `${title} (game)`;
    // Our own games only. Sandboxed so a game can never navigate or open pop-ups over GameAtlas.
    iframe.setAttribute('sandbox', 'allow-scripts allow-pointer-lock');
    iframe.setAttribute('allow', 'fullscreen; gamepad');
    iframe.setAttribute('allowfullscreen', '');
    iframe.addEventListener('load', () => { try { iframe.contentWindow.focus(); } catch { /* opaque origin */ } iframe.focus(); });
    frame.replaceChildren(iframe);
    fsBtn.disabled = false;
    restartBtn.disabled = false;
    store.addRecent(slug);
    player.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    iframe.focus();
  }

  document.addEventListener('click', (ev) => { if (ev.target.closest('[data-player-start]')) start(); });
  restartBtn.addEventListener('click', () => { if (iframe) { iframe.src = src; iframe.focus(); } });

  // ---- fullscreen ----------------------------------------------------------
  const canFullscreen = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  function setLabel(on) {
    fsBtn.setAttribute('aria-pressed', String(on));
    fsBtn.querySelector('span').textContent = on ? 'Exit fullscreen' : 'Fullscreen';
  }
  function enterPseudo() {
    player.classList.add('is-pseudo-fs');
    exitBar.hidden = false;
    document.body.classList.add('pseudo-fs-open');
    setLabel(true);
    iframe?.focus();
  }
  function exitPseudo() {
    player.classList.remove('is-pseudo-fs');
    exitBar.hidden = true;
    document.body.classList.remove('pseudo-fs-open');
    setLabel(false);
    fsBtn.focus();
  }
  fsBtn.addEventListener('click', async () => {
    if (!iframe) start();
    if (fsElement()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    if (!canFullscreen) { enterPseudo(); return; }
    try {
      await (frame.requestFullscreen || frame.webkitRequestFullscreen).call(frame, { navigationUI: 'hide' });
      iframe?.focus();
    } catch { enterPseudo(); }
  });
  const onChange = () => {
    const on = fsElement() === frame;
    setLabel(on);
    if (!on) fsBtn.focus(); // back on the normal page, focus where the user left
  };
  document.addEventListener('fullscreenchange', onChange);
  document.addEventListener('webkitfullscreenchange', onChange);
  player.querySelector('[data-fullscreen-exit]').addEventListener('click', exitPseudo);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && player.classList.contains('is-pseudo-fs')) exitPseudo(); });

  if (location.hash === '#play') start();
}
