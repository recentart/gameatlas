// Pure formatting helpers shared by the build (Node) and the browser.

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "1–4 players", "2 players", "2+ players", "1–8+ players" */
export function playersLabel(players) {
  const { min, max, plus } = players;
  if (max === null || max === undefined) return `${min}+ players`;
  const tail = plus ? '+' : '';
  if (min === max && !plus) return `${min} player${min === 1 ? '' : 's'}`;
  return `${min}–${max}${tail} players`;
}

/** Short label for the multiplayer shape of a game, e.g. "Local & online co-op". */
export function modeSummary(game) {
  const m = new Set(game.modes);
  const localCoop = m.has('local-coop'), onlineCoop = m.has('online-coop');
  const localPvp = m.has('local-pvp'), onlinePvp = m.has('online-pvp');
  const coop = localCoop || onlineCoop, pvp = localPvp || onlinePvp;
  const where = (l, o) => (l && o ? 'Local & online' : l ? 'Local' : o ? 'Online' : '');
  if (!coop && !pvp) return 'Single player';
  if (coop && !pvp) return `${where(localCoop, onlineCoop)} co-op`;
  if (pvp && !coop) return `${where(localPvp, onlinePvp)} versus`;
  const local = localCoop || localPvp, online = onlineCoop || onlinePvp;
  return `${where(local, online)} multiplayer`;
}

export function labelMap(list) {
  const map = {};
  for (const item of list) map[item.id] = item.label;
  return map;
}

export function listLabel(ids, list) {
  const map = labelMap(list);
  return ids.map((id) => map[id] || id);
}

export function priceLabel(game) {
  return game.price === 'free' ? 'Free' : 'Paid';
}

export function yearLabel(game) {
  return game.released ? String(game.released) : 'Unknown';
}
