// Entry point for every page: shared header behaviour, saves, search dialog,
// then the page-specific controller.
import { createStore, STORAGE_KEY } from './lib/storage.js';
import { initAds } from './ui/ads.js';
import { initSearchDialog, initHeroSearch } from './ui/searchbox.js';

function localStorageOrThrowing() {
  try { return window.localStorage; } catch {
    return { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  }
}
export const store = createStore(localStorageOrThrowing());

// ---- toast ------------------------------------------------------------------
let toastTimer;
export function toast(message) {
  const el = document.querySelector('[data-toast]');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---- theme ------------------------------------------------------------------
const media = window.matchMedia('(prefers-color-scheme: dark)');
function effectiveTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  return t || (media.matches ? 'dark' : 'light');
}
function syncThemeButton() {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  for (const b of document.querySelectorAll('[data-theme-toggle]')) b.setAttribute('aria-label', `Switch to ${next} theme`);
}
function initTheme() {
  syncThemeButton();
  media.addEventListener?.('change', syncThemeButton);
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('[data-theme-toggle]')) return;
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    // Choosing the same theme as the system clears the override.
    const systemTheme = media.matches ? 'dark' : 'light';
    if (next === systemTheme) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', next);
    store.setPref('theme', next === systemTheme ? 'system' : next);
    syncThemeButton();
  });
}

// ---- mobile menu ------------------------------------------------------------
function initMenu() {
  const btn = document.querySelector('[data-menu-toggle]');
  const nav = document.getElementById('mobile-nav');
  if (!btn || !nav) return;
  const set = (open) => { nav.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', () => set(nav.hidden));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !nav.hidden) { set(false); btn.focus(); } });
  window.matchMedia('(min-width: 900px)').addEventListener?.('change', () => set(false));
}

// ---- saves ------------------------------------------------------------------
export function refreshSaves(root = document) {
  const favs = new Set(store.get().favorites.map((f) => f.slug));
  for (const b of root.querySelectorAll('[data-save]')) {
    const on = favs.has(b.dataset.save);
    b.setAttribute('aria-pressed', String(on));
    const title = b.closest('[data-slug],[data-game]')?.querySelector('.card-title a, h1')?.textContent || 'game';
    if (b.classList.contains('icon-btn')) b.setAttribute('aria-label', `${on ? 'Remove' : 'Save'} ${title}${on ? ' from saved games' : ''}`);
    const text = b.querySelector('.save-text');
    if (text) text.textContent = on ? 'Saved' : 'Save';
  }
  const count = document.querySelector('[data-saved-count]');
  if (count) {
    count.hidden = favs.size === 0;
    count.textContent = favs.size > 99 ? '99+' : String(favs.size);
    count.parentElement.setAttribute('aria-label', favs.size ? `Saved games (${favs.size})` : 'Saved games');
  }
}

function initSaves() {
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-save]');
    if (!btn) return;
    ev.preventDefault();
    const saved = store.toggleFavorite(btn.dataset.save);
    toast(saved ? 'Saved. Find it under Saved games.' : 'Removed from saved games.');
  });
  store.subscribe(() => refreshSaves());
  refreshSaves();
  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) store.refresh(); });
  if (!store.isPersistent()) document.querySelector('[data-storage-note]')?.removeAttribute('hidden');
}

// Opening an external game counts as "recently played".
function initExternalPlays() {
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-play-external]');
    if (a) store.addRecent(a.dataset.playExternal);
  });
}

// ---- keyboard shortcut ------------------------------------------------------
function initShortcut(openSearch) {
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.closest?.('input, textarea, select, [contenteditable="true"], dialog[open]')) return;
    e.preventDefault();
    const inline = document.querySelector('[data-browse-search] input, [data-hero-search] input');
    if (inline) { inline.focus(); inline.select(); } else openSearch();
  });
}

// ---- boot -------------------------------------------------------------------
initTheme();
initMenu();
initSaves();
initExternalPlays();
const openSearch = initSearchDialog();
initShortcut(openSearch);
initHeroSearch();
initAds();

const PAGES = {
  browse: () => import('./pages/browse.js'),
  game: () => import('./pages/game.js'),
  saved: () => import('./pages/saved.js'),
  account: () => import('./pages/account.js'),
  home: () => import('./pages/home.js'),
  notfound: () => import('./pages/notfound.js'),
};
const loader = PAGES[document.body.dataset.page];
if (loader) loader().then((m) => m.init?.()).catch((err) => console.error('Page script failed', err));
