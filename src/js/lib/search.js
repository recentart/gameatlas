// Structured, non-AI search: turns "4 player fighting" into filters, keeps the
// leftover words as keywords, and ranks games. Pure functions (Node + browser).
import { emptyFilters, mergeFilters, filterGames, isEmpty, GROUPS } from './filters.js';

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, solo: 'solo' };

export function normalize(text) {
  let s = String(text || '').toLowerCase();
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[’']/g, '').replace(/co-op/g, 'coop').replace(/co op/g, 'coop');
  s = s.replace(/[–—]/g, '-');
  s = s.replace(/\.io\b/g, ' io');
  s = s.replace(/[^a-z0-9+\s-]/g, ' ').replace(/-/g, ' ');
  s = s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve)\b/g, (w) => String(NUMBER_WORDS[w]));
  return s.replace(/\s+/g, ' ').trim();
}

// Each rule: a regex over the normalised query, and what it contributes.
// Order matters: longer phrases first so "local coop" wins over "local".
const f = (group, value, label) => ({ group, value, label });
const RULES = [
  [/\b(single ?player|solo|1 ?p|1 players?|just me|by myself|alone)\b/, [f('players', '1', '1 player')]],
  [/\b(\d{1,2}) ?\+(?: ?(?:players?|p|people|person|ppl)\b)?/, (m) => [f('players', Number(m[1]) >= 5 ? '5+' : m[1], Number(m[1]) >= 5 ? '5+ players' : `${m[1]}+ players`)]],
  [/\b(\d{1,2}) ?(players?|p|people|person|persons|ppl|player games?)\b/, (m) => [f('players', m[1], `${m[1]} player${m[1] === '1' ? '' : 's'}`)]],
  [/\bfor (\d{1,2})\b/, (m) => [f('players', m[1], `${m[1]} players`)]],
  [/\b(big group|large group|lots of people|many players)\b/, [f('players', '5+', '5+ players')]],
  [/\b(couch|local|split screen|splitscreen|same screen|same room|shared screen) coop\b/, [f('modes', 'local', 'Local'), f('modes', 'coop', 'Co-op')]],
  [/\bonline coop\b/, [f('modes', 'online', 'Online'), f('modes', 'coop', 'Co-op')]],
  [/\b(local|couch) (versus|vs|pvp|competitive)\b/, [f('modes', 'local', 'Local'), f('modes', 'pvp', 'PvP')]],
  [/\bonline (versus|vs|pvp|competitive)\b/, [f('modes', 'online', 'Online'), f('modes', 'pvp', 'PvP')]],
  [/\b(local|couch|split screen|splitscreen|same screen|same room|shared screen|pass and play|hotseat|hot seat)\b/, [f('modes', 'local', 'Local')]],
  [/\b(online|internet|over the internet)\b/, [f('modes', 'online', 'Online')]],
  [/\b(coop|cooperative|together|team up)\b/, [f('modes', 'coop', 'Co-op')]],
  [/\b(pvp|versus|vs|competitive|1v1|head to head)\b/, [f('modes', 'pvp', 'PvP')]],
  [/\b(team based|teams|team|squad|squads|5v5|3v3|4v4|2v2)\b/, [f('modes', 'team', 'Team-based')]],
  [/\b(turn based|turnbased)\b/, [f('modes', 'turn-based', 'Turn-based')]],
  [/\b(multiplayer|multi player|with friends|friends)\b/, [f('modes', 'multiplayer', 'Multiplayer')]],
  [/\b(free to play|f2p|free)\b/, [f('price', 'free', 'Free')]],
  [/\b(paid|premium)\b/, [f('price', 'paid', 'Paid')]],
  [/\b(no download|without download|no install|without installing|instant)\b/, [f('features', 'no-download', 'No download')]],
  [/\b(no account|no login|no sign ?up|without (an )?account|no registration)\b/, [f('features', 'no-account', 'No account')]],
  [/\b(play here|play now|on gameatlas)\b/, [f('features', 'play-here', 'Play on GameAtlas')]],
  [/\b(browser|web|html5|in a tab)\b/, [f('platforms', 'browser', 'Browser')]],
  [/\b(mobile|phone|phones|android|ios|iphone|ipad|tablet)\b/, [f('platforms', 'mobile', 'Mobile')]],
  [/\b(pc|windows|mac|steam|computer|desktop)\b/, [f('platforms', 'pc', 'PC')]],
  [/\b(console|consoles|switch|nintendo|playstation|ps4|ps5|xbox)\b/, [f('platforms', 'console', 'Console')]],
  [/\b(quick|short|fast|5 min(ute)?s?|10 min(ute)?s?|under 10)\b/, [f('length', 'under-10', 'Under 10 min')]],
  [/\b(long|marathon|hours)\b/, [f('length', '60-plus', '1+ hour')]],
  [/\b(kids|kid friendly|family|family friendly|all ages|children)\b/, [f('features', 'family', 'Family-friendly')]],
  [/\b(controller|gamepad|joystick|joypad)\b/, [f('features', 'controller', 'Controller')]],
  [/\b(keyboard)\b/, [f('features', 'keyboard', 'Keyboard')]],
  [/\b(tower defense|tower defence|td)\b/, [f('genres', 'tower-defense', 'Tower Defense')]],
  [/\b(fighting|fighter|fighters|brawler|brawlers|fight)\b/, [f('genres', 'fighting', 'Fighting')]],
  [/\b(racing|race|races|racer|driving|kart|karts|cars)\b/, [f('genres', 'racing', 'Racing')]],
  [/\b(horror|scary|spooky|creepy|frightening)\b/, [f('genres', 'horror', 'Horror')]],
  [/\b(party|parties)\b/, [f('genres', 'party', 'Party')]],
  [/\b(rpg|rpgs|role playing|roleplaying)\b/, [f('genres', 'rpg', 'RPG')]],
  [/\b(platformer|platformers|platforming)\b/, [f('genres', 'platformer', 'Platformer')]],
  [/\b(puzzle|puzzles|puzzler|logic|brain)\b/, [f('genres', 'puzzle', 'Puzzle')]],
  [/\b(board|board games?|chess|checkers)\b/, [f('genres', 'board', 'Board')]],
  [/\b(card|cards|card games?|deckbuilder|deckbuilding|deck building)\b/, [f('genres', 'card', 'Card')]],
  [/\b(shooter|shooters|fps|shooting|gun|guns)\b/, [f('genres', 'shooter', 'Shooter')]],
  [/\b(strategy|tactics|tactical|rts|moba)\b/, [f('genres', 'strategy', 'Strategy')]],
  [/\b(survival|survive)\b/, [f('genres', 'survival', 'Survival')]],
  [/\b(sandbox|building|creative)\b/, [f('genres', 'sandbox', 'Sandbox')]],
  [/\b(simulation|simulator|sim|sims)\b/, [f('genres', 'simulation', 'Simulation')]],
  [/\b(sports?|football|soccer|golf|tennis|basketball)\b/, [f('genres', 'sports', 'Sports')]],
  [/\b(io|io games?)\b/, [f('genres', 'io', '.io')]],
  [/\b(arcade|retro)\b/, [f('genres', 'arcade', 'Arcade')]],
  [/\b(casual|relaxing|cozy|cosy|chill)\b/, [f('genres', 'casual', 'Casual')]],
  [/\b(adventure|adventures|exploration|explore)\b/, [f('genres', 'adventure', 'Adventure')]],
  [/\b(action)\b/, [f('genres', 'action', 'Action')]],
];

