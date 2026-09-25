// Ad slot system. V1 ships with the "placeholder" provider: the labelled boxes
// rendered by the build are left as they are. To add a real network later,
// register a provider before app.js runs initAds (or call initAds again):
//
//   registerAdProvider({
//     name: 'my-network',
//     render(slotEl, { id, format }) { ...insert the ad into slotEl.querySelector('.ad-box')... ; slotEl.classList.add('is-filled') },
//   });
//
// Rules enforced here, whatever the provider does:
//   - slots only exist where the page template placed them (never inside the
//     game player, filters or navigation);
//   - nothing renders while a game is fullscreen;
//   - providers get the slot element only, not the page.
// Remember to widen the Content-Security-Policy in scripts/build.mjs for the network's domains.

let provider = null;
const rendered = new WeakSet();

export function registerAdProvider(p) {
  provider = p;
}

export function initAds(root = document) {
  if (!provider || provider.name === 'placeholder') return;
  for (const slot of root.querySelectorAll('[data-ad-slot]')) {
    if (rendered.has(slot) || slot.closest('[data-player]')) continue;
    if (document.fullscreenElement) continue;
    rendered.add(slot);
    try {
      provider.render(slot, { id: slot.dataset.adSlot, format: slot.dataset.adFormat });
    } catch (err) {
      console.warn('Ad provider failed', err);
    }
  }
}
