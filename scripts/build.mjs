// Static site build: data/ + src/ -> dist/. No dependencies.
// Run: node scripts/build.mjs   (wrangler runs it automatically before deploy)
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from './lib/validate.mjs';
import { coverSvg, siteOgSvg } from './lib/covers.mjs';
import {
  layout, browse, strip, countFor, gamePage, gameJsonLd, breadcrumbLd, adSlot, e, icon, sortStatic,
} from './lib/templates.mjs';
import { filterGames, emptyFilters, mergeFilters } from '../src/js/lib/filters.js';
import { labelMap } from '../src/js/lib/format.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
// Hash with normalised line endings so Windows (CRLF) and CI (LF) checkouts build identical files.
const hashOf = (s) => createHash('sha256').update(String(s).replace(/\r\n/g, '\n')).digest('hex').slice(0, 10);

const site = json('data/site.json');
const taxonomy = json('data/taxonomy.json');
const categories = json('data/categories.json');
const games = json('data/games.json');
const imageManifest = existsSync(join(ROOT, 'data/images.json')) ? json('data/images.json') : {};
// Official artwork (or gameplay screenshots for Originals) from scripts/fetch-images.mjs / capture-originals.mjs.
for (const g of games) {
  if (imageManifest[g.slug] && existsSync(join(ROOT, 'assets/games', `${g.slug}-640.webp`)) && existsSync(join(ROOT, 'assets/games', `${g.slug}-320.webp`))) {
    g.art = true;
    g.artCredit = imageManifest[g.slug].credit;
  }
}

