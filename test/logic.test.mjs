import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseQuery, search, normalize } from '../src/js/lib/search.js';
import { emptyFilters, filterGames, facetCount, parseState, serializeState, supportsPlayers } from '../src/js/lib/filters.js';
import { createStore, sanitize, STORAGE_KEY } from '../src/js/lib/storage.js';
import { playersLabel, modeSummary, labelMap } from '../src/js/lib/format.js';
import { validateCatalog } from '../scripts/lib/validate.mjs';

const games = JSON.parse(readFileSync(new URL('../data/games.json', import.meta.url)));
const taxonomy = JSON.parse(readFileSync(new URL('../data/taxonomy.json', import.meta.url)));
const categories = JSON.parse(readFileSync(new URL('../data/categories.json', import.meta.url)));
const labels = labelMap(taxonomy.genres);
const bySlug = Object.fromEntries(games.map((g) => [g.slug, g]));
const run = (q, extra = {}) => search(games, { q, filters: emptyFilters(), ...extra }, labels);
const slugs = (r) => r.results.map((g) => g.slug);

test('catalog validates with no errors and every category has enough games', () => {
  const { errors, counts } = validateCatalog({ games, taxonomy, categories });
  assert.deepEqual(errors, []);
  for (const [slug, n] of Object.entries(counts)) assert.ok(n >= categories.minGames, `${slug} has ${n}`);
});

test('query parsing: player counts, genres and modes', () => {
  const p = parseQuery('4 player fighting games');
  assert.deepEqual(p.filters.players, ['4']);
  assert.deepEqual(p.filters.genres, ['fighting']);
  assert.deepEqual(p.terms, []);
  assert.deepEqual(parseQuery('two player horror').filters.players, ['2']);
  assert.deepEqual(parseQuery('single player RPG').filters.players, ['1']);
  assert.deepEqual(parseQuery('single player RPG').filters.genres, ['rpg']);
  assert.deepEqual(parseQuery('local racing').filters.modes, ['local']);
  assert.deepEqual(parseQuery('couch co-op').filters.modes, ['local', 'coop']);
  assert.deepEqual(parseQuery('5+ players').filters.players, ['5+']);
  assert.deepEqual(parseQuery('games for 6').filters.players, ['6']);
  assert.deepEqual(parseQuery('party games').filters.genres, ['party']);
  assert.deepEqual(parseQuery('quick games').filters.length, ['under-10']);
  assert.deepEqual(parseQuery('free browser games').filters.price, ['free']);
  assert.deepEqual(parseQuery('free browser games').filters.platforms, ['browser']);
  assert.deepEqual(parseQuery('.io games').filters.genres, ['io']);
});

test('search results honour every parsed constraint', () => {
  const r = run('4 player fighting');
  assert.ok(r.results.length >= 4);
  for (const g of r.results) {
    assert.ok(g.genres.includes('fighting'), g.slug);
    assert.ok(supportsPlayers(g, '4'), g.slug);
  }
  assert.ok(!slugs(r).includes('street-fighter-6'), '1v1 fighter excluded from 4 player');
  const h = run('2 player horror');
  assert.ok(slugs(h).includes('phasmophobia'));
  assert.ok(!slugs(h).includes('five-nights-at-freddys'));
  const lr = run('local racing');
  assert.ok(slugs(lr).includes('mario-kart-8-deluxe'));
  assert.ok(slugs(lr).includes('loop-racer'));
  assert.ok(!slugs(lr).includes('forza-horizon-5'));
});

test('title searches find the game even when words look like filters', () => {
  assert.equal(slugs(run('stick fight'))[0], 'stick-fight-the-game');
  assert.equal(slugs(run('Mario Kart'))[0], 'mario-kart-8-deluxe');
  assert.equal(slugs(run('It Takes Two'))[0], 'it-takes-two');
  assert.equal(slugs(run('among us'))[0], 'among-us');
  assert.equal(slugs(run('2048'))[0], '2048');
  assert.equal(slugs(run('golf with your friends'))[0], 'golf-with-your-friends');
  assert.equal(slugs(run('chess'))[0], 'lichess');
});

test('typos and prefixes still match', () => {
  assert.ok(slugs(run('phasmaphobia')).includes('phasmophobia'));
  assert.ok(slugs(run('stardw')).includes('stardew-valley'));
  assert.equal(run('zzzzqqq').results.length, 0);
});

test('unmatched keywords fall back to the structured part', () => {
  const r = run('4 player fighting xylophone');
  assert.equal(r.fallback, true);
  assert.ok(r.results.length > 0);
});

test('mode pairing: Local + Co-op means local co-op', () => {
  const f = emptyFilters();
  f.modes = ['local', 'coop'];
  const out = filterGames(games, f);
  for (const g of out) assert.ok(g.modes.includes('local-coop'), g.slug);
  assert.ok(!out.some((g) => g.slug === 'mario-kart-8-deluxe'), 'local versus only');
});

