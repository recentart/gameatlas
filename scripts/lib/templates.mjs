// HTML templates for every page. Node-only; the browser re-renders dynamic parts
// with the same shared modules (card.js, format.js, filters.js).
import { escapeHtml as e, playersLabel, modeSummary, labelMap, listLabel, imageFor } from '../../src/js/lib/format.js';
import { facetCount, filterGames, emptyFilters, mergeFilters, GROUPS } from '../../src/js/lib/filters.js';
import { renderCard, hostOf } from '../../src/js/ui/card.js';
import { SPRITE, icon, PLATFORM_ICON } from '../../src/js/ui/icons.js';

export const LOGO = `<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="8" fill="var(--accent)"/><path d="M9 21.5 16 7l7 14.5" fill="none" stroke="var(--accent-contrast)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.6 16.5h8.8" stroke="var(--accent-contrast)" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="24.5" r="1.8" fill="var(--accent-contrast)"/></svg>`;

const NAV = [
  { href: '/discover', label: 'Discover', key: 'discover' },
  { href: '/categories', label: 'Categories', key: 'categories' },
  { href: '/multiplayer', label: 'Multiplayer', key: 'multiplayer' },
  { href: '/new', label: 'New Games', key: 'new' },
];

// ---------------------------------------------------------------------------
// Layout

