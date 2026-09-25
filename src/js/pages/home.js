// Home: "Jump back in" row from recently played + favourites (only if there are any).
import { store, refreshSaves } from '../app.js';
import { loadCatalog } from '../lib/catalog.js';
import { renderCard } from '../ui/card.js';

export async function init() {
  const section = document.querySelector('[data-continue]');
  if (!section) return;
  const s = store.get();
  const slugs = [...new Set([...s.recent.map((r) => r.slug), ...s.favorites.map((f) => f.slug)])];
  if (!slugs.length) return;
  const cat = await loadCatalog();
  const games = slugs.map((x) => cat.bySlug[x]).filter(Boolean).slice(0, 12);
  if (!games.length) return;
  section.querySelector('[data-continue-list]').innerHTML = games.map((g) => renderCard(g, { genreLabels: cat.genreLabels })).join('');
  section.hidden = false;
  refreshSaves(section);
}
