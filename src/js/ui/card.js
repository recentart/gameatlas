// Game card markup. Shared by the static build and the browser so server- and
// client-rendered grids are identical.
import { escapeHtml, playersLabel, modeSummary, imageFor } from '../lib/format.js';
import { icon, PLATFORM_ICON } from './icons.js';

const PLATFORM_LABEL = { browser: 'Browser', pc: 'PC', mobile: 'Mobile', console: 'Console' };

/** What the card's action button does. */
export function playAction(game) {
  if (game.embedAllowed && game.embedUrl) return { kind: 'here', label: 'Play', href: `/games/${game.slug}#play` };
  if (!game.downloadRequired && game.price === 'free') return { kind: 'external', label: 'Play', href: game.sourceUrl };
  return { kind: 'page', label: 'View', href: `/games/${game.slug}` };
}

export function renderCard(game, { genreLabels = {}, showYear = false, headingLevel = 3 } = {}) {
  const e = escapeHtml;
  const url = `/games/${game.slug}`;
  const genres = game.genres.slice(0, 2).map((g) => genreLabels[g] || g).join(' · ');
  const platforms = game.platforms.map((p) => PLATFORM_LABEL[p]).join(' · ');
  const act = playAction(game);
  const img = imageFor(game);
  const h = `h${headingLevel}`;
  const playHere = act.kind === 'here' ? `<span class="badge badge-here">${icon('play')}Play here</span>` : '';
  const year = showYear && game.released ? `<span class="badge badge-year">${game.released}</span>` : '';
  const actionAttrs = act.kind === 'external'
    ? ` href="${e(act.href)}" target="_blank" rel="noopener" data-play-external="${e(game.slug)}" aria-label="Play ${e(game.title)} on ${e(hostOf(game.sourceUrl))} (opens in a new tab)"`
    : ` href="${e(act.href)}" aria-label="${act.label} ${e(game.title)}"`;
  return `<li class="card-item"><article class="card" data-slug="${e(game.slug)}">
<div class="card-media"><img src="${e(img.src)}"${img.srcset ? ` srcset="${e(img.srcset)}" sizes="(max-width: 559px) 136px, 320px"` : ''} alt="" width="640" height="360" loading="lazy" decoding="async"></div>
<div class="card-body">
<${h} class="card-title"><a href="${url}">${e(game.title)}</a></${h}>
<p class="card-summary">${e(game.summary)}</p>
<ul class="card-meta">
<li>${icon('users')}<span>${e(playersLabel(game.players))}</span></li>
<li>${icon(game.modes.some((m) => m.endsWith('coop')) ? 'coop' : game.modes.some((m) => m.endsWith('pvp')) ? 'versus' : 'gamepad')}<span>${e(modeSummary(game))}</span></li>
<li class="card-meta-genre">${icon('tag')}<span>${e(genres)}</span></li>
<li class="card-meta-platform">${icon(PLATFORM_ICON[game.platforms[0]])}<span>${e(platforms)}</span></li>
</ul>
</div>
<div class="card-foot">
<span class="badge ${game.price === 'free' ? 'badge-free' : 'badge-paid'}">${game.price === 'free' ? 'Free' : 'Paid'}</span>${playHere}${year}
<span class="card-actions">
<button type="button" class="icon-btn save-btn" data-save="${e(game.slug)}" aria-pressed="false" aria-label="Save ${e(game.title)}" title="Save">${icon('heart', 'i-off')}${icon('heartFill', 'i-on')}</button>
<a class="btn btn-sm ${act.kind === 'page' ? 'btn-quiet' : 'btn-play'}"${actionAttrs}>${act.kind === 'page' ? '' : icon('play')}${act.label}${act.kind === 'external' ? icon('external', 'i-ext') : ''}</a>
</span>
</div>
</article></li>`;
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'the official site'; }
}
