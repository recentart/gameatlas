// Ad slots. The build renders each slot as a small labelled banner that already
// contains a house ad (one of the GameAtlas Originals), so nothing here is needed
// for the site to look right.
//
// Paid ads: set ads.adsense.client and a unit id per slot in data/site.json. The
// build then adds data-ad-client/data-ad-unit to the slot, opens the CSP to
// Google's ad domains and writes ads.txt; this file loads the unit on top of the
// house ad and removes it again if Google has no ad to show.
//
// Another network can be plugged in with registerAdProvider({ name, render(slotEl) }).
//
// Rules enforced here, whatever the provider does:
//   - slots only exist where the page template placed them (never inside the
//     game player, filters or navigation);
//   - nothing renders while a game is fullscreen;
//   - providers get the slot element only, not the page.

let provider = null;
const rendered = new WeakSet();

export function registerAdProvider(p) {
  provider = p;
}

let adsenseLoaded = false;
const adsense = {
  name: 'adsense',
  render(slot) {
    const box = slot.querySelector('.ad-box');
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.dataset.adClient = slot.dataset.adClient;
    ins.dataset.adSlot = slot.dataset.adUnit;
    // Fixed banner size, set through CSSOM because the CSP allows no inline style attributes.
    ins.style.display = 'block';
    ins.style.width = `${box.clientWidth}px`;
    ins.style.height = `${box.clientHeight}px`;
    box.append(ins);
    new MutationObserver(() => {
      const status = ins.getAttribute('data-ad-status');
      if (status === 'filled') slot.classList.add('is-filled');
      else if (status === 'unfilled') ins.remove();
    }).observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
    if (!adsenseLoaded) {
      adsenseLoaded = true;
      const s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(slot.dataset.adClient)}`;
      document.head.append(s);
    }
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  },
};

export function initAds(root = document) {
  for (const slot of root.querySelectorAll('[data-ad-slot]')) {
    const p = slot.dataset.adUnit ? adsense : provider;
    if (!p || rendered.has(slot) || slot.closest('[data-player]')) continue;
    if (document.fullscreenElement) continue;
    rendered.add(slot);
    try {
      p.render(slot, { id: slot.dataset.adSlot });
    } catch (err) {
      console.warn('Ad provider failed', err);
    }
  }
}
