// Browse pages (Discover, category pages, Multiplayer, New): instant filtering,
// search, URL state, facet counts, collapsible sidebar and mobile drawer.
import { store, refreshSaves, toast } from '../app.js';
import { loadCatalog } from '../lib/catalog.js';
import { search, normalize } from '../lib/search.js';
import {
  GROUPS, emptyFilters, mergeFilters, cloneFilters, facetCount, parseState, serializeState, activeCount, PARAM,
} from '../lib/filters.js';
import { renderCard } from '../ui/card.js';
import { escapeHtml as e } from '../lib/format.js';
import { icon } from '../ui/icons.js';

export async function init() {
  const root = document.querySelector('[data-browse]');
  if (!root) return;
  const form = root.querySelector('[data-filters-form]');
  const grid = root.querySelector('[data-grid]');
  const q = root.querySelector('[data-browse-search] input');
  const sortSelect = root.querySelector('[data-sort-select]');
  const summary = root.querySelector('[data-result-summary]');
  const chipsEl = root.querySelector('[data-active-chips]');
  const interpretEl = root.querySelector('[data-interpret]');
  const empty = root.querySelector('[data-empty]');
  const sidebar = root.querySelector('.sidebar');
  const base = mergeFilters(emptyFilters(), JSON.parse(root.dataset.base || '{}'));
  const defaultSort = root.dataset.sort || 'relevance';
  const showYear = root.hasAttribute('data-show-year');

  let cat;
  try { cat = await loadCatalog(); } catch {
    summary.textContent = 'Filters could not load. The list below shows every game on this page.';
    return;
  }
  const labelOf = buildLabels(cat.taxonomy);

  // ---- state -------------------------------------------------------------
  const fromUrl = parseState(location.search, cat.taxonomy);
  const state = {
    q: fromUrl.q,
    filters: mergeFilters(base, fromUrl.filters),
    sort: new URLSearchParams(location.search).has('sort') ? fromUrl.sort : defaultSort,
  };
  q.value = state.q;

  function writeUrl() {
    const qs = serializeState({ ...state, sort: state.sort === defaultSort ? 'relevance' : state.sort }, base);
    const url = `${location.pathname}${qs}`;
    if (url !== location.pathname + location.search) history.replaceState(null, '', url);
  }

  // ---- render ------------------------------------------------------------
  let lastKey = '';
  function render() {
    const r = search(cat.games, state, cat.genreLabels);
    const key = r.results.map((g) => g.slug).join(',') + (showYear ? 'y' : '');
    if (key !== lastKey) {
      grid.innerHTML = r.results.map((g) => renderCard(g, { genreLabels: cat.genreLabels, showYear })).join('');
      refreshSaves(grid);
      lastKey = key;
    }
    const n = r.results.length;
    summary.innerHTML = `<strong>${n}</strong> ${n === 1 ? 'game' : 'games'}`;
    grid.hidden = n === 0;
    empty.hidden = n !== 0;
    if (n === 0) renderEmpty(r);
    for (const el of root.querySelectorAll('[data-result-number]')) el.textContent = String(n);

    // Interpretation of the typed query, each part removable.
    if (r.parsed.chips.length) {
      interpretEl.innerHTML = `<span>Showing:</span> ${r.parsed.chips.map((c, i) => `<span class="chip">${e(c.label)}<button type="button" data-drop-phrase="${i}" aria-label="Remove ${e(c.label)} from search">${icon('x')}</button></span>`).join('')}${r.parsed.terms.length ? ` <span>matching “${e(r.parsed.terms.join(' '))}”</span>` : ''}${r.fallback ? ' <span>— no exact keyword match, showing the closest games</span>' : ''}`;
      interpretEl.hidden = false;
      interpretEl._chips = r.parsed.chips;
    } else interpretEl.hidden = true;

    // Facet counts and checkbox state reflect explicit filters + the parsed query.
    const effective = r.effective;
    for (const input of form.querySelectorAll('input[type="checkbox"]')) {
      const group = input.name, value = input.value;
      input.checked = state.filters[group].includes(value);
      const countEl = form.querySelector(`[data-count="${group}:${cssEscape(value)}"]`);
      if (countEl) {
        const c = facetCount(cat.games, effective, group, value);
        countEl.textContent = String(c);
        input.closest('label').classList.toggle('is-zero', c === 0 && !input.checked);
      }
    }
    for (const x of form.querySelectorAll('.fgroup-genres .extra')) x.classList.toggle('has-checked', x.querySelector('input').checked);

    // Active filter chips (explicit only; the typed query has its own line).
    const chips = [];
    for (const g of GROUPS) for (const v of state.filters[g]) {
      const isBase = base[g].includes(v);
      chips.push(`<li><span class="chip">${e(labelOf(g, v))}<button type="button" data-remove="${g}:${e(v)}" aria-label="Remove filter ${e(labelOf(g, v))}${isBase ? ' (leaves this category)' : ''}">${icon('x')}</button></span></li>`);
    }
    if (chips.length > 1) chips.push('<li><button type="button" class="clear-chip" data-clear-filters>Clear all</button></li>');
    chipsEl.innerHTML = chips.join('');
    const count = activeCount(state.filters);
    for (const b of root.querySelectorAll('[data-active-count]')) { b.textContent = String(count); b.hidden = count === 0; }
    writeUrl();
  }

  function renderEmpty(r) {
    const actions = [];
    const without = (g, v) => { const f = cloneFilters(state.filters); f[g] = f[g].filter((x) => x !== v); return search(cat.games, { ...state, filters: f }, cat.genreLabels).results.length; };
    for (const g of GROUPS) for (const v of state.filters[g]) {
      const n = without(g, v);
      if (n) actions.push({ html: `Remove “${e(labelOf(g, v))}” <span class="count">${n}</span>`, attr: `data-remove="${g}:${e(v)}"` });
    }
    if (state.q) {
      const n = search(cat.games, { ...state, q: '' }, cat.genreLabels).results.length;
      if (n) actions.push({ html: `Clear the search text <span class="count">${n}</span>`, attr: 'data-clear-q' });
    }
    actions.push({ html: 'Clear everything', attr: 'data-clear-all' });
    root.querySelector('[data-empty-actions]').innerHTML = actions.slice(0, 6).map((a) => `<li><button type="button" class="chip" ${a.attr}>${a.html}</button></li>`).join('');
  }

  // ---- interactions --------------------------------------------------------
  function leaveCategoryIfBaseRemoved(group, value) {
    if (!base[group].includes(value)) return false;
    // The page is defined by this filter; removing it goes to Discover with the rest kept.
    const f = cloneFilters(state.filters);
    f[group] = f[group].filter((x) => x !== value);
    location.href = `/discover${serializeState({ q: state.q, filters: f, sort: state.sort })}`;
    return true;
  }

  form.addEventListener('change', (ev) => {
    const input = ev.target;
    if (input.type !== 'checkbox') return;
    const list = state.filters[input.name];
    if (input.checked) { if (!list.includes(input.value)) list.push(input.value); }
    else {
      if (leaveCategoryIfBaseRemoved(input.name, input.value)) return;
      state.filters[input.name] = list.filter((v) => v !== input.value);
    }
    render();
  });

  let typing;
  q.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(() => { state.q = q.value; render(); }, 70); });
  root.querySelector('[data-browse-search]').addEventListener('submit', (ev) => { ev.preventDefault(); state.q = q.value; render(); q.blur(); });

  sortSelect.value = state.sort;
  sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; render(); });

  root.addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.remove) {
      const [g, ...rest] = t.dataset.remove.split(':');
      const v = rest.join(':');
      if (leaveCategoryIfBaseRemoved(g, v)) return;
      state.filters[g] = state.filters[g].filter((x) => x !== v);
      render();
      (chipsEl.querySelector('button') || q).focus();
    } else if (t.hasAttribute('data-clear-filters') || t.hasAttribute('data-clear-all')) {
      const hasBase = GROUPS.some((g) => base[g].length);
      if (hasBase && t.hasAttribute('data-clear-all')) { location.href = '/discover'; return; }
      state.filters = cloneFilters(base);
      if (t.hasAttribute('data-clear-all')) { state.q = ''; q.value = ''; }
      render();
      toast(hasBase ? 'Filters cleared (this page keeps its category).' : 'Filters cleared.');
    } else if (t.hasAttribute('data-clear-q')) {
      state.q = ''; q.value = ''; render(); q.focus();
    } else if (t.dataset.dropPhrase !== undefined) {
      const chip = interpretEl._chips?.[Number(t.dataset.dropPhrase)];
      if (chip) {
        q.value = q.value.replace(new RegExp(chip.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s-]*'), 'i'), ' ').replace(/\s+/g, ' ').trim();
        // Numbers may have been typed as words ("two player"): fall back to removing from the normalised text.
        if (q.value === state.q) q.value = normalize(state.q).replace(chip.phrase, ' ').replace(/\s+/g, ' ').trim();
        state.q = q.value;
        render();
        q.focus();
      }
    } else if (t.hasAttribute('data-more')) {
      const group = t.closest('.fgroup');
      const open = !group.classList.contains('is-open');
      group.classList.toggle('is-open', open);
      t.setAttribute('aria-expanded', String(open));
      t.textContent = open ? 'Show fewer genres' : `Show all ${group.querySelectorAll('.check').length} genres`;
    } else if (t.hasAttribute('data-save-search')) {
      saveSearch();
    }
  });

  function saveSearch() {
    const qs = serializeState({ q: state.q, filters: state.filters, sort: state.sort });
    const parts = [];
    for (const g of GROUPS) for (const v of state.filters[g]) parts.push(labelOf(g, v));
    if (state.q.trim()) parts.unshift(`“${state.q.trim()}”`);
    if (!parts.length) { toast('Pick some filters or type a search first.'); return; }
    // Saved searches always point at Discover so they work from anywhere.
    store.saveSearch(parts.join(' · ').slice(0, 80), qs);
    toast('Search saved. Find it under Saved games.');
  }

  // ---- sidebar collapse (desktop) & drawer (mobile) ---------------------------
  const html = document.documentElement;
  const collapseBtn = root.querySelector('[data-sidebar-collapse]');
  const expandBtn = root.querySelector('[data-sidebar-expand]');
  function setCollapsed(c, focus) {
    html.classList.toggle('filters-collapsed', c);
    collapseBtn?.setAttribute('aria-expanded', String(!c));
    expandBtn?.setAttribute('aria-expanded', String(!c));
    store.setPref('sidebarCollapsed', c);
    if (focus) (c ? expandBtn : collapseBtn)?.focus();
  }
  collapseBtn?.addEventListener('click', () => setCollapsed(true, true));
  expandBtn?.addEventListener('click', () => setCollapsed(false, true));
  collapseBtn?.setAttribute('aria-expanded', String(!html.classList.contains('filters-collapsed')));
  expandBtn?.setAttribute('aria-expanded', String(!html.classList.contains('filters-collapsed')));

  const scrim = root.querySelector('[data-drawer-scrim]');
  const openBtn = root.querySelector('[data-drawer-open]');
  const outside = () => [...document.body.children].filter((el) => !el.contains(sidebar) && el.tagName !== 'SCRIPT' && !el.classList.contains('sprite'));
  function setDrawer(open) {
    sidebar.classList.toggle('is-open', open);
    scrim.hidden = !open;
    document.body.classList.toggle('drawer-open', open);
    openBtn?.setAttribute('aria-expanded', String(open));
    if (open) {
      sidebar.setAttribute('role', 'dialog');
      sidebar.setAttribute('aria-modal', 'true');
      for (const el of outside()) el.inert = true;
      // Keep the page's own browse region usable for the drawer; inert everything else inside main.
      for (const el of root.children) if (el !== sidebar) el.inert = true;
      sidebar.querySelector('.sidebar-head [data-drawer-close]')?.focus();
    } else {
      sidebar.removeAttribute('role');
      sidebar.removeAttribute('aria-modal');
      for (const el of outside()) el.inert = false;
      for (const el of root.children) el.inert = false;
    }
  }
  openBtn?.addEventListener('click', () => setDrawer(true));
  scrim?.addEventListener('click', () => { setDrawer(false); openBtn?.focus(); });
  for (const b of root.querySelectorAll('[data-drawer-close]')) b.addEventListener('click', () => { setDrawer(false); openBtn?.focus(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && sidebar.classList.contains('is-open')) { setDrawer(false); openBtn?.focus(); } });
  window.matchMedia('(min-width: 900px)').addEventListener?.('change', (m) => { if (m.matches) setDrawer(false); });

  render();
  if (new URLSearchParams(location.search).get('focus') === 'search') q.focus();
}

function buildLabels(tx) {
  const maps = {
    players: Object.fromEntries(tx.players.map((x) => [x.id, x.label])),
    modes: { ...Object.fromEntries(tx.modeFilters.map((x) => [x.id, x.label])), multiplayer: 'Multiplayer' },
    genres: Object.fromEntries(tx.genres.map((x) => [x.id, x.label])),
    platforms: Object.fromEntries(tx.platforms.map((x) => [x.id, x.label])),
    price: Object.fromEntries(tx.price.map((x) => [x.id, x.label])),
    length: Object.fromEntries(tx.lengths.map((x) => [x.id, x.short])),
    features: Object.fromEntries(tx.features.map((x) => [x.id, x.label])),
  };
  return (g, v) => maps[g]?.[v] || (g === 'players' ? `${v} players` : v);
}

function cssEscape(v) {
  return window.CSS?.escape ? CSS.escape(v) : v.replace(/[^a-zA-Z0-9-]/g, (c) => `\\${c}`);
}

export { PARAM };
