// 404: suggest games whose name resembles the mistyped URL.
import { refreshSaves } from '../app.js';
import { loadCatalog } from '../lib/catalog.js';
import { search } from '../lib/search.js';
import { emptyFilters } from '../lib/filters.js';
import { renderCard } from '../ui/card.js';

export async function init() {
  const last = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '').replace(/[-_]+/g, ' ').replace(/\.html?$/, '').trim();
  if (last.length < 2) return;
  const cat = await loadCatalog();
  const input = document.querySelector('#nf-q');
  if (input) input.value = last;
  let results = search(cat.games, { q: last, filters: emptyFilters() }, cat.genreLabels).results;
  if (!results.length) {
    // Try each word on its own.
    const seen = new Set();
    for (const w of last.split(' ').filter((x) => x.length >= 3)) {
      for (const g of search(cat.games, { q: w, filters: emptyFilters() }, cat.genreLabels).results) if (!seen.has(g.slug)) { seen.add(g.slug); results.push(g); }
    }
  }
  results = results.slice(0, 4);
  if (!results.length) return;
  document.querySelector('[data-suggest-intro]').hidden = false;
  const grid = document.querySelector('[data-suggest-grid]');
  grid.innerHTML = results.map((g) => renderCard(g, { genreLabels: cat.genreLabels })).join('');
  refreshSaves(grid);
}
