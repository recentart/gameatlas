// Filter model: state shape, matching, facet counts and URL (de)serialisation.
// Pure functions only, so they run in Node tests, in the build and in the browser.
//
// Semantics (documented in README):
//   players, genres, platforms, price, length  -> OR within the group
//   modes, features                            -> AND within the group
//   Mode "local"/"online" combine with "coop"/"pvp" as pairs, so
//   Local + Co-op means "has local co-op", not "has local anything and co-op anything".

export const GROUPS = ['players', 'modes', 'genres', 'platforms', 'price', 'length', 'features'];
export const OR_GROUPS = new Set(['players', 'genres', 'platforms', 'price', 'length']);
export const SORTS = ['relevance', 'az', 'newest', 'players'];

// URL parameter name for each group (kept short and readable).
export const PARAM = { players: 'players', modes: 'mode', genres: 'genre', platforms: 'platform', price: 'price', length: 'length', features: 'feature' };

export function emptyFilters() {
  return { players: [], modes: [], genres: [], platforms: [], price: [], length: [], features: [] };
}

export function cloneFilters(f) {
  const out = emptyFilters();
  for (const g of GROUPS) out[g] = [...(f[g] || [])];
  return out;
}

export function mergeFilters(a, b) {
  const out = cloneFilters(a);
  for (const g of GROUPS) for (const v of b[g] || []) if (!out[g].includes(v)) out[g].push(v);
  return out;
}

export function isEmpty(f) {
  return GROUPS.every((g) => !f[g] || f[g].length === 0);
}

export function activeCount(f) {
  return GROUPS.reduce((n, g) => n + (f[g]?.length || 0), 0);
}

// ---- matching -------------------------------------------------------------

export function supportsPlayers(game, value) {
  const { min, max, plus } = game.players;
  if (value === '1') return game.modes.includes('single');
  if (value === '5+') return max === null || max >= 5 || !!plus;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return false;
  if (n === 1) return game.modes.includes('single');
  if (n < min) return false;
  return max === null || n <= max || (!!plus && n >= max);
}

const MULTI = ['local-coop', 'local-pvp', 'online-coop', 'online-pvp'];

function matchesModes(game, selected) {
  if (!selected.length) return true;
  const has = new Set(game.modes);
  const where = selected.filter((m) => m === 'local' || m === 'online');
  const how = selected.filter((m) => m === 'coop' || m === 'pvp');
  const W = where.length ? where : ['local', 'online'];
  const H = how.length ? how : ['coop', 'pvp'];
  for (const w of where) if (!H.some((h) => has.has(`${w}-${h}`))) return false;
  for (const h of how) if (!W.some((w) => has.has(`${w}-${h}`))) return false;
  for (const m of selected) {
    if (m === 'single' && !has.has('single')) return false;
    if (m === 'team' && !has.has('team')) return false;
    if (m === 'turn-based' && !has.has('turn-based')) return false;
    if (m === 'multiplayer' && !MULTI.some((x) => has.has(x))) return false;
  }
  return true;
}

export function hasFeature(game, feature) {
  switch (feature) {
    case 'play-here': return !!(game.embedAllowed && game.embedUrl);
    case 'no-download': return !game.downloadRequired;
    case 'no-account': return !game.accountRequired;
    case 'controller': return !!game.controllerSupport;
    case 'keyboard': return !!game.keyboardSupport;
    case 'mobile-friendly': return !!game.mobileFriendly;
    case 'family': return !!game.familyFriendly;
    default: return false;
  }
}

export function matchesGroup(game, group, values) {
  if (!values || !values.length) return true;
  switch (group) {
    case 'players': return values.some((v) => supportsPlayers(game, v));
    case 'modes': return matchesModes(game, values);
    case 'genres': return values.some((v) => game.genres.includes(v));
    case 'platforms': return values.some((v) => game.platforms.includes(v));
    case 'price': return values.includes(game.price);
    case 'length': return values.includes(game.sessionLength);
    case 'features': return values.every((v) => hasFeature(game, v));
    default: return true;
  }
}

export function matchesFilters(game, f) {
  for (const g of GROUPS) if (!matchesGroup(game, g, f[g])) return false;
  return true;
}

export function filterGames(games, f) {
  return games.filter((g) => matchesFilters(g, f));
}

/**
 * Number of games that would match if `option` in `group` were selected.
 * OR groups: the group's own selection is replaced by the option (classic facet count).
 * AND groups: the option is added to the current selection.
 */
export function facetCount(games, f, group, option) {
  const probe = cloneFilters(f);
  probe[group] = OR_GROUPS.has(group) ? [option] : [...new Set([...(f[group] || []), option])];
  let n = 0;
  for (const g of games) if (matchesFilters(g, probe)) n++;
  return n;
}

// ---- URL state ------------------------------------------------------------

/** Allowed values per group, from the taxonomy. Unknown values in URLs are dropped. */
export function allowedValues(taxonomy) {
  return {
    players: new Set(taxonomy.players.map((p) => p.id)),
    modes: new Set([...taxonomy.modeFilters.map((m) => m.id), 'multiplayer']),
    genres: new Set(taxonomy.genres.map((g) => g.id)),
    platforms: new Set(taxonomy.platforms.map((p) => p.id)),
    price: new Set(taxonomy.price.map((p) => p.id)),
    length: new Set(taxonomy.lengths.map((l) => l.id)),
    features: new Set(taxonomy.features.map((x) => x.id)),
  };
}

export function parseState(search, taxonomy) {
  const params = new URLSearchParams(search);
  const allowed = allowedValues(taxonomy);
  const filters = emptyFilters();
  for (const g of GROUPS) {
    const raw = params.get(PARAM[g]);
    if (!raw) continue;
    for (const v of raw.split(',')) {
      const value = v.trim();
      const ok = allowed[g].has(value) || (g === 'players' && /^\d{1,2}$/.test(value) && Number(value) >= 1);
      if (ok && !filters[g].includes(value)) filters[g].push(value);
    }
  }
  const q = (params.get('q') || '').slice(0, 120);
  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : 'relevance';
  return { q, filters, sort };
}

export function serializeState({ q, filters, sort }, base = emptyFilters()) {
  const params = new URLSearchParams();
  if (q && q.trim()) params.set('q', q.trim());
  for (const g of GROUPS) {
    const extra = (filters[g] || []).filter((v) => !(base[g] || []).includes(v));
    if (extra.length) params.set(PARAM[g], extra.join(','));
  }
  if (sort && sort !== 'relevance') params.set('sort', sort);
  const s = params.toString();
  return s ? `?${s}` : '';
}