const STOPWORDS = new Set(['games', 'game', 'play', 'playing', 'to', 'a', 'an', 'the', 'for', 'with', 'and', 'or', 'of', 'some', 'best', 'good', 'top', 'fun', 'that', 'i', 'can', 'me', 'my', 'we', 'us', 'like', 'what', 'want', 'players', 'player', 'on', 'in', 'is', 'are', 'mode', 'modes', 'people', 'our', 'you', 'your']);

/**
 * Parse a free-text query.
 * @returns {{ filters, chips: {group,value,label,phrase}[], terms: string[], normalized: string }}
 */
export function parseQuery(query) {
  const normalized = normalize(query);
  let rest = ` ${normalized} `;
  const filters = emptyFilters();
  const chips = [];
  for (const [re, produce] of RULES) {
    const global = new RegExp(re.source, 'g');
    let m;
    while ((m = global.exec(rest))) {
      const items = typeof produce === 'function' ? produce(m) : produce;
      for (const it of items) {
        if (!filters[it.group].includes(it.value)) {
          filters[it.group].push(it.value);
          chips.push({ ...it, phrase: m[0].trim() });
        }
      }
      rest = rest.slice(0, m.index) + ' '.repeat(m[0].length) + rest.slice(m.index + m[0].length);
    }
  }
  const terms = rest.split(/\s+/).filter((t) => t && !STOPWORDS.has(t));
  return { filters, chips, terms, normalized };
}

// ---- keyword scoring --------------------------------------------------------

