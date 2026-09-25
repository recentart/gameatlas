// Inline SVG icon sprite. Each page includes SPRITE once; icon(name) references it.
// Stroke icons on a 24px grid, drawn for this project.
const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
  gamepad: '<path d="M6.5 7h11a4 4 0 0 1 3.9 3.2l1 5.1a2.5 2.5 0 0 1-4.3 2.1L16 15H8l-2.1 2.4a2.5 2.5 0 0 1-4.3-2.1l1-5.1A4 4 0 0 1 6.5 7Z"/><path d="M7.5 10v3M6 11.5h3"/><circle cx="16" cy="10.5" r=".6"/><circle cx="17.5" cy="12.5" r=".6"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9Z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>',
  console: '<rect x="2.5" y="6" width="19" height="12" rx="3"/><path d="M7 10v4M5 12h4"/><circle cx="16.5" cy="11" r=".7"/><circle cx="18" cy="13.5" r=".7"/>',
  heart: '<path d="M12 20.5S3.5 15.6 3.5 9.3A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.5 2.5c0 6.3-8.5 11.2-8.5 11.2Z"/>',
  heartFill: '<path fill="currentColor" d="M12 20.5S3.5 15.6 3.5 9.3A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.5 2.5c0 6.3-8.5 11.2-8.5 11.2Z"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  chevronDown: '<path d="m5 9 7 7 7-7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  play: '<path fill="currentColor" stroke="none" d="M8 5.5v13a1 1 0 0 0 1.5.9l10.2-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5Z"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  maximize: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  minimize: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  coop: '<circle cx="8" cy="7.5" r="3"/><circle cx="16" cy="7.5" r="3"/><path d="M2.5 19c.5-3.4 2.6-5 5.5-5 1.6 0 3 .5 4 1.5 1-1 2.4-1.5 4-1.5 2.9 0 5 1.6 5.5 5"/>',
  versus: '<path d="m4 4 9.5 9.5M3 10l7 7M4 20l3-3M20 4l-9.5 9.5M21 10l-7 7M20 20l-3-3"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  bookmark: '<path d="M6 3.5h12v17l-6-4-6 4Z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M4 4h16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  shuffle: '<path d="M3 7h3.5c5 0 6 10 11 10H21M3 17h3.5c1.9 0 3.1-1.4 4.1-3M14 7h7M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  lightning: '<path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12Z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  turn: '<path d="M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4"/>',
  team: '<circle cx="12" cy="6.5" r="2.5"/><circle cx="5" cy="9" r="2"/><circle cx="19" cy="9" r="2"/><path d="M7.5 20c.4-3.3 2.1-5 4.5-5s4.1 1.7 4.5 5M1.5 18.5c.3-2.4 1.5-3.6 3.5-3.6M22.5 18.5c-.3-2.4-1.5-3.6-3.5-3.6"/>',
  party: '<path d="m3 21 5.5-14L17 15.5Z"/><path d="M14 3.5c-.6 1.6.2 2.8 1.8 3M20.5 10c-1.6-.6-2.8.2-3 1.8M17 3l.5 1M21 6.5l-1 .5M11 6.5l.8-.8"/>',
};

export const ICON_NAMES = Object.keys(P);

export const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" class="sprite" aria-hidden="true" focusable="false"><defs>${
  Object.entries(P).map(([name, d]) => `<symbol id="i-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</symbol>`).join('')
}</defs></svg>`;

export function icon(name, cls = '') {
  return `<svg class="i${cls ? ` ${cls}` : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}

export const PLATFORM_ICON = { browser: 'globe', pc: 'monitor', mobile: 'phone', console: 'console' };
