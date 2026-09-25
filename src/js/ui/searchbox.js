// Instant-search combobox used by the header search dialog and the home hero.
// ARIA combobox pattern: input[role=combobox] + ul[role=listbox], arrow keys to move,
// Enter to open the highlighted game or all results, Escape to close.
import { loadCatalog } from '../lib/catalog.js';
import { search } from '../lib/search.js';
import { emptyFilters } from '../lib/filters.js';
import { escapeHtml as e, playersLabel, modeSummary, imageFor } from '../lib/format.js';

export function interpretText(parsed) {
  if (!parsed.chips.length) return '';
  return `Looking for: ${parsed.chips.map((c) => `<span class="chip">${e(c.label)}</span>`).join(' ')}`;
}

function attachCombobox({ input, list, interpret, popup = false, max = 6 }) {
  let items = [];
  let active = -1;
  let seq = 0;
  const allUrl = () => `/discover?q=${encodeURIComponent(input.value.trim())}`;

  function close() {
    if (popup) list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }
  function highlight(i) {
    active = i;
    list.querySelectorAll('[role="option"]').forEach((li, idx) => li.setAttribute('aria-selected', String(idx === i)));
    const el = list.querySelector(`[role="option"]:nth-child(${i + 1})`);
    if (el) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  }
  async function update() {
    const q = input.value.trim();
    const my = ++seq;
    if (!q) {
      list.innerHTML = '';
      items = [];
      if (interpret) interpret.hidden = true;
      close();
      return;
    }
    let cat;
    try { cat = await loadCatalog(); } catch { return; }
    if (my !== seq) return;
    const r = search(cat.games, { q, filters: emptyFilters() }, cat.genreLabels);
    const top = r.results.slice(0, max);
    items = [...top.map((g) => ({ href: `/games/${g.slug}`, game: g })), { href: allUrl(), all: true, count: r.results.length }];
    list.innerHTML = items.map((it, i) => it.all
      ? `<li role="option" id="${list.id}-o${i}" aria-selected="false" data-href="${e(it.href)}"><span class="s-all">${it.count ? `See all ${it.count} result${it.count === 1 ? '' : 's'}` : 'No matches — browse all games'} for “${e(q)}” →</span></li>`
      : `<li role="option" id="${list.id}-o${i}" aria-selected="false" data-href="${e(it.href)}"><img src="${e(imageFor(it.game, 320).src)}" alt="" width="64" height="36"><span><span class="s-title">${e(it.game.title)}</span><span class="s-meta">${e(playersLabel(it.game.players))} · ${e(modeSummary(it.game))} · ${e(it.game.genres.map((g) => cat.genreLabels[g]).slice(0, 2).join(', '))}</span></span></li>`).join('');
    if (interpret) {
      const html = interpretText(r.parsed);
      interpret.innerHTML = r.fallback ? `${html} <span>(no exact keyword match)</span>` : html;
      interpret.hidden = !html;
    }
    if (popup) list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    active = -1;
  }
  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(update, 60); });
  input.addEventListener('focus', () => { if (input.value.trim()) update(); });
  input.addEventListener('keydown', (ev) => {
    const n = items.length;
    if (ev.key === 'ArrowDown' && n) { ev.preventDefault(); if (popup) list.hidden = false; highlight((active + 1) % n); }
    else if (ev.key === 'ArrowUp' && n) { ev.preventDefault(); highlight((active - 1 + n) % n); }
    else if (ev.key === 'Enter') {
      if (active >= 0 && items[active]) { ev.preventDefault(); location.href = items[active].href; }
    } else if (ev.key === 'Escape' && popup && !list.hidden) { ev.preventDefault(); ev.stopPropagation(); close(); }
  });
  list.addEventListener('mousedown', (ev) => ev.preventDefault()); // keep focus in the input
  list.addEventListener('click', (ev) => {
    const li = ev.target.closest('[role="option"]');
    if (li) location.href = li.dataset.href;
  });
  if (popup) input.addEventListener('blur', () => setTimeout(close, 120));
  return { update, clear() { input.value = ''; update(); } };
}

/** Header search dialog. Returns an open() function. */
export function initSearchDialog() {
  const dialog = document.getElementById('search-dialog');
  if (!dialog) return () => {};
  const input = dialog.querySelector('input');
  const box = attachCombobox({ input, list: dialog.querySelector('[role="listbox"]'), interpret: dialog.querySelector('[data-interpret]') });
  let opener = null;
  function open() {
    opener = document.activeElement;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    input.focus();
    input.select();
    loadCatalog().catch(() => {});
  }
  document.addEventListener('click', (ev) => {
    const trigger = ev.target.closest('[data-search-open]');
    if (trigger) { ev.preventDefault(); open(); }
  });
  dialog.querySelector('[data-dialog-close]')?.addEventListener('click', () => dialog.close());
  // Escape closes straight away (a search field would otherwise just clear itself first).
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); dialog.close(); } });
  dialog.addEventListener('click', (ev) => { if (ev.target === dialog) dialog.close(); }); // backdrop
  dialog.addEventListener('close', () => { opener?.focus?.(); });
  for (const b of dialog.querySelectorAll('[data-example]')) b.addEventListener('click', () => { input.value = b.textContent; box.update(); input.focus(); });
  return open;
}

export function initHeroSearch() {
  const form = document.querySelector('[data-hero-search]');
  if (!form) return;
  attachCombobox({
    input: form.querySelector('input'),
    list: form.querySelector('[role="listbox"]'),
    interpret: form.querySelector('[data-interpret]'),
    popup: true,
  });
}
