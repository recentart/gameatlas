// Anonymous, device-local storage for favourites, recently played, saved searches
// and preferences. Everything works without an account.
//
// The whole state is one versioned JSON document. That document is also the
// payload a future account-sync provider would push/pull (see account.js), and
// what "Export saves" downloads.

export const STORAGE_KEY = 'gameatlas:v1';
export const SCHEMA_VERSION = 1;
export const LIMITS = { favorites: 500, recent: 30, savedSearches: 30 };

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    favorites: [],        // [{ slug, at }] newest first
    recent: [],           // [{ slug, at }] newest first, de-duplicated
    savedSearches: [],    // [{ id, name, query, at }]  query = URL search string
    prefs: { theme: 'system', sidebarCollapsed: false, accountHintDismissed: false },
    updatedAt: 0,
  };
}

/** Validate and repair anything read from storage or an imported file. */
export function sanitize(input) {
  const base = defaultState();
  if (!input || typeof input !== 'object') return base;
  const slugOk = (s) => typeof s === 'string' && /^[a-z0-9-]{1,80}$/.test(s);
  const time = (t) => (Number.isFinite(t) && t > 0 ? t : 0);
  const list = (arr, limit) => {
    const seen = new Set();
    const out = [];
    for (const item of Array.isArray(arr) ? arr : []) {
      if (!item || !slugOk(item.slug) || seen.has(item.slug)) continue;
      seen.add(item.slug);
      out.push({ slug: item.slug, at: time(item.at) });
      if (out.length >= limit) break;
    }
    return out;
  };
  base.favorites = list(input.favorites, LIMITS.favorites);
  base.recent = list(input.recent, LIMITS.recent);
  base.savedSearches = (Array.isArray(input.savedSearches) ? input.savedSearches : [])
    .filter((s) => s && typeof s.query === 'string' && s.query.length <= 400)
    .slice(0, LIMITS.savedSearches)
    .map((s) => ({
      id: typeof s.id === 'string' ? s.id.slice(0, 40) : String(time(s.at) || Math.random()).slice(2, 12),
      name: String(s.name || 'Saved search').slice(0, 80),
      query: s.query.startsWith('?') || s.query === '' ? s.query : `?${s.query}`,
      at: time(s.at),
    }));
  const p = input.prefs || {};
  base.prefs.theme = ['light', 'dark', 'system'].includes(p.theme) ? p.theme : 'system';
  base.prefs.sidebarCollapsed = p.sidebarCollapsed === true;
  base.prefs.accountHintDismissed = p.accountHintDismissed === true;
  base.updatedAt = time(input.updatedAt);
  return base;
}

/**
 * Create a store around a Storage-like backend ({getItem,setItem}).
 * If the backend throws (private mode, blocked site data), it falls back to memory
 * so the page keeps working for the current visit.
 */
export function createStore(backend, { now = () => Date.now() } = {}) {
  let persistent = true;
  let memory = null;
  const listeners = new Set();

  function read() {
    if (persistent) {
      try {
        const raw = backend.getItem(STORAGE_KEY);
        return sanitize(raw ? JSON.parse(raw) : null);
      } catch {
        persistent = false;
      }
    }
    return memory ? sanitize(memory) : defaultState();
  }

  function write(state) {
    state.updatedAt = now();
    memory = state;
    if (persistent) {
      try { backend.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { persistent = false; }
    }
    for (const fn of listeners) fn(state);
    return state;
  }

  function update(mutator) {
    const state = read();
    mutator(state);
    return write(sanitize(state));
  }

  return {
    get: read,
    isPersistent: () => { read(); return persistent; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Re-notify listeners, e.g. after another tab changed storage. */
    refresh() { const s = read(); for (const fn of listeners) fn(s); },

    isFavorite: (slug) => read().favorites.some((f) => f.slug === slug),
    toggleFavorite(slug) {
      let saved = false;
      update((s) => {
        const i = s.favorites.findIndex((f) => f.slug === slug);
        if (i >= 0) s.favorites.splice(i, 1);
        else { s.favorites.unshift({ slug, at: now() }); saved = true; }
      });
      return saved;
    },
    removeFavorite(slug) { update((s) => { s.favorites = s.favorites.filter((f) => f.slug !== slug); }); },

    addRecent(slug) {
      update((s) => {
        s.recent = [{ slug, at: now() }, ...s.recent.filter((r) => r.slug !== slug)].slice(0, LIMITS.recent);
      });
    },
    clearRecent() { update((s) => { s.recent = []; }); },

    saveSearch(name, query) {
      const id = `s${now().toString(36)}`;
      update((s) => {
        s.savedSearches = [{ id, name, query, at: now() }, ...s.savedSearches.filter((x) => x.query !== query)];
      });
      return id;
    },
    removeSearch(id) { update((s) => { s.savedSearches = s.savedSearches.filter((x) => x.id !== id); }); },

    getPref: (key) => read().prefs[key],
    setPref(key, value) { update((s) => { s.prefs[key] = value; }); },

    exportData() {
      const s = read();
      return { app: 'GameAtlas', exportedAt: new Date(now()).toISOString(), data: s };
    },
    /** Merge an exported file into this device's data. Returns counts added. */
    importData(file) {
      const incoming = sanitize(file && file.app === 'GameAtlas' ? file.data : file);
      let added = { favorites: 0, recent: 0, savedSearches: 0 };
      update((s) => {
        for (const f of incoming.favorites) if (!s.favorites.some((x) => x.slug === f.slug)) { s.favorites.push(f); added.favorites++; }
        for (const r of incoming.recent) if (!s.recent.some((x) => x.slug === r.slug)) { s.recent.push(r); added.recent++; }
        s.recent.sort((a, b) => b.at - a.at);
        for (const q of incoming.savedSearches) if (!s.savedSearches.some((x) => x.query === q.query)) { s.savedSearches.push(q); added.savedSearches++; }
      });
      return added;
    },
    clearAll() { write(defaultState()); },
  };
}