// ---- validate -------------------------------------------------------------
const { errors, warnings, counts } = validateCatalog({ games, taxonomy, categories });
for (const w of warnings) console.warn(`warn: ${w}`);
if (errors.length) {
  console.error(`Catalog has ${errors.length} error(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
const liveCategories = categories.categories.filter((c) => counts[c.slug] >= categories.minGames);
const skipped = categories.categories.filter((c) => counts[c.slug] < categories.minGames);
if (skipped.length) console.log(`Skipping thin categories: ${skipped.map((c) => `${c.slug} (${counts[c.slug]})`).join(', ')}`);

// ---- helpers --------------------------------------------------------------
rmSync(DIST, { recursive: true, force: true });
function out(path, content) {
  const full = join(DIST, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}
function walk(dir) {
  const res = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) res.push(...walk(p)); else res.push(p);
  }
  return res;
}
function copyDir(from, to) {
  for (const f of walk(join(ROOT, from))) {
    const target = join(DIST, to, relative(join(ROOT, from), f));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(f, target);
  }
}

// ---- assets (content-hashed directory so /assets/* can be cached forever) ---
const cssFiles = ['tokens.css', 'base.css', 'components.css', 'browse.css', 'game.css', 'pages.css'];
const css = cssFiles.map((f) => `/* ${f} */\n${read(`src/styles/${f}`)}`).join('\n');
const jsFiles = walk(join(ROOT, 'src/js')).filter((f) => f.endsWith('.js'));
const jsBundleKey = jsFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

const clientGames = games.map((g) => {
  const { description, controls, added, artCredit, ...rest } = g; // page-only fields stay out of the catalog
  return rest;
});
const catalog = {
  games: clientGames,
  taxonomy,
  categories: liveCategories.map(({ slug, name, group, filters }) => ({ slug, name, group, filters })),
  site: { name: site.name, issuesUrl: site.issuesUrl, accounts: site.accounts.enabled, ads: site.ads },
};
const catalogText = JSON.stringify(catalog);
const version = hashOf(css + jsBundleKey + catalogText);
const assets = {
  css: `/assets/${version}/site.css`,
  js: `/assets/${version}/js`,
  catalog: `/data/catalog.${hashOf(catalogText)}.json`,
};
out(assets.css.slice(1), css);
copyDir('src/js', `assets/${version}/js`);
out(assets.catalog.slice(1), catalogText);

// Runs before first paint: apply saved theme and sidebar state without a flash.
const themeScript = "(function(){try{var s=JSON.parse(localStorage.getItem('gameatlas:v1')||'null');var p=s&&s.prefs||{};if(p.theme==='light'||p.theme==='dark')document.documentElement.setAttribute('data-theme',p.theme);if(p.sidebarCollapsed===true)document.documentElement.classList.add('filters-collapsed');}catch(e){}document.documentElement.classList.add('js');})();";
const themeHash = createHash('sha256').update(themeScript).digest('base64');

const ctx = { site, taxonomy, assets, themeScript };
const genreLabels = labelMap(taxonomy.genres);
const bySlug = Object.fromEntries(games.map((g) => [g.slug, g]));
const page = (path, p) => out(path, layout(ctx, p));

// ---- covers & images ------------------------------------------------------
for (const g of games) out(`covers/${g.slug}.svg`, coverSvg(g));
for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png']) if (existsSync(join(ROOT, 'assets', f))) copyFileSync(join(ROOT, 'assets', f), join(DIST, f));
if (existsSync(join(ROOT, 'assets/og'))) copyDir('assets/og', 'og');
if (existsSync(join(ROOT, 'assets/games'))) copyDir('assets/games', 'img/games');
// Source SVGs for the OG renderer (tools/render-images.mjs turns them into PNGs).
mkdirSync(join(ROOT, '.cache/og-src'), { recursive: true });
for (const g of games) {
  const og = { ...g, ogLine: `${playersText(g)} · ${g.genres.map((x) => genreLabels[x]).join(' · ')}` };
  const art = g.art ? `data:image/webp;base64,${readFileSync(join(ROOT, 'assets/games', `${g.slug}-640.webp`)).toString('base64')}` : null;
  writeFileSync(join(ROOT, '.cache/og-src', `${g.slug}.svg`), coverSvg(og, { og: true, image: art }));
}
writeFileSync(join(ROOT, '.cache/og-src', 'site.svg'), siteOgSvg(site, games.length));
function playersText(g) { const p = g.players; return p.max === null ? `${p.min}+ players` : p.min === p.max ? `${p.min} player${p.min > 1 ? 's' : ''}` : `${p.min}–${p.max}${p.plus ? '+' : ''} players`; }

// ---- play/ (GameAtlas Originals, self-hosted and embeddable) ---------------
copyDir('src/play', 'play');

// ---- home -----------------------------------------------------------------
const playerTiles = [
  { label: '1 Player', sub: 'Solo', href: '/games/1-player', f: { players: ['1'] }, glyph: '1' },
  { label: '2 Players', sub: 'Duo', href: '/games/2-player', f: { players: ['2'] }, glyph: '2' },
  { label: '3 Players', sub: 'Trio', href: '/games/3-player', f: { players: ['3'] }, glyph: '3' },
  { label: '4 Players', sub: 'Squad', href: '/games/4-player', f: { players: ['4'] }, glyph: '4' },
  { label: '5+ Players', sub: 'Big group', href: '/games/5-plus-player', f: { players: ['5+'] }, glyph: '5+' },
  { label: 'Party', sub: 'Groups', href: '/games/party', f: { genres: ['party'] }, glyph: icon('party') },
];
const modeTiles = [
  { slug: 'local-multiplayer', label: 'Local multiplayer', text: 'Same room, one screen or device', ic: 'console' },
  { slug: 'online-multiplayer', label: 'Online multiplayer', text: 'Play together from anywhere', ic: 'globe' },
  { slug: 'local-co-op', label: 'Local co-op', text: 'Team up on the sofa', ic: 'coop' },
  { slug: 'online-co-op', label: 'Online co-op', text: 'Team up over the internet', ic: 'coop' },
  { slug: 'pvp', label: 'PvP & versus', text: 'Go head to head', ic: 'versus' },
  { slug: 'team-based', label: 'Team-based', text: 'Squads and sides', ic: 'team' },
  { slug: 'turn-based', label: 'Turn-based', text: 'Take your time', ic: 'turn' },
  { slug: 'play-on-gameatlas', label: 'Play right here', text: 'Free, instant, in this browser', ic: 'play' },
];
const catBySlug = Object.fromEntries(liveCategories.map((c) => [c.slug, c]));
const catCount = (slug) => countFor(games, catBySlug[slug].filters);

const homeBody = `
<section class="hero">
<div class="wrap hero-inner">
<h1 class="hero-title">Find the right game.</h1>
<p class="hero-sub">Search ${games.length} games by how many of you are playing, co-op or versus, local or online, genre, platform and price.</p>
<form class="hero-search" action="/discover" method="get" role="search" data-hero-search>
<div class="search-field search-field-xl combo">${icon('search')}<input type="search" name="q" autocomplete="off" spellcheck="false" placeholder="What do you want to play?" aria-label="What do you want to play?" role="combobox" aria-expanded="false" aria-controls="hero-list" aria-autocomplete="list"><button class="btn btn-primary" type="submit">Search</button></div>
<ul class="suggest suggest-pop" id="hero-list" role="listbox" aria-label="Suggestions" hidden></ul>
<p class="interpret" data-interpret hidden></p>
</form>
<div class="examples"><span>Try:</span><ul>${site.searchExamples.map((q) => `<li><a class="chip" href="/discover?q=${encodeURIComponent(q)}">${e(q)}</a></li>`).join('')}</ul></div>
</div>
</section>
<div class="wrap home">
<section class="section" aria-labelledby="h-players">
<div class="section-head"><h2 id="h-players">How many players?</h2><a class="see-all" href="/categories#players">All player counts${icon('chevronRight')}</a></div>
<ul class="player-tiles">${playerTiles.map((t) => `<li><a class="player-tile" href="${t.href}"><span class="pt-glyph" aria-hidden="true">${t.glyph}</span><span class="pt-label">${t.label}</span><span class="pt-count">${countFor(games, t.f)} games</span></a></li>`).join('')}</ul>
</section>
<section class="section continue" data-continue hidden aria-labelledby="h-continue">
<div class="section-head"><h2 id="h-continue">Jump back in</h2><a class="see-all" href="/saved">Your saved games${icon('chevronRight')}</a></div>
<ul class="strip" data-continue-list></ul>
</section>
${strip(ctx, { title: 'Play right here', id: 'h-here', href: '/games/play-on-gameatlas', note: 'Original games made for GameAtlas. Free, instant, no account, and no ads inside the game.', games: games.filter((g) => g.embedAllowed) })}
<section class="section" aria-labelledby="h-types">
<div class="section-head"><h2 id="h-types">Browse by game type</h2><a class="see-all" href="/categories#genres">All categories${icon('chevronRight')}</a></div>
<ul class="genre-grid">${taxonomy.genres.filter((g) => catBySlug[g.id]).map((g) => `<li><a class="genre-chip" href="/games/${g.id}"><span>${e(g.label)}</span><span class="count">${catCount(g.id)}</span></a></li>`).join('')}<li><a class="genre-chip" href="/multiplayer"><span>Multiplayer</span><span class="count">${countFor(games, { modes: ['multiplayer'] })}</span></a></li></ul>
</section>
<section class="section" aria-labelledby="h-modes">
<div class="section-head"><h2 id="h-modes">How do you want to play?</h2><a class="see-all" href="/multiplayer">Multiplayer guide${icon('chevronRight')}</a></div>
<ul class="mode-tiles">${modeTiles.filter((m) => catBySlug[m.slug]).map((m) => `<li><a class="mode-tile" href="/games/${m.slug}"><span class="mt-icon">${icon(m.ic)}</span><span class="mt-text"><span class="mt-label">${m.label}</span><span class="mt-sub">${m.text}</span></span><span class="count">${catCount(m.slug)}</span></a></li>`).join('')}</ul>
</section>
${strip(ctx, { title: 'Quick games', id: 'h-quick', href: '/games/quick', note: 'A full round in under ten minutes.', games: sortStatic(filterGames(games, mergeFilters(emptyFilters(), { length: ['under-10'] })), 'relevance').slice(0, 12) })}
${adSlot('home-mid', 'leaderboard')}
${strip(ctx, { title: 'Free, no download', id: 'h-free', href: '/discover?price=free&feature=no-download', games: sortStatic(filterGames(games, mergeFilters(emptyFilters(), { price: ['free'], features: ['no-download'] })), 'relevance').slice(0, 12) })}
${strip(ctx, { title: 'Great with 4 players on one screen', id: 'h-couch', href: '/discover?players=4&mode=local', games: sortStatic(filterGames(games, mergeFilters(emptyFilters(), { players: ['4'], modes: ['local'] })), 'relevance').slice(0, 12) })}
${strip(ctx, { title: 'New releases', id: 'h-new', href: '/new', games: sortStatic(games.filter((g) => !g.embedAllowed), 'newest').slice(0, 12) })}
</div>`;

page('index.html', {
  path: '/', kind: 'home', nav: 'home',
  description: `${site.tagline} Search ${games.length} games by number of players, co-op or versus, local or online, genre, platform, price and session length.`,
  body: homeBody,
  jsonLd: [{
    '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: `${site.baseUrl}/`, description: site.description,
    potentialAction: { '@type': 'SearchAction', target: `${site.baseUrl}/discover?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
  }],
});

