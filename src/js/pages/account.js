// "Log in" page. No account backend in V1 (see lib/account.js): this page offers
// the real benefit accounts would bring, moving saves between devices, via a file.
import { store, toast } from '../app.js';

export function init() {
  const status = document.querySelector('[data-import-status]');
  document.querySelector('[data-export]')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gameatlas-saves-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    status.textContent = 'Saves file downloaded.';
  });
  document.querySelector('[data-import]')?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('too big');
      const added = store.importData(JSON.parse(await file.text()));
      status.textContent = `Loaded: ${added.favorites} favourites, ${added.recent} recently played, ${added.savedSearches} saved searches added.`;
    } catch {
      status.textContent = 'That file could not be read. Choose a GameAtlas saves file.';
    }
    ev.target.value = '';
  });
  document.querySelector('[data-clear-all]')?.addEventListener('click', () => {
    if (!window.confirm('Remove all saved games, history, saved searches and preferences from this browser?')) return;
    store.clearAll();
    toast('All saved data cleared from this browser.');
  });
}
