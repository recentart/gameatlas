// Catalog validation. The build refuses to run if this returns any errors.
import { filterGames, emptyFilters, mergeFilters, GROUPS } from '../../src/js/lib/filters.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUIRED = ['slug', 'title', 'developer', 'summary', 'description', 'players', 'modes', 'genres', 'platforms', 'price',
  'downloadRequired', 'accountRequired', 'controllerSupport', 'keyboardSupport', 'mobileFriendly', 'familyFriendly',
  'sessionLength', 'controls', 'tags', 'sourceName', 'sourceUrl', 'embedAllowed', 'added'];
const BOOLS = ['downloadRequired', 'accountRequired', 'controllerSupport', 'keyboardSupport', 'mobileFriendly', 'familyFriendly', 'embedAllowed'];
// Pages that live at /games/<x> or top level and must not collide with game slugs.
const RESERVED = new Set(['index', 'search', 'discover', 'categories', 'multiplayer', 'new', 'saved', 'account', 'about', '404', 'play', 'assets', 'covers', 'data', 'og']);

export function validateCatalog({ games, taxonomy, categories }) {
  const errors = [];
  const warn = [];
  const ids = (list) => new Set(list.map((x) => x.id));
  const genreIds = ids(taxonomy.genres), modeIds = ids(taxonomy.modes), platformIds = ids(taxonomy.platforms);
  const lengthIds = ids(taxonomy.lengths), priceIds = ids(taxonomy.price);
  const slugs = new Set();

  for (const g of games) {
    const at = `game "${g.slug || g.title || '?'}"`;
    for (const k of REQUIRED) if (g[k] === undefined) errors.push(`${at}: missing ${k}`);
    if (!SLUG.test(g.slug || '')) errors.push(`${at}: bad slug`);
    if (slugs.has(g.slug)) errors.push(`${at}: duplicate slug`);
    slugs.add(g.slug);
    if (RESERVED.has(g.slug)) errors.push(`${at}: slug is reserved`);
    for (const k of BOOLS) if (typeof g[k] !== 'boolean') errors.push(`${at}: ${k} must be true/false`);

    const p = g.players || {};
    if (!Number.isInteger(p.min) || p.min < 1) errors.push(`${at}: players.min must be an integer >= 1`);
    if (p.max !== null && (!Number.isInteger(p.max) || p.max < p.min)) errors.push(`${at}: players.max must be null or >= min`);
    for (const k of ['local', 'online']) if (p[k] !== undefined && p[k] !== null && (!Number.isInteger(p[k]) || (p.max !== null && p[k] > p.max))) errors.push(`${at}: players.${k} out of range`);

    for (const m of g.modes || []) if (!modeIds.has(m)) errors.push(`${at}: unknown mode ${m}`);
    for (const x of g.genres || []) if (!genreIds.has(x)) errors.push(`${at}: unknown genre ${x}`);
    for (const x of g.platforms || []) if (!platformIds.has(x)) errors.push(`${at}: unknown platform ${x}`);
    if (!g.genres?.length) errors.push(`${at}: needs at least one genre`);
    if (!g.platforms?.length) errors.push(`${at}: needs at least one platform`);
    if (!priceIds.has(g.price)) errors.push(`${at}: price must be free or paid`);
    if (!lengthIds.has(g.sessionLength)) errors.push(`${at}: unknown sessionLength ${g.sessionLength}`);

    const multi = ['local-coop', 'local-pvp', 'online-coop', 'online-pvp'].some((m) => g.modes?.includes(m));
    if (p.max === 1 && multi) errors.push(`${at}: 1-player game cannot have multiplayer modes`);
    if (p.max !== 1 && !multi) errors.push(`${at}: multiplayer player count but no multiplayer mode`);
    if (p.min > 1 && g.modes?.includes('single')) errors.push(`${at}: has single mode but players.min > 1`);
    if ((g.modes || []).some((m) => m.startsWith('local-')) && p.local === undefined) warn.push(`${at}: local modes without players.local`);
    if (g.platforms?.includes('browser') && g.downloadRequired && !g.platforms.every((x) => x === 'browser')) { /* browser plus apps is fine */ }
    if (g.platforms?.length === 1 && g.platforms[0] === 'browser' && g.downloadRequired) errors.push(`${at}: browser-only game marked downloadRequired`);

    if (typeof g.sourceUrl !== 'string' || !/^https:\/\//.test(g.sourceUrl)) errors.push(`${at}: sourceUrl must be https`);
    if (g.embedAllowed) {
      if (g.embedUrl !== `/play/${g.slug}`) errors.push(`${at}: embedAllowed needs a local /play/<slug> embedUrl (only self-hosted, permitted games are embedded)`);
      if (g.embedShape !== undefined && !['wide', 'board'].includes(g.embedShape)) errors.push(`${at}: embedShape must be wide or board`);
    } else if (g.embedUrl) errors.push(`${at}: embedUrl set but embedAllowed is false`);
    if (g.steamAppId !== undefined && !String(g.sourceUrl).includes(`/app/${g.steamAppId}/`) && g.sourceName === 'Steam') errors.push(`${at}: steamAppId does not match sourceUrl`);
    if (g.summary && g.summary.length > 110) errors.push(`${at}: summary longer than 110 characters (${g.summary.length})`);
    if (g.released !== null && g.released !== undefined && !(Number.isInteger(g.released) && g.released >= 1970 && g.released <= 2030)) errors.push(`${at}: bad released year`);
  }

  // Categories: valid filters, no slug collisions, and enough games to be useful.
  const catSlugs = new Set();
  const counts = {};
  for (const c of categories.categories) {
    const at = `category "${c.slug}"`;
    if (!SLUG.test(c.slug)) errors.push(`${at}: bad slug`);
    if (catSlugs.has(c.slug)) errors.push(`${at}: duplicate slug`);
    if (slugs.has(c.slug)) errors.push(`${at}: collides with a game slug (both live under /games/)`);
    catSlugs.add(c.slug);
    for (const k of Object.keys(c.filters)) if (!GROUPS.includes(k)) errors.push(`${at}: unknown filter group ${k}`);
    const n = filterGames(games, mergeFilters(emptyFilters(), c.filters)).length;
    counts[c.slug] = n;
  }
  return { errors, warnings: warn, counts };
}