// ---- discover -------------------------------------------------------------
page('discover.html', {
  path: '/discover', kind: 'browse', nav: 'discover', title: 'Discover games',
  description: `Browse and filter ${games.length} games by players, mode, genre, platform, price and session length.`,
  body: browse(ctx, games, { h1: 'Discover games', context: 'discover' }),
});

// ---- category pages -------------------------------------------------------
const groupLabel = Object.fromEntries(categories.groups.map((g) => [g.id, g.label]));
for (const c of liveCategories) {
  const members = filterGames(games, mergeFilters(emptyFilters(), c.filters));
  const related = liveCategories.filter((x) => x.group === c.group && x.slug !== c.slug).slice(0, 12);
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Categories', href: '/categories' }, { label: c.h1, href: `/games/${c.slug}` }];
  const after = `<section class="related-cats" aria-labelledby="rel-h"><h2 id="rel-h" class="h-small">${e(groupLabel[c.group])}</h2><ul class="chip-list">${related.map((r) => `<li><a class="chip" href="/games/${r.slug}">${e(r.name)} <span class="count">${counts[r.slug]}</span></a></li>`).join('')}</ul></section>`;
  page(`games/${c.slug}.html`, {
    path: `/games/${c.slug}`, kind: 'browse', nav: c.group === 'modes' ? 'multiplayer' : 'categories', title: c.h1,
    description: `${c.description} ${members.length} games on GameAtlas, with filters for players, mode, platform and price.`,
    body: browse(ctx, games, { h1: c.h1, intro: c.intro, base: c.filters, crumbs, after, context: c.slug }),
    jsonLd: [breadcrumbLd(site, crumbs), {
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.h1, url: `${site.baseUrl}/games/${c.slug}`,
      mainEntity: { '@type': 'ItemList', numberOfItems: members.length, itemListElement: sortStatic(members, 'relevance').slice(0, 30).map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site.baseUrl}/games/${g.slug}`, name: g.title })) },
    }],
  });
}

// ---- categories index -------------------------------------------------------
page('categories.html', {
  path: '/categories', kind: 'categories', nav: 'categories', title: 'All categories',
  description: 'Every way to browse GameAtlas: player counts, multiplayer modes, game types, platforms and price.',
  body: `<div class="wrap narrow-page">
<h1>Categories</h1>
<p class="intro">Every category page lists games that actually fit. Numbers show how many games are in each.</p>
${categories.groups.map((grp) => {
    const list = liveCategories.filter((c) => c.group === grp.id);
    return `<section class="cat-group" id="${grp.id}" aria-labelledby="cg-${grp.id}"><h2 id="cg-${grp.id}">${e(grp.label)}</h2><ul class="cat-list">${list.map((c) => `<li><a href="/games/${c.slug}"><span class="cat-name">${e(c.h1)}</span><span class="cat-desc">${e(c.description)}</span><span class="count">${counts[c.slug]}</span></a></li>`).join('')}${grp.id === 'modes' ? `<li><a href="/multiplayer"><span class="cat-name">All multiplayer games</span><span class="cat-desc">Every game you can play with other people.</span><span class="count">${countFor(games, { modes: ['multiplayer'] })}</span></a></li>` : ''}</ul></section>`;
  }).join('')}
</div>`,
});

// ---- multiplayer hub ------------------------------------------------------
const mpLead = `<ul class="mode-tiles mode-tiles-compact">${modeTiles.filter((m) => catBySlug[m.slug] && m.slug !== 'play-on-gameatlas').map((m) => `<li><a class="mode-tile" href="/games/${m.slug}"><span class="mt-icon">${icon(m.ic)}</span><span class="mt-text"><span class="mt-label">${m.label}</span><span class="mt-sub">${m.text}</span></span><span class="count">${catCount(m.slug)}</span></a></li>`).join('')}</ul>`;
page('multiplayer.html', {
  path: '/multiplayer', kind: 'browse', nav: 'multiplayer', title: 'Multiplayer games',
  description: 'Multiplayer games for every group: local co-op, online co-op, PvP, team-based and turn-based, filtered by player count and platform.',
  body: browse(ctx, games, {
    h1: 'Multiplayer games', context: 'multiplayer', base: { modes: ['multiplayer'] },
    intro: 'Local means everyone plays on one screen or device. Online means each person plays on their own device. Pick how you want to play, then narrow it down.',
    lead: mpLead,
  }),
});

// ---- new ------------------------------------------------------------------
page('new.html', {
  path: '/new', kind: 'browse', nav: 'new', title: 'New games',
  description: 'The newest games on GameAtlas, sorted by release year, with filters for players, mode and platform.',
  body: browse(ctx, games, { h1: 'New & recent games', intro: 'Sorted by release year, newest first. Change the sort or add filters to narrow it down.', sort: 'newest', showYear: true, context: 'new' }),
});

// ---- game pages -----------------------------------------------------------
function similarTo(game) {
  const multi = (g) => g.modes.some((m) => m.includes('-'));
  return games.filter((g) => g.slug !== game.slug).map((g) => {
    let s = 0;
    for (const x of g.genres) if (game.genres.includes(x)) s += x === game.genres[0] ? 3 : 2;
    for (const m of g.modes) if (game.modes.includes(m)) s += 0.6;
    if (multi(g) === multi(game)) s += 1;
    if (g.platforms.some((p) => game.platforms.includes(p))) s += 0.5;
    if (!!g.embedAllowed === !!game.embedAllowed) s += 0.3;
    return { g, s };
  }).sort((a, b) => b.s - a.s || a.g.title.localeCompare(b.g.title)).slice(0, 8).map((x) => x.g);
}
for (const g of games) {
  const crumbs = [{ label: 'Home', href: '/' }, { label: genreLabels[g.genres[0]], href: `/games/${g.genres[0]}` }, { label: g.title, href: `/games/${g.slug}` }];
  page(`games/${g.slug}.html`, {
    path: `/games/${g.slug}`, kind: 'game', nav: 'discover', title: g.title, ogType: 'website',
    description: `${g.summary} ${playersText(g)}, ${g.genres.map((x) => genreLabels[x].toLowerCase()).join(' and ')}. ${g.embedAllowed ? 'Play free on GameAtlas.' : `Where to play and what you need.`}`.slice(0, 300),
    ogImage: `${site.baseUrl}/og/${g.slug}.jpg`,
    body: gamePage(ctx, g, similarTo(g)),
    jsonLd: [gameJsonLd(site, g, taxonomy), breadcrumbLd(site, crumbs)],
  });
}

// ---- saved, account, about, 404 ------------------------------------------
page('saved.html', {
  path: '/saved', kind: 'saved', nav: 'saved', title: 'Saved games', noindex: true,
  description: 'Your saved games, recently played games and saved searches, stored in this browser.',
  body: `<div class="wrap narrow-page saved-page">
<h1>Saved games</h1>
<p class="intro">Saved on this device only. No account needed.</p>
<section class="section" aria-labelledby="sv-fav"><div class="section-head"><h2 id="sv-fav">Favourites <span class="count" data-fav-count></span></h2></div>
<ul class="grid" data-fav-grid></ul>
<p class="empty-note" data-fav-empty hidden>Nothing saved yet. Tap ${icon('heart')} <strong>Save</strong> on any game to keep it here.</p>
<p class="account-hint" data-account-hint hidden>Want to access your saved games on another device? <a href="/account">Log in</a> <button type="button" class="link-btn" data-hint-dismiss>Not now</button></p>
</section>
<section class="section" aria-labelledby="sv-recent"><div class="section-head"><h2 id="sv-recent">Recently played</h2><button type="button" class="link-btn" data-clear-recent hidden>Clear</button></div>
<ul class="recent-list" data-recent-list></ul>
<p class="empty-note" data-recent-empty hidden>Games you start here, or open on their official site, will show up here.</p>
</section>
<section class="section" aria-labelledby="sv-searches"><div class="section-head"><h2 id="sv-searches">Saved searches</h2></div>
<ul class="saved-searches" data-search-list></ul>
<p class="empty-note" data-search-empty hidden>Use <strong>Save search</strong> on any results page to keep a set of filters.</p>
</section>
<p class="storage-note" data-storage-note hidden>${icon('info')}This browser is blocking site storage, so saves will be lost when you close the tab.</p>
</div>`,
});

page('account.html', {
  path: '/account', kind: 'account', nav: 'account', title: 'Log in', noindex: true,
  description: 'GameAtlas works without an account. Move your saved games between devices with a file.',
  body: `<div class="wrap narrow-page account-page">
<h1>Log in</h1>
<div class="callout"><p><strong>You don't need an account.</strong> Browsing, searching, filtering, playing and saving games all work without one. Your saves are kept in this browser.</p>
<p>Accounts for syncing saves across devices are not available yet. When they arrive they will stay optional.</p></div>
<section class="section" aria-labelledby="ac-move"><h2 id="ac-move">Move your saves to another device</h2>
<p>Download your favourites, recently played games and saved searches as a small file, then open it on your other device.</p>
<div class="button-row"><button type="button" class="btn btn-primary" data-export>${icon('download')}Download my saves</button>
<label class="btn btn-outline file-btn">${icon('upload')}Load a saves file<input type="file" accept="application/json,.json" data-import class="visually-hidden"></label></div>
<p class="form-status" data-import-status role="status" aria-live="polite"></p>
<p class="muted small">The file stays on your devices. GameAtlas has no server that stores it.</p>
</section>
<section class="section" aria-labelledby="ac-clear"><h2 id="ac-clear">Clear saved data</h2>
<p>Remove all favourites, history, saved searches and preferences from this browser.</p>
<button type="button" class="btn btn-outline btn-danger" data-clear-all>${icon('trash')}Clear everything</button></section>
</div>`,
});

page('about.html', {
  path: '/about', kind: 'about', nav: 'about', title: 'About & listing policy',
  description: 'How GameAtlas lists games, where the information comes from, how embedding works, and what the site does (and does not) do with your data.',
  body: `<div class="wrap narrow-page prose-page">
<h1>About GameAtlas</h1>
<p class="intro">${e(site.tagline)} GameAtlas is a game directory built around the questions people actually ask: how many of us can play, together or against each other, in the same room or online, on what, and for how long.</p>
<h2>How games are listed</h2>
<ul>
<li>Every listing links to the game's official source: its store page, official site or publisher page. That link is shown on each game page.</li>
<li>Descriptions are written for GameAtlas. We don't copy store text, screenshots or artwork. Cover images are original artwork generated for this site.</li>
<li>Facts such as player counts, modes, platforms and price come from the official store listing or the developer, and were checked on the date shown on each page. They can change, so please <a href="${e(site.issuesUrl)}" rel="noopener">report anything out of date</a>.</li>
<li>Listing a game doesn't mean GameAtlas owns, sells or hosts it.</li>
</ul>
<h2>Games you can play here</h2>
<p>Games marked <strong>Play here</strong> are GameAtlas Originals: small games made for this site, whose source code is public. They are the only games embedded on GameAtlas. Other games are never downloaded, copied or re-hosted; we only link to them.</p>
<p>Fullscreen shows only the game, with no ads, no navigation and no pop-ups on top. Press <kbd>Esc</kbd> to return to the page.</p>
<h2>Privacy</h2>
<p>GameAtlas has no analytics, no tracking scripts and no third-party cookies. Favourites, recently played games, saved searches and your theme are stored in your browser's local storage and never leave your device unless you download them yourself.</p>
<h2>Accounts</h2>
<p>Nothing here needs an account. Optional sign-in to sync saves between devices may come later; until then you can <a href="/account">move saves with a file</a>.</p>
<h2>Advertising</h2>
<p>GameAtlas may show a small number of clearly labelled ads in the future. They will never cover games or filters, never appear inside fullscreen play, never pop up and never auto-play sound. The spaces marked “Advertisement” show where they would go.</p>
<h2>Found a mistake?</h2>
<p>Open an issue on <a href="${e(site.issuesUrl)}" rel="noopener">GitHub</a>. Suggestions for games to add are welcome too.</p>
</div>`,
});

page('404.html', {
  path: '/404', kind: 'notfound', nav: '', title: 'Page not found', noindex: true,
  description: 'This page does not exist on GameAtlas.',
  body: `<div class="wrap narrow-page notfound">
<p class="eyebrow">404</p>
<h1>We couldn't find that page</h1>
<p class="intro">The link may be old or mistyped. <span data-suggest-intro hidden>Did you mean one of these?</span></p>
<ul class="grid" data-suggest-grid></ul>
<form class="browse-search" action="/discover" method="get" role="search"><div class="search-field">${icon('search')}<label class="visually-hidden" for="nf-q">Search games</label><input id="nf-q" type="search" name="q" placeholder="Search games"></div></form>
<p><a class="btn btn-primary" href="/">Go to the home page</a> <a class="btn btn-outline" href="/discover">Browse all games</a></p>
</div>`,
});

// ---- sitemap, robots, headers, redirects ----------------------------------
const today = new Date().toISOString().slice(0, 10);
const urls = ['/', '/discover', '/categories', '/multiplayer', '/new', '/about',
  ...liveCategories.map((c) => `/games/${c.slug}`), ...games.map((g) => `/games/${g.slug}`)];
out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${site.baseUrl}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
out('robots.txt', `User-agent: *\nAllow: /\nDisallow: /saved\nDisallow: /account\n\nSitemap: ${site.baseUrl}/sitemap.xml\n`);

const csp = [
  "default-src 'self'", `script-src 'self' 'sha256-${themeHash}'`, "style-src 'self'", "img-src 'self' data:",
  "font-src 'self'", "connect-src 'self'", "frame-src 'self'", "frame-ancestors 'self'", "base-uri 'self'",
  "form-action 'self'", "object-src 'none'",
].join('; ');
out('_headers', `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self), gamepad=(self)
  X-Frame-Options: SAMEORIGIN

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/data/*
  Cache-Control: public, max-age=31536000, immutable

/img/*
  Cache-Control: public, max-age=604800

/covers/*
  Cache-Control: public, max-age=86400

/og/*
  Cache-Control: public, max-age=86400

/play/*
  Cache-Control: public, max-age=3600
`);
// Trailing-slash variants redirect to the canonical URL (drop-trailing-slash only handles folders with index.html).
const topPages = ['discover', 'categories', 'multiplayer', 'new', 'saved', 'account', 'about'];
out('_redirects', [
  '/games /discover 301', '/games/ /discover 301', '/search /discover 301', '/login /account 301', '/favorites /saved 301',
  ...topPages.map((x) => `/${x}/ /${x} 301`),
  '/games/:slug/ /games/:slug 301',
].join('\n') + '\n');

const pageCount = walk(DIST).filter((f) => f.endsWith('.html') && !f.includes(`${join('dist', 'play')}`)).length;
console.log(`Built ${games.length} games, ${liveCategories.length} category pages, ${pageCount} HTML pages -> dist/ (assets ${version})`);