test('players filter semantics', () => {
  assert.equal(supportsPlayers(bySlug['it-takes-two'], '1'), false);
  assert.equal(supportsPlayers(bySlug['it-takes-two'], '2'), true);
  assert.equal(supportsPlayers(bySlug['it-takes-two'], '3'), false);
  assert.equal(supportsPlayers(bySlug['keep-talking-and-nobody-explodes'], '5+'), true);
  assert.equal(supportsPlayers(bySlug['minecraft'], '12'), true, 'plus means more is fine');
  assert.equal(supportsPlayers(bySlug['among-us'], '2'), false);
  assert.equal(supportsPlayers(bySlug['counter-strike-2'], '1'), false, 'no single-player mode');
});

test('multiple filters combine (AND across groups, OR within)', () => {
  const f = emptyFilters();
  f.players = ['2'];
  f.genres = ['horror', 'racing'];
  f.price = ['paid'];
  const out = filterGames(games, f);
  assert.ok(out.length > 0);
  for (const g of out) {
    assert.ok(g.genres.includes('horror') || g.genres.includes('racing'));
    assert.equal(g.price, 'paid');
  }
  f.features = ['play-here', 'no-account'];
  for (const g of filterGames(games, f)) assert.ok(g.embedUrl);
});

test('facet counts match the result count they promise', () => {
  const f = emptyFilters();
  f.players = ['4'];
  const n = facetCount(games, f, 'genres', 'fighting');
  const g = emptyFilters(); g.players = ['4']; g.genres = ['fighting'];
  assert.equal(n, filterGames(games, g).length);
});

test('URL state round-trips and drops unknown values', () => {
  const s = parseState('?q=party&players=2,4,99x&genre=fighting,nonsense&feature=no-download&sort=az', taxonomy);
  assert.equal(s.q, 'party');
  assert.deepEqual(s.filters.players, ['2', '4']);
  assert.deepEqual(s.filters.genres, ['fighting']);
  assert.equal(s.sort, 'az');
  const again = parseState(serializeState(s), taxonomy);
  assert.deepEqual(again, s);
  assert.equal(parseState('?sort=evil', taxonomy).sort, 'relevance');
});

test('formatting', () => {
  assert.equal(playersLabel({ min: 1, max: 1 }), '1 player');
  assert.equal(playersLabel({ min: 2, max: 4 }), '2–4 players');
  assert.equal(playersLabel({ min: 2, max: null }), '2+ players');
  assert.equal(playersLabel({ min: 1, max: 10, plus: true }), '1–10+ players');
  assert.equal(modeSummary(bySlug['overcooked-2']), 'Local & online multiplayer');
  assert.equal(modeSummary(bySlug['it-takes-two']), 'Local & online co-op');
  assert.equal(modeSummary(bySlug['celeste']), 'Single player');
  assert.equal(normalize('Co-op 4-Player'), 'coop 4 player');
});

function memoryBackend() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m };
}

test('storage: favourites, recent, saved searches, prefs', () => {
  const b = memoryBackend();
  let t = 1000;
  const store = createStore(b, { now: () => ++t });
  assert.equal(store.toggleFavorite('celeste'), true);
  assert.equal(store.isFavorite('celeste'), true);
  assert.equal(store.toggleFavorite('celeste'), false);
  store.toggleFavorite('hades');
  for (let i = 0; i < 40; i++) store.addRecent(`game-${i}`);
  store.addRecent('game-5');
  const s = store.get();
  assert.equal(s.recent.length, 30);
  assert.equal(s.recent[0].slug, 'game-5');
  assert.equal(s.recent.filter((r) => r.slug === 'game-5').length, 1);
  store.saveSearch('Party for 4', '?players=4&genre=party');
  store.saveSearch('Party for 4 again', '?players=4&genre=party');
  assert.equal(store.get().savedSearches.length, 1);
  store.setPref('sidebarCollapsed', true);
  assert.equal(createStore(b).getPref('sidebarCollapsed'), true, 'persists across instances');
});

test('storage: survives corrupt data and a throwing backend', () => {
  const b = memoryBackend();
  b.setItem(STORAGE_KEY, '{not json');
  const store = createStore(b);
  assert.deepEqual(store.get().favorites, []);
  store.toggleFavorite('celeste');
  assert.equal(store.isFavorite('celeste'), true);

  const broken = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  const mem = createStore(broken);
  mem.toggleFavorite('hades');
  assert.equal(mem.isFavorite('hades'), true, 'falls back to memory');
  assert.equal(mem.isPersistent(), false);
});

test('storage: sanitize rejects junk and export/import merges', () => {
  const s = sanitize({ favorites: [{ slug: '../evil' }, { slug: 'ok-game', at: 5 }, { slug: 'ok-game' }], prefs: { theme: 'neon' } });
  assert.deepEqual(s.favorites, [{ slug: 'ok-game', at: 5 }]);
  assert.equal(s.prefs.theme, 'system');
  const a = createStore(memoryBackend());
  a.toggleFavorite('celeste');
  a.saveSearch('x', '?genre=racing');
  const file = JSON.parse(JSON.stringify(a.exportData()));
  const b = createStore(memoryBackend());
  b.toggleFavorite('hades');
  const added = b.importData(file);
  assert.equal(added.favorites, 1);
  assert.deepEqual(b.get().favorites.map((f) => f.slug).sort(), ['celeste', 'hades']);
  assert.equal(b.get().savedSearches.length, 1);
});
