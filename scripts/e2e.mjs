// End-to-end browser tests (headless Chrome over CDP, no dependencies).
//   node scripts/e2e.mjs                 -> builds nothing; serves dist/ locally
//   BASE_URL=https://... node scripts/e2e.mjs   -> tests a deployed site
import { writeFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './lib/chrome.mjs';
import { startServer } from './serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://localhost:8790';
const server = process.env.BASE_URL ? null : await startServer(8790);
const games = JSON.parse(readFileSync(join(ROOT, 'data/games.json'), 'utf8'));
const shots = join(ROOT, '.cache/e2e');
mkdirSync(shots, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
async function t(name, fn) {
  try { await fn(); results.push([true, name]); console.log(`  ok   ${name}`); }
  catch (e) { results.push([false, name, e.message]); console.log(`  FAIL ${name}\n       ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const chrome = await launchChrome();

async function open(path, { width = 1366, height = 900, mobile = false, init, reducedMotion = false } = {}) {
  const p = await chrome.newPage();
  p.errors = [];
  p.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') p.errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/status of 404/.test(m.params.entry.text)) p.errors.push(`${m.params.entry.text} ${m.params.entry.url || ''}`);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') p.errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  await p.viewport(width, height, { mobile, scale: mobile ? 2 : 1 });
  if (reducedMotion) await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (init) await p.send('Page.addScriptToEvaluateOnNewDocument', { source: init });
  await p.goto(BASE + path);
  await p.waitFor('document.readyState === "complete"');
  await sleep(250);
  return p;
}
async function clickSel(p, sel) {
  const box = await p.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!box) throw new Error(`no element ${sel}`);
  await sleep(60);
  await p.click(box.x, box.y);
}
const count = (p) => p.eval(`Number(document.querySelector('[data-result-summary] strong')?.textContent)`);
const cardSlugs = (p) => p.eval(`[...document.querySelectorAll('[data-grid] .card')].map(c => c.dataset.slug)`);
async function noErrors(p, label) { assert(!p.errors.length, `${label}: console errors: ${p.errors.join(' | ')}`); }
async function imagesOk(p) {
  // Scroll the page so lazy images load, then check every image decoded.
  await p.eval(`(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } window.scrollTo(0, 0); })()`);
  await p.eval(`(async () => { for (const s of document.querySelectorAll('.strip, [data-continue-list]')) { s.scrollIntoView({ block: 'center' }); for (let x = 0; x <= s.scrollWidth; x += 300) { s.scrollLeft = x; await new Promise(r => setTimeout(r, 30)); } } window.scrollTo(0, 0); })()`);
  // Wait (up to 10 s) for every image to finish, rather than a fixed delay, so slow networks don't flake.
  const pending = `[...document.images].filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.currentSrc || i.src)`;
  for (let i = 0; i < 50 && (await p.eval(pending)).length; i++) await sleep(200);
  const bad = await p.eval(pending);
  assert(!bad.length, `broken/unloaded images: ${bad.slice(0, 5).join(', ')}`);
}
async function noHorizontalScroll(p, label) {
  const [sw, iw] = await p.eval('[document.documentElement.scrollWidth, window.innerWidth]');
  assert(sw <= iw + 1, `${label}: page scrolls horizontally (${sw} > ${iw})`);
}
const byTitle = Object.fromEntries(games.map((g) => [g.slug, g]));

console.log(`Testing ${BASE}`);

// ---------------------------------------------------------------------------
await t('home: renders, search box, player shortcuts, no login walls, no console errors', async () => {
  const p = await open('/');
  assert((await p.eval('document.title')).includes('GameAtlas'), 'title');
  assert(await p.eval(`!!document.querySelector('[data-hero-search] input[placeholder="What do you want to play?"]')`), 'hero search');
  const tiles = await p.eval(`[...document.querySelectorAll('.player-tile .pt-label')].map(x => x.textContent)`);
  assert(JSON.stringify(tiles) === JSON.stringify(['1 Player', '2 Players', '3 Players', '4 Players', '5+ Players', 'Party']), `tiles ${tiles}`);
  const login = await p.eval(`(() => { const a = document.querySelector('.login-link'); const s = getComputedStyle(a); return { text: a.textContent, size: parseFloat(s.fontSize), bg: s.backgroundColor }; })()`);
  assert(login.text === 'Log in' && login.size <= 15, 'Log in link is small text');
  assert(!(await p.eval(`/sign ?up|create an account|register/i.test(document.body.innerText)`)), 'no sign-up prompts');
  assert(!(await p.eval(`!!document.querySelector('dialog[open]')`)), 'no dialog open on load');
  await imagesOk(p);
  await noErrors(p, 'home');
  writeFileSync(join(shots, 'home.png'), await p.screenshot());
  await p.close();
});

await t('home: instant suggestions understand "4 player fighting" and keyboard selects a game', async () => {
  const p = await open('/');
  await clickSel(p, '[data-hero-search] input');
  await p.type('4 player fighting');
  await p.waitFor(`document.querySelectorAll('#hero-list [role=option]').length > 2`);
  const interp = await p.eval(`document.querySelector('[data-hero-search] [data-interpret]').textContent`);
  assert(/4 players/.test(interp) && /Fighting/.test(interp), `interpretation: ${interp}`);
  await p.key('ArrowDown', { keyCode: 40 });
  const sel = await p.eval(`document.querySelector('#hero-list [aria-selected=true]')?.dataset.href`);
  assert(sel && sel.startsWith('/games/'), 'arrow selects an option');
  assert(await p.eval(`document.querySelector('[data-hero-search] input').getAttribute('aria-activedescendant')`), 'aria-activedescendant set');
  await p.key('Enter', { keyCode: 13 });
  await p.waitFor(`location.pathname === ${JSON.stringify(sel)}`);
  await p.close();
});

await t('discover: instant search without reload, natural queries', async () => {
  const p = await open('/discover');
  await p.eval('window.__noReload = 1');
  assert((await count(p)) === games.length, 'all games listed');
  const cases = [
    ['4 player fighting', (g) => g.genres.includes('fighting') && (g.players.max === null || g.players.max >= 4) && g.players.min <= 4],
    ['2 player horror', (g) => g.genres.includes('horror') && g.players.min <= 2 && (g.players.max === null || g.players.max >= 2)],
    ['party games', (g) => g.genres.includes('party')],
    ['local racing', (g) => g.genres.includes('racing') && g.modes.some((m) => m.startsWith('local-'))],
    ['single player RPG', (g) => g.genres.includes('rpg') && g.modes.includes('single')],
  ];
  for (const [q, ok] of cases) {
    await p.eval(`(() => { const i = document.querySelector('#browse-q'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(250);
    const slugs = await cardSlugs(p);
    assert(slugs.length > 0, `${q}: no results`);
    const wrong = slugs.filter((s) => !ok(byTitle[s]));
    assert(!wrong.length, `${q}: wrong results ${wrong}`);
    assert(new URL(await p.eval('location.href')).searchParams.get('q') === q, `${q}: URL not updated`);
  }
  assert(await p.eval('window.__noReload === 1'), 'page reloaded');
  await noErrors(p, 'discover');
  await p.close();
});

await t('discover: player, genre and mode filters, several at once, counts and chips', async () => {
  const p = await open('/discover');
  await p.eval('window.__noReload = 1');
  await clickSel(p, 'input[name=players][value="2"] + span');
  await sleep(150);
  const n2 = await count(p);
  assert(n2 < games.length && n2 > 0, 'players filter narrows');
  for (const s of await cardSlugs(p)) { const g = byTitle[s]; assert(g.players.min <= 2 && (g.players.max === null || g.players.max >= 2 || g.players.plus), `${s} not 2p`); }
  const facet = await p.eval(`Number(document.querySelector('[data-count="genres:horror"]').textContent)`);
  await clickSel(p, 'input[name=genres][value=horror] + .check-box');
  await sleep(150);
  assert((await count(p)) === facet, `facet count ${facet} matches results ${await count(p)}`);
  await clickSel(p, 'input[name=modes][value=online] + .check-box');
  await clickSel(p, 'input[name=modes][value=coop] + .check-box');
  await sleep(150);
  for (const s of await cardSlugs(p)) { const g = byTitle[s]; assert(g.genres.includes('horror') && g.modes.includes('online-coop'), `${s} fails combined filters`); }
  const url = new URL(await p.eval('location.href'));
  assert(url.searchParams.get('players') === '2' && url.searchParams.get('genre') === 'horror' && url.searchParams.get('mode') === 'online,coop', `URL ${url.search}`);
  const chips = await p.eval(`document.querySelectorAll('[data-active-chips] .chip').length`);
  assert(chips === 4, `4 active chips, got ${chips}`);
  await clickSel(p, '[data-active-chips] [data-remove^="genres"]');
  await sleep(150);
  assert(!(await p.eval(`document.querySelector('input[name=genres][value=horror]').checked`)), 'chip removal unchecks');
  await clickSel(p, '[data-clear-filters]');
  await sleep(150);
  assert((await count(p)) === games.length, 'clear all restores everything');
  // Platform, price, length and "other" filters.
  await p.goto(`${BASE}/discover?platform=browser&price=free&length=under-10&feature=no-download,no-account`);
  await p.waitFor(`document.querySelector('[data-result-summary] strong')`);
  await sleep(300);
  for (const s of await cardSlugs(p)) { const g = byTitle[s]; assert(g.platforms.includes('browser') && g.price === 'free' && g.sessionLength === 'under-10' && !g.downloadRequired && !g.accountRequired, `${s} fails feature filters`); }
  assert((await cardSlugs(p)).length > 3, 'feature filters leave results');
  assert(await p.eval('window.__noReload === undefined'), 'navigated fresh (sanity)');
  await noErrors(p, 'filters');
  await p.close();
});

await t('discover: empty results show helpful actions; invalid URL params are ignored', async () => {
  const p = await open('/discover?q=zzqxwv&players=99x&genre=nonsense&sort=evil');
  await sleep(300);
  assert(await p.eval(`!document.querySelector('[data-empty]').hidden`), 'empty state visible');
  assert(await p.eval(`document.querySelectorAll('[data-empty-actions] button').length >= 1`), 'empty actions');
  assert(await p.eval(`document.querySelectorAll('[data-active-chips] .chip').length === 0`), 'bogus filters dropped');
  await clickSel(p, '[data-empty-actions] [data-clear-all], [data-empty-actions] [data-clear-q]');
  await sleep(200);
  assert((await count(p)) === games.length, 'recovered');
  await noErrors(p, 'empty');
  await p.close();
});

await t('discover: sort A–Z and newest', async () => {
  const p = await open('/discover?sort=az');
  await sleep(200);
  const titles = await p.eval(`[...document.querySelectorAll('[data-grid] .card-title')].map(x => x.textContent)`);
  const sorted = [...titles].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  assert(JSON.stringify(titles) === JSON.stringify(sorted), 'A–Z order');
  await p.goto(`${BASE}/new`);
  await sleep(400);
  const years = await p.eval(`[...document.querySelectorAll('[data-grid] .card')].map(c => c.querySelector('.badge-year')?.textContent || '0').map(Number)`);
  assert(years.every((y, i) => i === 0 || y <= years[i - 1] || y === 0), 'newest first');
  await p.close();
});

await t('sidebar collapses to a rail, remembers it, and expands again (desktop)', async () => {
  const p = await open('/discover');
  await clickSel(p, '[data-sidebar-collapse]');
  await sleep(150);
  assert(await p.eval(`document.documentElement.classList.contains('filters-collapsed')`), 'collapsed');
  const w = await p.eval(`document.querySelector('.sidebar').getBoundingClientRect().width`);
  assert(w <= 60, `rail is compact (${w}px)`);
  assert(await p.eval(`document.activeElement.matches('[data-sidebar-expand]')`), 'focus moves to rail button');
  await p.goto(`${BASE}/games/racing`);
  await sleep(200);
  assert(await p.eval(`document.documentElement.classList.contains('filters-collapsed')`), 'remembered across pages');
  await clickSel(p, '[data-sidebar-expand]');
  await sleep(150);
  assert(!(await p.eval(`document.documentElement.classList.contains('filters-collapsed')`)), 'expanded');
  await p.close();
});

await t('mobile: filter drawer slides out, traps focus, filters, closes with Escape', async () => {
  const p = await open('/discover', { width: 390, height: 844, mobile: true });
  assert(!(await p.eval(`document.querySelector('.sidebar').classList.contains('is-open')`)), 'closed initially');
  const off = await p.eval(`document.querySelector('.sidebar').getBoundingClientRect().right`);
  assert(off <= 1, 'drawer off-screen');
  await clickSel(p, '[data-drawer-open]');
  await sleep(300);
  assert(await p.eval(`document.querySelector('.sidebar').classList.contains('is-open')`), 'opens');
  assert(await p.eval(`document.querySelector('.sidebar').contains(document.activeElement)`), 'focus inside drawer');
  assert(await p.eval(`document.querySelector('.site-header').inert === true`), 'page behind is inert');
  await clickSel(p, 'input[name=players][value="4"] + span');
  await sleep(150);
  const shown = await p.eval(`document.querySelector('.drawer-foot [data-result-number]').textContent`);
  assert(Number(shown) === (await count(p)), 'drawer button shows live count');
  await p.key('Escape', { keyCode: 27 });
  await sleep(300);
  assert(!(await p.eval(`document.querySelector('.sidebar').classList.contains('is-open')`)), 'Escape closes');
  assert(await p.eval(`document.activeElement.matches('[data-drawer-open]')`), 'focus returns to Filters button');
  assert(await p.eval(`document.querySelector('.site-header').inert === false`), 'page usable again');
  writeFileSync(join(shots, 'discover-mobile.png'), await p.screenshot());
  await noErrors(p, 'drawer');
  await p.close();
});

await t('responsive: no horizontal scrolling on phone and tablet', async () => {
  for (const [w, h, mobile] of [[390, 844, true], [360, 740, true], [768, 1024, true], [1024, 768, false]]) {
    for (const path of ['/', '/discover', '/games/fighting', '/games/paddle-duel', '/games/baldurs-gate-3', '/saved', '/categories', '/about', '/account']) {
      const p = await open(path, { width: w, height: h, mobile });
      await noHorizontalScroll(p, `${path} @${w}`);
      await p.close();
    }
  }
});

await t('game page (external): details, legitimate source link, save, JSON-LD, canonical, OG image', async () => {
  const p = await open('/games/phasmophobia');
  const g = byTitle.phasmophobia;
  assert((await p.eval('document.querySelector("h1").textContent')) === g.title, 'title');
  const cta = await p.eval(`(() => { const a = document.querySelector('.game-actions a.btn-primary'); return { href: a.href, target: a.target, rel: a.rel, text: a.textContent }; })()`);
  assert(cta.href === g.sourceUrl && cta.target === '_blank' && cta.rel.includes('noopener') && /Play game/.test(cta.text), `CTA ${JSON.stringify(cta)}`);
  const facts = await p.eval(`[...document.querySelectorAll('.facts dt')].map(d => d.textContent)`);
  for (const k of ['Players', 'Multiplayer', 'Genre', 'Platforms', 'Session length', 'Price', 'Account needed', 'Download needed']) assert(facts.includes(k), `fact ${k}`);
  assert(await p.eval(`/doesn't host this game/.test(document.querySelector('.source-note').textContent)`), 'source identified, not owned');
  const ld = await p.eval(`[...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent)['@type'])`);
  assert(ld.includes('VideoGame') && ld.includes('BreadcrumbList'), `JSON-LD ${ld}`);
  const canon = await p.eval(`document.querySelector('link[rel=canonical]').href`);
  assert(canon.endsWith('/games/phasmophobia'), `canonical ${canon}`);
  const og = await p.eval(`document.querySelector('meta[property="og:image"]').content`);
  const ogPath = new URL(og).pathname;
  const ogRes = await p.eval(`fetch(${JSON.stringify(ogPath)}).then(r => r.status + ' ' + r.headers.get('content-type'))`);
  assert(ogRes.startsWith('200 image/'), `og image ${ogRes}`);
  assert(await p.eval(`document.querySelectorAll('.ad-slot').length === 1 && !document.querySelector('.game-hero .ad-slot')`), 'one ad slot, outside the hero');
  await noErrors(p, 'game page');
  await p.close();
});

await t('favourites: save without an account, header count, Saved page, persistence, unsave', async () => {
  const p = await open('/games/celeste');
  await clickSel(p, '.game-actions [data-save]');
  await sleep(150);
  assert(await p.eval(`document.querySelector('.game-actions [data-save]').getAttribute('aria-pressed') === 'true'`), 'pressed');
  assert(await p.eval(`document.querySelector('[data-saved-count]').textContent === '1'`), 'header count');
  const stored = await p.eval(`JSON.parse(localStorage.getItem('gameatlas:v1')).favorites.map(f => f.slug)`);
  assert(stored.includes('celeste'), 'in localStorage');
  await p.goto(`${BASE}/saved`);
  await p.waitFor(`document.querySelector('[data-fav-grid] .card')`);
  assert(await p.eval(`document.querySelector('[data-fav-grid] .card').dataset.slug === 'celeste'`), 'listed on Saved');
  // Cards elsewhere reflect the saved state; unsave from a card.
  await p.goto(`${BASE}/games/platformer`);
  await sleep(300);
  assert(await p.eval(`document.querySelector('.card[data-slug=celeste] [data-save]').getAttribute('aria-pressed') === 'true'`), 'card shows saved');
  await clickSel(p, '.card[data-slug=celeste] [data-save]');
  await sleep(150);
  assert(await p.eval(`!JSON.parse(localStorage.getItem('gameatlas:v1')).favorites.length`), 'removed');
  await p.close();
});

await t('account prompt is quiet: only on Saved, only after 3 saves, dismissible', async () => {
  const p = await open('/saved');
  assert(await p.eval(`document.querySelector('[data-account-hint]').hidden`), 'hidden with 0 saves');
  await p.eval(`(() => { const s = JSON.parse(localStorage.getItem('gameatlas:v1') || '{}'); s.favorites = ['hades','celeste','balatro'].map((slug, i) => ({ slug, at: Date.now() - i })); s.prefs = { ...(s.prefs||{}), accountHintDismissed: false }; localStorage.setItem('gameatlas:v1', JSON.stringify(s)); })()`);
  await p.goto(`${BASE}/saved`);
  await p.waitFor(`document.querySelectorAll('[data-fav-grid] .card').length === 3`);
  const hint = await p.eval(`document.querySelector('[data-account-hint]')`);
  assert(!(await p.eval(`document.querySelector('[data-account-hint]').hidden`)), 'shown after 3 saves');
  assert(await p.eval(`/Want to access your saved games on another device\\? Log in/.test(document.querySelector('[data-account-hint]').textContent)`), 'wording');
  await clickSel(p, '[data-hint-dismiss]');
  await sleep(100);
  await p.goto(`${BASE}/saved`);
  await sleep(300);
  assert(await p.eval(`document.querySelector('[data-account-hint]').hidden`), 'stays dismissed');
  await p.goto(`${BASE}/`);
  assert(!(await p.eval(`/another device/.test(document.body.innerText)`)), 'no prompt on other pages');
  void hint;
  await p.eval(`localStorage.removeItem('gameatlas:v1')`);
  await p.close();
});

await t('embedded game: click to load, fullscreen shows only the game, exit returns to the page', async () => {
  const p = await open('/games/paddle-duel');
  assert(await p.eval(`!document.querySelector('[data-player] iframe')`), 'not loaded until asked');
  await clickSel(p, '.player-start');
  await p.waitFor(`document.querySelector('[data-player] iframe')`);
  const src = await p.eval(`document.querySelector('[data-player] iframe').getAttribute('src')`);
  assert(src === '/play/paddle-duel', `iframe src ${src}`);
  assert(await p.eval(`document.querySelector('[data-player] iframe').getAttribute('sandbox') === 'allow-scripts allow-same-origin allow-pointer-lock'`), 'sandboxed (no pop-ups or top navigation)');
  await sleep(600);
  await clickSel(p, '[data-fullscreen]');
  await sleep(500);
  const fs = await p.eval(`(() => { const f = document.fullscreenElement; return f ? { cls: f.className, kids: [...f.children].map(c => c.tagName), w: f.getBoundingClientRect().width, vw: innerWidth } : (document.querySelector('.is-pseudo-fs') ? 'pseudo' : null); })()`);
  assert(fs && (fs === 'pseudo' || (fs.cls.includes('player-frame') && fs.kids.join() === 'IFRAME' && fs.w >= fs.vw - 1)), `fullscreen element ${JSON.stringify(fs)}`);
  writeFileSync(join(shots, 'fullscreen.png'), await p.screenshot());
  if (fs !== 'pseudo') {
    await p.eval('document.exitFullscreen()');
    await sleep(400);
    assert(await p.eval('!document.fullscreenElement'), 'exited');
    assert(await p.eval(`document.querySelector('[data-fullscreen]').getAttribute('aria-pressed') === 'false'`), 'button reset');
    assert(await p.eval(`document.activeElement.matches('[data-fullscreen]')`), 'focus back on the page');
  }
  const recent = await p.eval(`JSON.parse(localStorage.getItem('gameatlas:v1')).recent.map(r => r.slug)`);
  assert(recent[0] === 'paddle-duel', 'recently played recorded');
  await noErrors(p, 'player');
  await p.close();
});

await t('pseudo-fullscreen fallback (no Fullscreen API, e.g. iPhone) keeps controls off the game', async () => {
  const p = await open('/games/light-trails', { width: 390, height: 844, mobile: true, init: `Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false }); Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false });` });
  await clickSel(p, '.player-start');
  await p.waitFor(`document.querySelector('[data-player] iframe')`);
  await clickSel(p, '[data-fullscreen]');
  await sleep(200);
  const r = await p.eval(`(() => { const bar = document.querySelector('[data-exit-bar]').getBoundingClientRect(); const fr = document.querySelector('[data-player-frame]').getBoundingClientRect(); return { on: !!document.querySelector('.is-pseudo-fs'), overlap: bar.bottom > fr.top + 1, fill: fr.width >= innerWidth - 1 && fr.bottom >= innerHeight - 1 }; })()`);
  assert(r.on && !r.overlap && r.fill, `pseudo fullscreen ${JSON.stringify(r)}`);
  await clickSel(p, '[data-fullscreen-exit]');
  await sleep(150);
  assert(!(await p.eval(`!!document.querySelector('.is-pseudo-fs')`)), 'exits');
  await noErrors(p, 'pseudo fs');
  await p.close();
});

// Each original, played the way visitors play it: embedded in its game page.
const PROBES = {
  'paddle-duel': { act: '', ok: 'GA.updates > 30' },
  'light-trails': { act: '', ok: 'GA.updates > 30' },
  'loop-racer': { act: '', ok: 'GA.updates > 30' },
  'four-in-a-row': { act: `document.querySelector('[data-col="3"]').click()`, ok: `document.querySelectorAll('.cell.p0').length === 1 && document.querySelectorAll('.cell.p1').length === 1` },
  'memory-pairs': { act: `document.querySelector('[data-i="0"]').click(); document.querySelector('[data-i="1"]').click()`, ok: `/Moves 1/.test(document.querySelector('#scores').textContent)` },
  'dots-and-boxes': { act: `document.querySelector('.line[data-id="h-0-0"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`, ok: `document.querySelectorAll('.line.taken').length === 2` },
  'reflex-party': { act: '', ok: `document.querySelector('#rule').textContent.length > 5 && document.querySelectorAll('.zone').length === 2` },
};
for (const g of games.filter((x) => x.embedAllowed)) {
  await t(`embedded game plays inside its page: ${g.title}`, async () => {
    const p = await open(`/games/${g.slug}`);
    await clickSel(p, '.player-start');
    await p.waitFor(`document.querySelector('[data-player] iframe')`);
    const q = PROBES[g.slug] || { act: '', ok: 'true' };
    const inFrame = (expr) => p.evalFrame(`/play/${g.slug}`, expr);
    for (let i = 0; i < 40; i++) { try { if (await inFrame(`!!(window.GA && document.getElementById('start'))`)) break; } catch { /* frame loading */ } await sleep(100); }
    await inFrame(`document.getElementById('start').click()`);
    await sleep(300);
    if (q.act) await inFrame(q.act);
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) { await sleep(150); ok = await inFrame(q.ok); }
    assert(ok, `game did not progress (${q.ok})`);
    await noErrors(p, `${g.slug} embedded`);
    await p.close();
  });
}
for (const g of games.filter((x) => x.embedAllowed)) {
  await t(`original game runs: ${g.title}`, async () => {
    const p = await open(g.embedUrl, { width: 1000, height: 600 });
    assert(await p.eval(`!!document.querySelector('#menu') && !document.querySelector('#menu').hidden`), 'menu shown');
    await clickSel(p, '#start');
    await sleep(800);
    assert(await p.eval(`document.querySelector('#menu').hidden`), 'started');
    // A few inputs to exercise the game loop.
    for (const k of [['KeyW', 'w'], ['ArrowRight', 'ArrowRight'], ['KeyD', 'd'], ['Enter', 'Enter'], ['KeyQ', 'q'], ['KeyP', 'p'], ['KeyP', 'p']]) await p.key(k[1], { code: k[0] });
    await sleep(600);
    await noErrors(p, g.slug);
    writeFileSync(join(shots, `play-${g.slug}.png`), await p.screenshot());
    await p.close();
  });
}


await t('gameplay: computer replies in Four in a Row and Dots and Boxes; cards flip; cars move', async () => {
  let p = await open('/play/four-in-a-row', { width: 1000, height: 650 });
  await clickSel(p, '#start');
  await clickSel(p, '[data-col="3"]');
  await p.waitFor(`document.querySelectorAll('.cell.p0').length === 1 && document.querySelectorAll('.cell.p1').length === 1`, 6000);
  await p.close();
  p = await open('/play/dots-and-boxes', { width: 1000, height: 650 });
  await clickSel(p, '#start');
  await clickSel(p, '.line[data-id="h-0-0"]');
  await p.waitFor(`document.querySelectorAll('.line.taken').length === 2`, 4000);
  await p.close();
  p = await open('/play/memory-pairs', { width: 1000, height: 650 });
  await clickSel(p, '#start');
  await clickSel(p, '[data-i="0"]');
  await clickSel(p, '[data-i="1"]');
  await p.waitFor(`/Moves 1/.test(document.querySelector('#scores').textContent)`, 3000);
  await p.close();
  p = await open('/play/loop-racer', { width: 1000, height: 600 });
  await clickSel(p, '#start');
  await sleep(3300);
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW' });
  await sleep(1500);
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW' });
  const hud = await p.eval(`document.querySelector('#hud').textContent`);
  assert(hud.includes('Lap 1/3') && !hud.endsWith('0.00'), `racing HUD: ${hud}`);
  await noErrors(p, 'loop racer');
  await p.close();
});

await t('recently played lists external opens too', async () => {
  const p = await open('/games/lichess');
  await p.eval(`(() => { const a = document.querySelector('[data-play-external]'); a.addEventListener('click', e => e.preventDefault()); a.click(); })()`);
  await p.goto(`${BASE}/saved`);
  await p.waitFor(`document.querySelectorAll('[data-recent-list] li').length > 0`);
  const first = await p.eval(`document.querySelector('[data-recent-list] a').textContent`);
  assert(first === 'Lichess', `first recent ${first}`);
  await clickSel(p, '[data-clear-recent]');
  await sleep(100);
  assert(await p.eval(`document.querySelectorAll('[data-recent-list] li').length === 0`), 'clear works');
  await p.close();
});

await t('saved searches: save filters on Discover, reopen from Saved', async () => {
  const p = await open('/discover?players=4&genre=party');
  await sleep(200);
  await clickSel(p, '[data-save-search]');
  await p.goto(`${BASE}/saved`);
  await p.waitFor(`document.querySelector('[data-search-list] a')`);
  const href = await p.eval(`document.querySelector('[data-search-list] a').getAttribute('href')`);
  assert(href.includes('players=4') && href.includes('genre=party'), `saved href ${href}`);
  await clickSel(p, '[data-search-list] a');
  await p.waitFor(`location.pathname === '/discover' && document.querySelector('input[name=genres][value=party]').checked`);
  await p.close();
});

await t('category page: prefilled, extra filters work, removing the base filter goes to Discover', async () => {
  const p = await open('/games/4-player');
  assert(await p.eval(`document.querySelector('input[name=players][value="4"]').checked`), 'base checked');
  const n = await count(p);
  await clickSel(p, 'input[name=genres][value=fighting] + .check-box');
  await sleep(150);
  assert((await count(p)) < n, 'narrowed');
  await clickSel(p, 'input[name=players][value="4"] + span');
  await p.waitFor(`location.pathname === '/discover'`);
  assert(await p.eval(`location.search.includes('genre=fighting') && !location.search.includes('players')`), 'kept other filters');
  await p.close();
});

await t('header search dialog: "/" opens it, results, Escape closes and restores focus', async () => {
  const p = await open('/games/hades');
  await p.eval(`document.querySelector('.logo').focus()`);
  await p.key('/', { code: 'Slash', text: '/' });
  await sleep(150);
  assert(await p.eval(`document.querySelector('#search-dialog').open && document.activeElement.matches('#search-dialog input')`), 'opened with focus');
  await p.type('party');
  await p.waitFor(`document.querySelectorAll('#sd-list [role=option]').length > 3`);
  await p.key('Escape', { keyCode: 27 });
  await sleep(150);
  assert(!(await p.eval(`document.querySelector('#search-dialog').open`)), 'closed');
  assert(await p.eval(`document.activeElement.matches('.logo')`), 'focus restored');
  await p.close();
});

await t('keyboard: skip link first, visible focus ring, filters operable by keyboard', async () => {
  const p = await open('/discover');
  await p.key('Tab', { keyCode: 9 });
  assert(await p.eval(`document.activeElement.matches('.skip-link')`), 'skip link first');
  const top = await p.eval(`document.activeElement.getBoundingClientRect().top`);
  assert(top >= 0, 'skip link visible on focus');
  await p.eval(`document.querySelector('input[name=modes][value=single]').focus()`);
  await p.key(' ', { code: 'Space', keyCode: 32, text: ' ' });
  await sleep(150);
  assert(await p.eval(`document.querySelector('input[name=modes][value=single]').checked`), 'space toggles checkbox');
  const ring = await p.eval(`getComputedStyle(document.querySelector('input[name=modes][value=single] + .check-box')).outlineStyle`);
  assert(ring !== 'none', 'focus ring visible');
  await p.close();
});

await t('theme toggle switches and persists; dark mode has no contrast regressions on key text', async () => {
  const p = await open('/');
  await clickSel(p, '[data-theme-toggle]');
  await sleep(100);
  const t1 = await p.eval(`document.documentElement.getAttribute('data-theme')`);
  assert(t1 === 'dark', `theme ${t1}`);
  await p.goto(`${BASE}/discover`);
  assert((await p.eval(`document.documentElement.getAttribute('data-theme')`)) === 'dark', 'persisted');
  const contrast = await p.eval(`(() => {
    const lum = (c) => { const [r, g, b] = c.match(/\\d+(\\.\\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const bg = getComputedStyle(document.querySelector('.card')).backgroundColor;
    return ['.card-summary', '.card-meta', '.card-title a', '.check-label', '.count'].map(s => [s, ratio(getComputedStyle(document.querySelector(s)).color, bg)]);
  })()`);
  for (const [s, r] of contrast) assert(r >= 4.5, `${s} contrast ${r.toFixed(2)}`);
  await clickSel(p, '[data-theme-toggle]');
  await p.close();
});

await t('light mode text contrast meets WCAG AA', async () => {
  const p = await open('/discover');
  const contrast = await p.eval(`(() => {
    const lum = (c) => { const [r, g, b] = c.match(/\\d+(\\.\\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const card = getComputedStyle(document.querySelector('.card')).backgroundColor;
    const page = getComputedStyle(document.body).backgroundColor;
    return [['.card-summary', card], ['.card-meta', card], ['.count', card], ['.badge-free', null], ['.badge-paid', null], ['.result-count', page], ['.fgroup legend', card]].map(([s, bg]) => { const el = document.querySelector(s); const b = bg || getComputedStyle(el).backgroundColor; return [s, ratio(getComputedStyle(el).color, b)]; });
  })()`);
  for (const [s, r] of contrast) assert(r >= 4.5, `${s} contrast ${r.toFixed(2)}`);
  await p.close();
});

await t('reduced motion preference disables transitions', async () => {
  const p = await open('/discover', { reducedMotion: true });
  const d = await p.eval(`getComputedStyle(document.querySelector('.card')).transitionDuration`);
  assert(/^0s/.test(d), `transition ${d}`);
  await p.close();
});

await t('blocked localStorage: site still works and warns on Saved', async () => {
  const block = `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });`;
  const p = await open('/games/hades', { init: block });
  await clickSel(p, '.game-actions [data-save]');
  await sleep(100);
  assert(await p.eval(`document.querySelector('.game-actions [data-save]').getAttribute('aria-pressed') === 'true'`), 'save works in memory');
  await p.goto(`${BASE}/saved`);
  await sleep(400);
  assert(!(await p.eval(`document.querySelector('[data-storage-note]').hidden`)), 'storage warning shown');
  await noErrors(p, 'blocked storage');
  await p.close();
});

await t('account page: optional, export and import saves', async () => {
  const p = await open('/account');
  assert(await p.eval(`/You don't need an account/.test(document.body.innerText)`), 'optional');
  assert(!(await p.eval(`!!document.querySelector('input[type=password]')`)), 'no fake login form');
  const file = join(ROOT, '.cache', 'import-test.json');
  writeFileSync(file, JSON.stringify({ app: 'GameAtlas', data: { favorites: [{ slug: 'portal-2', at: 1 }], recent: [], savedSearches: [] } }));
  const { root } = await p.send('DOM.getDocument', {});
  const { nodeId } = await p.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-import]' });
  await p.send('DOM.setFileInputFiles', { nodeId, files: [file] });
  await p.waitFor(`/Loaded: 1 favourites/.test(document.querySelector('[data-import-status]').textContent)`);
  assert(await p.eval(`JSON.parse(localStorage.getItem('gameatlas:v1')).favorites.some(f => f.slug === 'portal-2')`), 'imported');
  await p.eval(`localStorage.removeItem('gameatlas:v1')`);
  await noErrors(p, 'account');
  await p.close();
});