export function layout(ctx, page) {
  const { site, assets, themeScript } = ctx;
  const url = site.baseUrl + page.path;
  const title = page.title ? `${page.title} · ${site.name}` : `${site.name} · ${site.tagline}`;
  const ogImage = page.ogImage || `${site.baseUrl}/og/site.jpg`;
  const jsonLd = (page.jsonLd || []).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<meta name="description" content="${e(page.description)}">
${page.noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${e(url)}">`}
<meta property="og:site_name" content="${e(site.name)}">
<meta property="og:type" content="${page.ogType || 'website'}">
<meta property="og:title" content="${e(page.title || `${site.name} · ${site.tagline}`)}">
<meta property="og:description" content="${e(page.description)}">
<meta property="og:url" content="${e(url)}">
<meta property="og:image" content="${e(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1217" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<meta name="ga-catalog" content="${assets.catalog}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="${assets.css}">
<script>${themeScript}</script>
<script type="module" src="${assets.js}/app.js"></script>
${jsonLd}
</head>
<body data-page="${page.kind}">
${SPRITE}
<a class="skip-link" href="#main">Skip to content</a>
${header(page.nav)}
<main id="main" tabindex="-1">
${page.body}
</main>
${footer(site)}
${searchDialog()}
<div class="toast" role="status" aria-live="polite" data-toast hidden></div>
</body>
</html>
`;
}

function header(active) {
  const links = NAV.map((n) => `<li><a href="${n.href}"${n.key === active ? ' aria-current="page"' : ''}>${n.label}</a></li>`).join('');
  return `<header class="site-header">
<div class="wrap header-inner">
<a class="logo" href="/" aria-label="GameAtlas home">${LOGO}<span class="logo-text">GameAtlas</span></a>
<nav class="main-nav" aria-label="Main"><ul>${links}
<li><a href="/discover?focus=search" class="nav-search" data-search-open>${icon('search')}Search<kbd aria-hidden="true">/</kbd></a></li></ul></nav>
<div class="header-tools">
<button type="button" class="icon-btn only-narrow" data-search-open aria-label="Search games">${icon('search')}</button>
<button type="button" class="icon-btn" data-theme-toggle aria-label="Switch to dark theme" title="Theme">${icon('moon', 'i-moon')}${icon('sun', 'i-sun')}</button>
<a class="icon-btn saved-link" href="/saved" aria-label="Saved games" title="Saved games">${icon('heart')}<span class="count-dot" data-saved-count hidden></span></a>
<a class="login-link" href="/account">Log in</a>
<button type="button" class="icon-btn menu-btn only-narrow" aria-expanded="false" aria-controls="mobile-nav" aria-label="Menu" data-menu-toggle>${icon('menu')}</button>
</div>
</div>
<nav id="mobile-nav" class="mobile-nav" aria-label="Main" hidden><ul>${links}<li><a href="/saved">Saved games</a></li><li><a href="/account">Log in</a></li></ul></nav>
</header>`;
}

function footer(site) {
  return `<footer class="site-footer">
<div class="wrap footer-inner">
<div class="footer-brand"><a class="logo" href="/">${LOGO}<span class="logo-text">GameAtlas</span></a><p>${e(site.tagline)} An organised directory of games you can filter by players, mode, genre, platform and more.</p></div>
<nav aria-label="Footer"><ul class="footer-links">
<li><a href="/discover">Discover</a></li><li><a href="/categories">Categories</a></li><li><a href="/multiplayer">Multiplayer</a></li><li><a href="/new">New Games</a></li>
<li><a href="/saved">Saved games</a></li><li><a href="/about">About &amp; listing policy</a></li><li><a href="${e(site.issuesUrl)}" rel="noopener">Report a mistake</a></li>
</ul></nav>
<p class="footer-note">No analytics or tracking. Saved games stay in your browser. Game names and trademarks belong to their owners; GameAtlas links to official sources and only hosts its own original games.</p>
</div>
</footer>`;
}

function searchDialog() {
  return `<dialog class="search-dialog" id="search-dialog" aria-label="Search games">
<form class="search-form" action="/discover" method="get" role="search" data-quick-search>
<div class="search-field search-field-lg">${icon('search')}<input type="search" name="q" autocomplete="off" spellcheck="false" placeholder="What do you want to play?" aria-label="Search games" role="combobox" aria-expanded="false" aria-controls="sd-list" aria-autocomplete="list"><button type="button" class="icon-btn" data-dialog-close aria-label="Close search">${icon('x')}</button></div>
<p class="interpret" data-interpret hidden></p>
<ul class="suggest" id="sd-list" role="listbox" aria-label="Suggestions"></ul>
<p class="search-hint">Try <button type="button" class="link-btn" data-example>4 player fighting</button>, <button type="button" class="link-btn" data-example>2 player horror</button> or <button type="button" class="link-btn" data-example>free browser games</button>. Enter shows all results.</p>
</form>
</dialog>`;
}

export function adSlot(id, format) {
  return `<aside class="ad-slot ad-${format}" data-ad-slot="${id}" data-ad-format="${format}" aria-label="Advertisement"><span class="ad-label">Advertisement</span><div class="ad-box"></div></aside>`;
}

// ---------------------------------------------------------------------------
// Filter sidebar + browse layout

export function sidebar(ctx, games, base) {
  const { taxonomy } = ctx;
  const counts = (group, id) => facetCount(games, base, group, id);
  const checked = (group, id) => (base[group] || []).includes(id) ? ' checked' : '';
  const row = (group, item) => `<label class="check"><input type="checkbox" name="${group}" value="${item.id}"${checked(group, item.id)}><span class="check-box" aria-hidden="true">${icon('check')}</span><span class="check-label">${e(item.label)}</span><span class="count" data-count="${group}:${item.id}">${counts(group, item.id)}</span></label>`;
  const group = (id, legend, items, cls = '') => `<fieldset class="fgroup ${cls}"><legend>${legend}</legend>${items.map((i) => row(id, i)).join('')}</fieldset>`;
  const pills = taxonomy.players.map((p) => `<label class="pill"><input type="checkbox" name="players" value="${p.id}"${checked('players', p.id)}><span>${p.id}</span><span class="visually-hidden"> ${p.id === '1' ? 'player' : 'players'}, </span><span class="pill-count" data-count="players:${p.id}">${counts('players', p.id)}</span></label>`).join('');
  const genres = taxonomy.genres;
  return `<aside class="sidebar" id="filters" aria-label="Filters">
<div class="sidebar-rail"><button type="button" class="icon-btn" data-sidebar-expand aria-controls="filters-panel" aria-expanded="false" aria-label="Show filters" title="Show filters">${icon('filter')}<span class="badge-count" data-active-count hidden></span></button></div>
<div class="sidebar-panel" id="filters-panel">
<div class="sidebar-head"><h2>Filters</h2><button type="button" class="link-btn" data-clear-filters>Clear all</button>
<button type="button" class="icon-btn only-wide" data-sidebar-collapse aria-controls="filters-panel" aria-expanded="true" aria-label="Hide filters" title="Hide filters">${icon('chevronLeft')}</button>
<button type="button" class="icon-btn only-narrow" data-drawer-close aria-label="Close filters">${icon('x')}</button></div>
<form class="filters" data-filters-form>
<fieldset class="fgroup fgroup-players"><legend>Players</legend><div class="pills">${pills}</div></fieldset>
${group('modes', 'Mode', taxonomy.modeFilters)}
<fieldset class="fgroup fgroup-genres" data-collapsible><legend>Genre</legend>${genres.map((g, i) => row('genres', g).replace('<label class="check"', `<label class="check${i >= 8 ? ' extra' : ''}"`)).join('')}
<button type="button" class="link-btn more-btn" data-more aria-expanded="false">Show all ${genres.length} genres</button></fieldset>
${group('platforms', 'Platform', taxonomy.platforms)}
${group('price', 'Price', taxonomy.price)}
${group('length', 'Session length', taxonomy.lengths)}
${group('features', 'Other', taxonomy.features)}
</form>
<div class="drawer-foot only-narrow"><button type="button" class="btn btn-primary btn-block" data-drawer-close>Show <span data-result-number>${filterGames(games, base).length}</span> games</button></div>
</div>
</aside>`;
}

/**
 * Browse page: sidebar + search + results grid.
 * opts: { h1, intro, base (filters fragment), sort, crumbs, lead (html above grid), showYear, context }
 */
export function browse(ctx, games, opts) {
  const base = mergeFilters(emptyFilters(), opts.base || {});
  const results = filterGames(games, base);
  const sort = opts.sort || 'relevance';
  const sorted = sortStatic(results, sort);
  const genreLabels = labelMap(ctx.taxonomy.genres);
  const crumbs = opts.crumbs ? breadcrumbs(opts.crumbs) : '';
  return `<div class="wrap browse" data-browse data-base='${e(JSON.stringify(opts.base || {}))}' data-sort="${sort}" data-context="${e(opts.context || 'discover')}"${opts.showYear ? ' data-show-year' : ''}>
${sidebar(ctx, games, base)}
<div class="drawer-scrim" data-drawer-scrim hidden></div>
<section class="results" aria-labelledby="page-title">
<div class="results-head">
${crumbs}
<h1 id="page-title">${e(opts.h1)}</h1>
${opts.intro ? `<p class="intro">${e(opts.intro)}</p>` : ''}
${opts.lead || ''}
<form class="browse-search" role="search" data-browse-search action="/discover" method="get">
<div class="search-field">${icon('search')}<label class="visually-hidden" for="browse-q">Search games</label><input id="browse-q" type="search" name="q" autocomplete="off" spellcheck="false" placeholder="Search ${games.length} games, e.g. “2 player co-op”"></div>
</form>
<p class="interpret" data-interpret hidden></p>
<div class="toolbar">
<button type="button" class="btn btn-outline only-narrow filters-btn" data-drawer-open aria-controls="filters" aria-expanded="false">${icon('filter')}Filters<span class="badge-count" data-active-count hidden></span></button>
<p class="result-count" data-result-summary role="status" aria-live="polite"><strong>${results.length}</strong> ${results.length === 1 ? 'game' : 'games'}</p>
<div class="toolbar-right">
<button type="button" class="btn btn-sm btn-quiet" data-save-search aria-label="Save this search" title="Save this search">${icon('bookmark')}<span>Save search</span></button>
<label class="sort-select"><span>Sort</span><select data-sort-select>
<option value="relevance"${sort === 'relevance' ? ' selected' : ''}>Best match</option>
<option value="az"${sort === 'az' ? ' selected' : ''}>A–Z</option>
<option value="newest"${sort === 'newest' ? ' selected' : ''}>Newest</option>
<option value="players"${sort === 'players' ? ' selected' : ''}>Most players</option>
</select></label>
</div>
</div>
<ul class="active-chips" data-active-chips aria-label="Active filters"></ul>
</div>
<ul class="grid" data-grid>${sorted.map((g) => renderCard(g, { genreLabels, showYear: opts.showYear })).join('')}</ul>
<div class="empty" data-empty hidden>
<h2>No games match all of that</h2>
<p>Try removing a filter or searching for something broader.</p>
<ul class="empty-actions" data-empty-actions></ul>
</div>
${adSlot('browse-bottom', 'leaderboard')}
${opts.after || ''}
</section>
</div>`;
}

export function sortStatic(list, sort) {
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' });
  const arr = [...list];
  if (sort === 'newest') return arr.sort((a, b) => (b.released || 0) - (a.released || 0) || byTitle(a, b));
  if (sort === 'az') return arr.sort(byTitle);
  return arr.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || byTitle(a, b));
}

export function breadcrumbs(items) {
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${items.map((c, i) => i === items.length - 1
    ? `<li aria-current="page">${e(c.label)}</li>`
    : `<li><a href="${c.href}">${e(c.label)}</a></li>`).join('')}</ol></nav>`;
}

export function breadcrumbLd(site, items) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, item: site.baseUrl + (c.href === '/' ? '/' : c.href) })),
  };
}

