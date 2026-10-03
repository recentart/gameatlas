// Ad slots. The build renders each slot as a small labelled banner that already
// contains a house ad (one of the GameAtlas Originals), so nothing here is needed
// for the site to look right.
//
// Paid ads (Adsterra): fill in ads.adsterra in data/site.json. The build then adds
// data-ad-* attributes to each slot and allows the ad-frame origin in frame-src.
// This file puts a sandboxed iframe from that separate origin (ad-frame/, its own
// Worker) on top of the house ad, and only shows it once the frame reports that an
// ad rendered. Ad code never runs on GameAtlas pages and cannot navigate them.
// Visitors whose time zone is in Europe are asked before ad cookies are used.
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

function needsConsent() {
  try {
    return /^Europe\//.test(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
  } catch {
    return false;
  }
}

function loadFrame(slot) {
  const box = slot.querySelector('.ad-box');
  // The banner size that fits this slot: 468x60, or 320x50 on phones.
  const unit = box.clientWidth >= 468 ? '468x60' : '320x50';
  if (!(slot.dataset.adUnits || '').split(' ').includes(unit) || box.querySelector('iframe')) return;
  const [w, h] = unit.split('x').map(Number);
  const src = new URL('/frame', slot.dataset.adFrame);
  src.search = new URLSearchParams({ unit }).toString();
  const f = document.createElement('iframe');
  f.src = src.href;
  f.width = w;
  f.height = h;
  f.title = 'Advertisement';
  f.loading = 'lazy';
  f.setAttribute('scrolling', 'no');
  // Different origin, so allow-same-origin only gives the ad its own cookies.
  // No allow-top-navigation: an ad can open a new tab when clicked, never redirect this page.
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
  box.append(f);
}

function askConsent(slot, store) {
  const p = document.createElement('p');
  p.className = 'ad-consent';
  p.append('Ads here use cookies from Adsterra. ');
  const choose = (answer) => {
    store.setPref('adConsent', answer);
    for (const el of document.querySelectorAll('.ad-consent')) el.remove();
    if (answer === 'yes') for (const s of document.querySelectorAll('[data-ad-frame]')) loadFrame(s);
  };
  for (const [label, answer] of [['Allow', 'yes'], ['No thanks', 'no']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'link-btn';
    b.textContent = label;
    b.addEventListener('click', () => choose(answer));
    p.append(b, ' ');
  }
  slot.append(p);
}

const adsterra = {
  name: 'adsterra',
  render(slot, { store }) {
    const consent = store && store.getPref('adConsent');
    if (consent === 'no') return;
    if (consent !== 'yes' && needsConsent() && store) askConsent(slot, store);
    else loadFrame(slot);
  },
};

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'ga:ad' || !e.data.filled) return;
    for (const f of document.querySelectorAll('.ad-slot iframe')) {
      if (f.contentWindow === e.source && new URL(f.src).origin === e.origin) f.closest('.ad-slot').classList.add('is-filled');
    }
  });
}

export function initAds(store, root = document) {
  for (const slot of root.querySelectorAll('[data-ad-slot]')) {
    const p = slot.dataset.adFrame ? adsterra : provider;
    if (!p || rendered.has(slot) || slot.closest('[data-player]')) continue;
    if (document.fullscreenElement) continue;
    rendered.add(slot);
    if (p === adsterra) listen();
    try {
      p.render(slot, { id: slot.dataset.adSlot, store });
    } catch (err) {
      console.warn('Ad provider failed', err);
    }
  }
}