await t('invalid game URL: real 404 status, suggestions for near misses; trailing slashes redirect', async () => {
  for (const [from, to] of [['/games/fighting/', '/games/fighting'], ['/discover/', '/discover']]) {
    const r = await fetch(BASE + from, { redirect: 'manual' });
    assert([301, 307, 308].includes(r.status) && new URL(r.headers.get('location'), BASE).pathname === to, `${from} -> ${r.status} ${r.headers.get('location')}`);
  }
  const res = await fetch(`${BASE}/games/paddle-dual`);
  assert(res.status === 404, `status ${res.status}`);
  const p = await open('/games/paddle-dual');
  await p.waitFor(`document.querySelector('[data-suggest-grid] .card')`);
  assert(await p.eval(`document.querySelector('[data-suggest-grid] .card').dataset.slug === 'paddle-duel'`), 'suggests Paddle Duel');
  const p2 = await fetch(`${BASE}/definitely/not/here`);
  assert(p2.status === 404, 'other paths 404');
  await noErrors(p, '404');
  await p.close();
});

await t('SEO files and headers: sitemap, robots, CSP, unique titles and descriptions', async () => {
  const sm = await (await fetch(`${BASE}/sitemap.xml`)).text();
  assert(sm.includes('/games/paddle-duel') && sm.includes('/games/4-player') && !sm.includes('/saved'), 'sitemap');
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  assert(robots.includes('Sitemap:'), 'robots');
  const home = await fetch(`${BASE}/`);
  const csp = home.headers.get('content-security-policy') || '';
  assert(csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'self'"), `CSP ${csp}`);
  const seen = new Map();
  for (const path of ['/', '/discover', '/games/fighting', '/games/2-player', '/games/horror', '/games/paddle-duel', '/games/minecraft', '/multiplayer', '/new', '/categories']) {
    const html = await (await fetch(BASE + path)).text();
    const title = html.match(/<title>([^<]+)/)[1];
    const desc = html.match(/name="description" content="([^"]+)/)[1];
    assert(!seen.has(title), `duplicate title ${title}`);
    assert(![...seen.values()].includes(desc), `duplicate description on ${path}`);
    seen.set(title, desc);
  }
});