// ---------------------------------------------------------------------------
// Strips and tiles used on the home and hub pages

export function strip(ctx, { title, href, linkLabel = 'See all', games, id, note }) {
  if (!games.length) return '';
  const genreLabels = labelMap(ctx.taxonomy.genres);
  return `<section class="section strip-section" aria-labelledby="${id}">
<div class="section-head"><h2 id="${id}">${e(title)}</h2>${href ? `<a class="see-all" href="${href}">${e(linkLabel)}${icon('chevronRight')}</a>` : ''}</div>
${note ? `<p class="section-note">${e(note)}</p>` : ''}
<ul class="strip" role="list">${games.map((g) => renderCard(g, { genreLabels })).join('')}</ul>
</section>`;
}

export function countFor(games, filters) {
  return filterGames(games, mergeFilters(emptyFilters(), filters)).length;
}

// ---------------------------------------------------------------------------
// Game page

export function gamePage(ctx, game, similar) {
  const { taxonomy } = ctx;
  const genreLabels = labelMap(taxonomy.genres);
  const modes = listLabel(game.modes, taxonomy.modes);
  const genres = game.genres.map((g) => `<a href="/games/${g}">${e(genreLabels[g])}</a>`).join(', ');
  const platforms = listLabel(game.platforms, taxonomy.platforms).join(', ');
  const length = taxonomy.lengths.find((l) => l.id === game.sessionLength)?.label;
  const embedded = game.embedAllowed && game.embedUrl;
  const original = game.sourceName === 'GameAtlas Originals';
  const host = hostOf(game.sourceUrl);
  const p = game.players;
  const yn = (v) => (v ? 'Yes' : 'No');
  const playersDetail = [
    p.local ? `up to ${p.local} on one screen/device` : null,
    p.online ? `up to ${p.online} online` : null,
  ].filter(Boolean).join(', ');

  const crumbs = [{ label: 'Home', href: '/' }, { label: game.genres[0] ? genreLabels[game.genres[0]] : 'Games', href: `/games/${game.genres[0]}` }, { label: game.title, href: `/games/${game.slug}` }];

  const playCta = embedded
    ? `<button type="button" class="btn btn-primary btn-lg" data-player-start>${icon('play')}Play game</button>`
    : `<a class="btn btn-primary btn-lg" href="${e(game.sourceUrl)}" target="_blank" rel="noopener" data-play-external="${e(game.slug)}">${icon('play')}Play game<span class="btn-sub">on ${e(game.sourceName === 'Official site' ? host : game.sourceName)}</span>${icon('external', 'i-ext')}</a>`;

  const media = embedded
    ? `<section class="player${game.embedShape === 'board' ? ' player-board' : ''}" id="play" aria-label="${e(game.title)} game player" data-player data-src="${e(game.embedUrl)}" data-title="${e(game.title)}" data-slug="${e(game.slug)}">
<div class="player-bar-top" data-exit-bar hidden><span>${e(game.title)}</span><button type="button" class="btn btn-sm btn-outline-light" data-fullscreen-exit>${icon('minimize')}Exit fullscreen</button></div>
<div class="player-frame" data-player-frame>
<img class="player-poster" src="${e(imageFor(game).src)}" alt="" width="640" height="360">
<button type="button" class="player-start" data-player-start><span class="player-start-icon">${icon('play')}</span><span>Play ${e(game.title)}</span><small>Runs in this page · no download</small></button>
</div>
<div class="player-bar">
<p class="player-note">${icon('info')}Click the game to give it keyboard focus. <kbd>P</kbd> or controller Start pauses; controller Select returns to the page.</p>
<div class="player-controls">
<button type="button" class="btn btn-sm btn-quiet" data-player-restart disabled>${icon('turn')}Restart</button>
<button type="button" class="btn btn-sm btn-outline" data-fullscreen disabled aria-pressed="false">${icon('maximize')}<span>Fullscreen</span></button>
</div>
</div>
</section>`
    : `<figure class="game-cover"><img src="${e(imageFor(game).src)}" alt="${e(game.title)} artwork" width="640" height="360">${game.artCredit ? `<figcaption>${e(game.artCredit)}</figcaption>` : ''}</figure>`;

  const facts = [
    ['Players', `${e(playersLabel(p))}${playersDetail ? `<span class="fact-sub">${e(playersDetail)}</span>` : ''}`],
    ['Multiplayer', `${e(modeSummary(game))}<span class="fact-sub">${e(modes.join(', '))}</span>`],
    ['Genre', genres],
    ['Platforms', e(platforms)],
    ['Session length', e(length)],
    ['Price', `${game.price === 'free' ? 'Free' : 'Paid'}${game.priceNote ? `<span class="fact-sub">${e(game.priceNote)}</span>` : ''}`],
    ['Account needed', `${yn(game.accountRequired)}${game.accountNote ? `<span class="fact-sub">${e(game.accountNote)}</span>` : ''}`],
    ['Download needed', yn(game.downloadRequired)],
    ['Controller', yn(game.controllerSupport)],
    ['Keyboard', yn(game.keyboardSupport)],
    ['Mobile-friendly', yn(game.mobileFriendly)],
    ['Released', game.released ? String(game.released) : 'Unknown'],
    ['Developer', e(game.developer)],
  ];

  const tagLinks = [
    ...game.genres.map((g) => ({ href: `/games/${g}`, label: genreLabels[g] })),
    ...(game.tags || []).map((t) => ({ href: `/discover?q=${encodeURIComponent(t)}`, label: t })),
  ];

  const sourceNote = original
    ? `Made by GameAtlas and hosted here. <a href="${e(game.sourceUrl)}" rel="noopener">View the source code</a>.`
    : `Listed from <a href="${e(game.sourceUrl)}" target="_blank" rel="noopener">${e(game.sourceName === 'Official site' ? host : game.sourceName)}</a>. GameAtlas doesn't host this game; ${e(game.developer)} and its publisher own it.`;

  return `<div class="wrap game-page">
${breadcrumbs(crumbs)}
<article class="game" data-game="${e(game.slug)}">
<div class="game-hero${embedded ? ' has-player' : ''}">
${media}
<header class="game-head">
<p class="eyebrow">${e(game.genres.map((g) => genreLabels[g]).join(' · '))}${game.released ? ` · ${game.released}` : ''}</p>
<h1>${e(game.title)}</h1>
<p class="lede">${e(game.summary)}</p>
<ul class="quick-facts">
<li>${icon('users')}${e(playersLabel(p))}</li>
<li>${icon(game.modes.some((m) => m.endsWith('coop')) ? 'coop' : game.modes.some((m) => m.endsWith('pvp')) ? 'versus' : 'gamepad')}${e(modeSummary(game))}</li>
<li>${icon(PLATFORM_ICON[game.platforms[0]])}${e(platforms)}</li>
<li>${icon('clock')}${e(taxonomy.lengths.find((l) => l.id === game.sessionLength)?.short)}</li>
</ul>
<div class="game-actions">
${playCta}
<button type="button" class="btn btn-outline btn-lg save-btn" data-save="${e(game.slug)}" aria-pressed="false">${icon('heart', 'i-off')}${icon('heartFill', 'i-on')}<span class="save-text">Save</span></button>
<span class="badge ${game.price === 'free' ? 'badge-free' : 'badge-paid'} badge-lg">${game.price === 'free' ? 'Free' : 'Paid'}</span>
</div>
<p class="source-note">${icon('info')}<span>${sourceNote}</span></p>
</header>
</div>
<div class="game-layout">
<div class="game-main">
<section class="prose"><h2>About ${e(game.title)}</h2><p>${e(game.description)}</p></section>
<section class="prose"><h2>Controls</h2><p>${e(game.controls)}</p></section>
<section><h2 class="h-small">Tags</h2><ul class="tag-list">${tagLinks.map((t) => `<li><a class="tag" href="${t.href}">${e(t.label)}</a></li>`).join('')}</ul></section>
${adSlot('game-below', 'leaderboard')}
</div>
<aside class="game-facts" aria-labelledby="facts-title">
<h2 id="facts-title" class="h-small">At a glance</h2>
<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
<p class="facts-note">Details checked ${e(game.added)}. <a href="${e(ctx.site.issuesUrl)}" rel="noopener">Spot a mistake?</a></p>
</aside>
</div>
</article>
${strip(ctx, { title: 'Similar games', id: 'similar', games: similar, href: `/games/${game.genres[0]}`, linkLabel: `More ${genreLabels[game.genres[0]]} games` })}
</div>`;
}

