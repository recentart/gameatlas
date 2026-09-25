// Optional accounts: architecture only in V1.
//
// GameAtlas never requires an account. Saved games live in localStorage
// (storage.js). When a sync backend exists, it plugs in here as a provider and
// syncs the same document storage.js already produces (exportData / importData),
// so nothing else in the site has to change.
//
// A provider must implement:
//   {
//     name: string,
//     getUser(): Promise<{ id, displayName } | null>,
//     signIn(): Promise<void>,          // e.g. redirect to an OAuth / magic-link flow
//     signOut(): Promise<void>,
//     push(doc): Promise<void>,         // doc = store.exportData()
//     pull(): Promise<doc | null>,      // merged with store.importData(doc)
//   }
//
// Rules for any future provider (from the product brief):
//   - no login walls, no sign-up popups, no repeated reminders;
//   - the only prompt is the quiet one on the Saved page after several saves;
//   - local saves keep working when signed out.

let provider = null;

export function registerAccountProvider(p) {
  provider = p;
}

export function accountsAvailable() {
  return provider !== null;
}

export function getProvider() {
  return provider;
}

/** Merge remote and local saves. Called after sign-in once a provider exists. */
export async function syncNow(store) {
  if (!provider) return { synced: false, reason: 'unavailable' };
  const remote = await provider.pull();
  if (remote) store.importData(remote);
  await provider.push(store.exportData());
  return { synced: true };
}