await t('every internal link on every built page resolves', async () => {
  if (process.env.BASE_URL) return; // local build only (fast)
  const dist = join(ROOT, 'dist');
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else if (f.endsWith('.html')) files.push(f); } };
  walk(dist);
  const links = new Set();
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/(?:href|src)="(\/[^"#?]*)/g)) links.add(m[1]);
  const bad = [];
  const list = [...links];
  for (let i = 0; i < list.length; i += 16) {
    await Promise.all(list.slice(i, i + 16).map(async (l) => { const r = await fetch(BASE + l, { method: 'HEAD', redirect: 'manual' }); if (r.status !== 200) bad.push(`${l} ${r.status}`); }));
  }
  assert(!bad.length, `broken links: ${bad.slice(0, 10).join(', ')}`);
  console.log(`       (${links.size} unique internal links across ${files.length} pages)`);
});

await t('performance: small JS/CSS, lazy thumbnails, fast load', async () => {
  const p = await open('/');
  const perf = await p.eval(`(() => {
    const r = performance.getEntriesByType('resource');
    const sum = (f) => r.filter(f).reduce((n, e) => n + (e.encodedBodySize || e.transferSize || 0), 0);
    const nav = performance.getEntriesByType('navigation')[0];
    return { js: sum(e => e.name.endsWith('.js')), css: sum(e => e.name.endsWith('.css')), dcl: nav.domContentLoadedEventEnd, lazy: [...document.images].filter(i => i.loading === 'lazy').length, imgs: document.images.length, third: r.filter(e => !e.name.startsWith(location.origin)).map(e => e.name) };
  })()`);
  assert(perf.js < 90000, `JS ${perf.js} bytes`);
  assert(perf.css < 60000, `CSS ${perf.css} bytes`);
  assert(perf.lazy >= perf.imgs - 2, `lazy images ${perf.lazy}/${perf.imgs}`);
  assert(!perf.third.length, `third-party requests: ${perf.third}`);
  assert(perf.dcl < 3000, `DOMContentLoaded ${perf.dcl}ms`);
  console.log(`       js ${perf.js}B css ${perf.css}B dcl ${Math.round(perf.dcl)}ms`);
  await p.close();
});

await t('broken images: category, game and saved pages', async () => {
  for (const path of ['/games/party', '/games/it-takes-two', '/categories', '/multiplayer']) {
    const p = await open(path);
    await imagesOk(p);
    await noErrors(p, path);
    await p.close();
  }
});

await chrome.close();
server?.close();
const failed = results.filter((r) => !r[0]);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? `; failed: ${failed.map((f) => f[1]).join(' | ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