export function gameJsonLd(site, game, taxonomy) {
  const genreLabels = labelMap(taxonomy.genres);
  const modeMap = [];
  if (game.modes.includes('single')) modeMap.push('SinglePlayer');
  if (game.modes.some((m) => ['local-coop', 'local-pvp', 'online-coop', 'online-pvp'].includes(m))) modeMap.push('MultiPlayer');
  if (game.modes.some((m) => m.endsWith('coop'))) modeMap.push('CoOp');
  const platformNames = { browser: 'Web browser', pc: 'PC', mobile: 'Mobile', console: 'Game console' };
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.title,
    url: `${site.baseUrl}/games/${game.slug}`,
    description: game.description,
    image: `${site.baseUrl}/og/${game.slug}.jpg`,
    genre: game.genres.map((g) => genreLabels[g]),
    gamePlatform: game.platforms.map((p) => platformNames[p]),
    playMode: modeMap,
    numberOfPlayers: { '@type': 'QuantitativeValue', minValue: game.players.min, ...(game.players.max ? { maxValue: game.players.max } : {}) },
    author: { '@type': 'Organization', name: game.developer },
    sameAs: game.sourceUrl,
  };
  if (game.released) ld.datePublished = String(game.released);
  if (game.embedAllowed) ld.isAccessibleForFree = true;
  return ld;
}

export { e, icon, GROUPS };
