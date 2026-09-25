// Loads the game catalog once per page. The URL is content-hashed and cached forever.
let promise;
export function loadCatalog() {
  if (!promise) {
    const url = document.querySelector('meta[name="ga-catalog"]')?.content;
    promise = fetch(url, { credentials: 'same-origin' })
      .then((r) => { if (!r.ok) throw new Error(`catalog ${r.status}`); return r.json(); })
      .then((cat) => {
        cat.bySlug = Object.fromEntries(cat.games.map((g) => [g.slug, g]));
        cat.genreLabels = Object.fromEntries(cat.taxonomy.genres.map((g) => [g.id, g.label]));
        return cat;
      })
      .catch((err) => { promise = null; throw err; });
  }
  return promise;
}
