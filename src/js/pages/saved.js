// Saved games page: favourites, recently played, saved searches. All local.
import { store, refreshSaves } from '../app.js';
import { loadCatalog } from '../lib/catalog.js';
import { renderCard } from '../ui/card.js';
import { escapeHtml as e, imageFor } from '../lib/format.js';
import { icon } from '../ui/icons.js';

const HINT_THRESHOLD = 3;

function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : new Date(t).toLocaleDateString();
}

export async function init() {
  const cat = await loadCatalog();
  const $ = (s) => document.querySelector(s);

  function render() {
    const s = store.get();
    const favs = s.favorites.map((f) => cat.bySlug[f.slug]).filter(Boolean);
    $('[data-fav-grid]').innerHTML = favs.map((g) => renderCard(g, { genreLabels: cat.genreLabels })).join('');
    $('[data-fav-grid]').hidden = !favs.length;
    $('[data-fav-empty]').hidden = favs.length > 0;
    $('[data-fav-count]').textContent = favs.length ? `(${favs.length})` : '';
    // The only account prompt on the site: quiet, dismissible, after several saves.
    $('[data-account-hint]').hidden = favs.length < HINT_THRESHOLD || s.prefs.accountHintDismissed;

    const recent = s.recent.map((r) => ({ ...r, game: cat.bySlug[r.slug] })).filter((r) => r.game);
    $('[data-recent-list]').innerHTML = recent.map(({ game, at }) => `<li><img src="${e(imageFor(game, 320).src)}" alt="" width="80" height="45" loading="lazy"><span class="r-main"><a href="/games/${e(game.slug)}">${e(game.title)}</a><span class="r-sub">${game.embedAllowed ? 'Played here' : `Opened on ${e(game.sourceName === 'Official site' ? 'the official site' : game.sourceName)}`} · ${ago(at)}</span></span></li>`).join('');
    $('[data-recent-empty]').hidden = recent.length > 0;
    $('[data-clear-recent]').hidden = recent.length === 0;

    $('[data-search-list]').innerHTML = s.savedSearches.map((x) => `<li>${icon('bookmark')}<span class="r-main"><a href="/discover${e(x.query)}">${e(x.name)}</a><span class="r-sub">Saved ${ago(x.at)}</span></span><button type="button" class="icon-btn" data-remove-search="${e(x.id)}" aria-label="Delete saved search ${e(x.name)}">${icon('trash')}</button></li>`).join('');
    $('[data-search-empty]').hidden = s.savedSearches.length > 0;
    refreshSaves();
  }

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-clear-recent')) store.clearRecent();
    else if (t.dataset.removeSearch) store.removeSearch(t.dataset.removeSearch);
    else if (t.hasAttribute('data-hint-dismiss')) store.setPref('accountHintDismissed', true);
  });
  store.subscribe(render);
  render();
}