function editDistanceWithin(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

const indexCache = new WeakMap();
/** Pre-normalised text fields for a game, computed once. */
export function searchIndex(game, labels = {}) {
  let idx = indexCache.get(game);
  if (idx) return idx;
  const title = normalize(game.title);
  const words = (s) => s.split(' ').filter(Boolean);
  const tagText = normalize([...(game.tags || []), ...game.genres.map((g) => labels[g] || g)].join(' '));
  idx = {
    title,
    titleWords: words(title),
    tags: words(tagText),
    developer: words(normalize(game.developer)),
    text: words(normalize(`${game.summary} ${game.description} ${game.controls || ''}`)),
  };
  indexCache.set(game, idx);
  return idx;
}

function wordScore(term, list, exact, prefix, fuzzy) {
  let best = 0;
  const tol = term.length >= 8 ? 2 : term.length >= 5 ? 1 : 0;
  for (const w of list) {
    if (w === term) return exact;
    if (w.startsWith(term) && term.length >= 2) best = Math.max(best, prefix);
    else if (tol && fuzzy && editDistanceWithin(term, w, tol)) best = Math.max(best, fuzzy);
  }
  return best;
}

/** Score one game against keyword terms; 0 means at least one term did not match. */
export function scoreTerms(game, terms, labels) {
  if (!terms.length) return 1;
  const idx = searchIndex(game, labels);
  let total = 0;
  for (const t of terms) {
    const s = Math.max(
      wordScore(t, idx.titleWords, 40, 30, 20),
      wordScore(t, idx.tags, 18, 14, 8),
      wordScore(t, idx.developer, 12, 10, 0),
      wordScore(t, idx.text, 6, 4, 0),
    );
    if (!s) return 0;
    total += s;
  }
  return total;
}

function compareBy(sort) {
  const byTitle = (a, b) => a.game.title.localeCompare(b.game.title, 'en', { sensitivity: 'base' });
  const featured = (a, b) => (b.game.featured ? 1 : 0) - (a.game.featured ? 1 : 0);
  if (sort === 'az') return byTitle;
  if (sort === 'newest') return (a, b) => (b.game.released || 0) - (a.game.released || 0) || byTitle(a, b);
  if (sort === 'players') {
    const cap = (g) => (g.players.max === null ? 999 : g.players.max + (g.players.plus ? 0.5 : 0));
    return (a, b) => cap(b.game) - cap(a.game) || byTitle(a, b);
  }
  return (a, b) => b.score - a.score || featured(a, b) || byTitle(a, b);
}

/**
 * Run a search.
 * @param games   catalog
 * @param state   { q, filters, sort }
 * @param labels  genre id -> label map (for tag matching)
 * @returns { results: game[], parsed, fallback: boolean, titleMatches: number }
 */
export function search(games, { q = '', filters = emptyFilters(), sort = 'relevance' }, labels = {}) {
  const parsed = parseQuery(q);
  const effective = mergeFilters(filters, parsed.filters);
  const structured = filterGames(games, effective);
  // Words that became filters still nudge ranking when they appear in a title or
  // tag ("chess" filters to Board games and lifts Lichess to the top).
  const boostWords = [...new Set(parsed.chips.flatMap((c) => c.phrase.split(' ')))].filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  let scored = structured
    .map((game) => {
      const score = scoreTerms(game, parsed.terms, labels);
      if (!score) return { game, score: 0 };
      const idx = searchIndex(game, labels);
      let bonus = 0;
      for (const w of boostWords) bonus += Math.max(wordScore(w, idx.titleWords, 6, 4, 0), wordScore(w, idx.tags, 4, 2, 0));
      return { game, score: score + bonus };
    })
    .filter((r) => r.score > 0);

  // Safety net: a query that is (part of) a title always finds that game, even if a
  // word in the title was also read as a filter ("Stick Fight", "Mario Kart").
  const nq = parsed.normalized;
  let titleMatches = 0;
  if (nq.length >= 3) {
    for (const game of games) {
      const t = searchIndex(game, labels).title;
      if (t.includes(nq) && matchesAllExplicit(game, filters)) {
        titleMatches++;
        const bonus = t === nq ? 1000 : t.startsWith(nq) ? 500 : 300;
        const existing = scored.find((r) => r.game === game);
        if (existing) existing.score += bonus;
        else scored.push({ game, score: bonus });
      }
    }
  }

  let fallback = false;
  if (!scored.length && parsed.terms.length && !isEmpty(parsed.filters)) {
    // Keywords matched nothing: fall back to the structured part of the query.
    fallback = true;
    scored = structured.map((game) => ({ game, score: 1 }));
  }
  scored.sort(compareBy(sort));
  return { results: scored.map((r) => r.game), parsed, effective, fallback, titleMatches };
}

function matchesAllExplicit(game, filters) {
  return filterGames([game], filters).length === 1;
}

export { GROUPS };
