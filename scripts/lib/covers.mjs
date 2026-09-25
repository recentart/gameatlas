// Generates original SVG cover art for each game: a genre colour, a genre motif
// with deterministic variation per slug, and the title. No third-party artwork.
import { escapeHtml as e } from '../../src/js/lib/format.js';

const HUES = {
  fighting: 354, racing: 22, horror: 268, puzzle: 188, board: 32, card: 158, platformer: 206, party: 318,
  io: 142, strategy: 228, 'tower-defense': 88, rpg: 284, survival: 28, sandbox: 110, sports: 136,
  simulation: 44, shooter: 212, arcade: 252, action: 6, adventure: 176, casual: 336,
};

function hash(str) {
  let h = 2166136261;
  for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let s = seed || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
const hsl = (h, s, l, a = 1) => (a === 1 ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`);
const r1 = (n) => Math.round(n * 10) / 10;

function motif(genre, R, W, H, c) {
  const out = [];
  const add = (s) => out.push(s);
  switch (genre) {
    case 'fighting':
      for (let i = 0; i < 3; i++) add(`<rect x="${r1(-80 + i * 90 + R() * 40)}" y="-60" width="${r1(22 + R() * 30)}" height="${H + 160}" fill="${c.mid}" transform="rotate(${r1(28 + R() * 8)} ${W / 2} ${H / 2})"/>`);
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; add(`<line x1="${r1(W * 0.72 + Math.cos(a) * 40)}" y1="${r1(H * 0.35 + Math.sin(a) * 40)}" x2="${r1(W * 0.72 + Math.cos(a) * (120 + R() * 60))}" y2="${r1(H * 0.35 + Math.sin(a) * (120 + R() * 60))}" stroke="${c.hi}" stroke-width="3" stroke-linecap="round" opacity=".55"/>`); }
      break;
    case 'racing':
      for (let i = 0; i < 5; i++) add(`<circle cx="${r1(W * 0.85)}" cy="${r1(H * 1.1)}" r="${160 + i * 46}" fill="none" stroke="${i % 2 ? c.mid : c.hi}" stroke-width="${i % 2 ? 26 : 5}" opacity="${i % 2 ? 1 : 0.5}"/>`);
      for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) if ((x + y) % 2 === 0) add(`<rect x="${24 + x * 18}" y="${24 + y * 18}" width="18" height="18" fill="${c.hi}" opacity=".7"/>`);
      break;
    case 'horror':
      add(`<circle cx="${r1(W * (0.68 + R() * 0.15))}" cy="${r1(H * 0.3)}" r="${r1(58 + R() * 20)}" fill="${c.hi}" opacity=".55"/>`);
      for (let i = 0; i < 7; i++) { const x = R() * W, y = H * 0.45 + R() * H * 0.4; add(`<g opacity="${r1(0.35 + R() * 0.4)}"><ellipse cx="${r1(x)}" cy="${r1(y)}" rx="5" ry="3" fill="${c.hi}"/><ellipse cx="${r1(x + 16)}" cy="${r1(y)}" rx="5" ry="3" fill="${c.hi}"/></g>`); }
      add(`<path d="M0 ${H} L0 ${H * 0.72} ${Array.from({ length: 12 }, (_, i) => `L${r1((i + 0.5) * W / 12)} ${r1(H * (0.55 + R() * 0.2))} L${r1((i + 1) * W / 12)} ${r1(H * 0.74)}`).join(' ')} L${W} ${H} Z" fill="${c.dark}"/>`);
      break;
    case 'puzzle':
      for (let x = 0; x < 6; x++) for (let y = 0; y < 5; y++) { const on = R() > 0.55; add(`<rect x="${r1(W * 0.5 + x * 52)}" y="${r1(-10 + y * 52)}" width="44" height="44" rx="8" fill="${on ? c.hi : c.mid}" opacity="${on ? 0.6 : 0.9}"/>`); }
      break;
    case 'board':
      for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) if ((x + y) % 2 === 0) add(`<rect x="${W * 0.52 + x * 40}" y="${-40 + y * 40}" width="40" height="40" fill="${c.mid}"/>`);
      add(`<circle cx="${r1(W * 0.52 + 60)}" cy="100" r="15" fill="${c.hi}" opacity=".8"/><circle cx="${r1(W * 0.52 + 180)}" cy="60" r="15" fill="${c.hi}" opacity=".5"/>`);
      break;
    case 'card':
      for (let i = 0; i < 5; i++) add(`<rect x="${W * 0.62}" y="${H * 0.08}" width="120" height="170" rx="12" fill="${i === 4 ? c.hi : c.mid}" stroke="${c.dark}" stroke-width="3" opacity="${i === 4 ? 0.75 : 1}" transform="rotate(${-30 + i * 14 + r1(R() * 4)} ${W * 0.62 + 60} ${H * 0.08 + 260})"/>`);
      break;
    case 'platformer':
      for (let i = 0; i < 5; i++) add(`<rect x="${r1(W * 0.45 + i * 64)}" y="${r1(H * 0.78 - i * 38 - R() * 10)}" width="${r1(52 + R() * 20)}" height="18" rx="4" fill="${c.mid}"/>`);
      add(`<path d="M${W * 0.45 + 20} ${H * 0.7} q 40 -80 90 -40 t 90 -40 t 90 -40" fill="none" stroke="${c.hi}" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round" opacity=".8"/>`);
      break;
    case 'party':
      for (let i = 0; i < 38; i++) { const x = R() * W, y = R() * H; const s = 6 + R() * 12; add(R() > 0.5 ? `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(s)}" height="${r1(s * 0.5)}" rx="2" fill="${[c.hi, c.alt, c.mid][i % 3]}" transform="rotate(${r1(R() * 180)} ${r1(x)} ${r1(y)})" opacity=".75"/>` : `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(s / 2)}" fill="${[c.hi, c.alt, c.mid][i % 3]}" opacity=".7"/>`); }
      break;
    case 'io':
      for (let i = 0; i < 9; i++) add(`<circle cx="${r1(W * 0.35 + R() * W * 0.7)}" cy="${r1(R() * H)}" r="${r1(12 + R() * 70)}" fill="${[c.mid, c.hi, c.alt][i % 3]}" opacity="${r1(0.4 + R() * 0.4)}"/>`);
      break;
    case 'strategy': {
      const hex = (cx, cy, s) => `M${Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 3 * k + Math.PI / 6; return `${r1(cx + s * Math.cos(a))} ${r1(cy + s * Math.sin(a))}`; }).join(' L')} Z`;
      for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) add(`<path d="${hex(W * 0.5 + x * 52 + (y % 2) * 26, -10 + y * 45, 28)}" fill="${R() > 0.8 ? c.hi : 'none'}" fill-opacity=".45" stroke="${c.mid}" stroke-width="3"/>`);
      break;
    }
    case 'tower-defense':
      add(`<path d="M${W * 0.4} ${H * 0.2} H${W * 0.75} V${H * 0.55} H${W * 0.55} V${H * 0.85} H${W + 20}" fill="none" stroke="${c.mid}" stroke-width="30" stroke-linejoin="round"/>`);
      for (const [x, y] of [[0.62, 0.4], [0.85, 0.3], [0.68, 0.72], [0.9, 0.68]]) add(`<rect x="${r1(W * x - 14)}" y="${r1(H * y - 14)}" width="28" height="28" rx="4" fill="${c.hi}" opacity=".8"/><path d="M${r1(W * x - 16)} ${r1(H * y - 14)} L${r1(W * x)} ${r1(H * y - 34)} L${r1(W * x + 16)} ${r1(H * y - 14)} Z" fill="${c.alt}" opacity=".85"/>`);
      break;
    case 'rpg':
      for (let i = 0; i < 4; i++) { const x = W * (0.55 + R() * 0.38), y = H * (0.12 + R() * 0.5), s = 22 + R() * 36; add(`<path d="M${r1(x)} ${r1(y - s)} L${r1(x + s * 0.55)} ${r1(y)} L${r1(x)} ${r1(y + s * 1.2)} L${r1(x - s * 0.55)} ${r1(y)} Z" fill="${i % 2 ? c.hi : c.alt}" opacity=".6"/>`); }
      break;
    case 'survival':
      add(`<path d="M${W * 0.38} ${H} L${W * 0.62} ${H * 0.35} L${W * 0.86} ${H} Z" fill="${c.mid}"/><path d="M${W * 0.6} ${H} L${W * 0.84} ${H * 0.2} L${W * 1.1} ${H} Z" fill="${c.dark}"/>`);
      add(`<circle cx="${r1(W * 0.2 + R() * W * 0.1)}" cy="${r1(H * 0.2)}" r="26" fill="${c.hi}" opacity=".5"/>`);
      break;
    case 'sandbox': {
      const cube = (x, y, s) => `<path d="M${x} ${y} l${s} ${-s / 2} l${s} ${s / 2} l${-s} ${s / 2} Z" fill="${c.hi}" opacity=".55"/><path d="M${x} ${y} l${s} ${s / 2} v${s} l${-s} ${-s / 2} Z" fill="${c.mid}"/><path d="M${x + s} ${y + s / 2} l${s} ${-s / 2} v${s} l${-s} ${s / 2} Z" fill="${c.dark}"/>`;
      for (let i = 0; i < 6; i++) add(cube(r1(W * 0.5 + (i % 3) * 64 + (i > 2 ? 32 : 0)), r1(H * 0.3 + (i > 2 ? 60 : 0) + R() * 8), 32));
      break;
    }
    case 'sports':
      add(`<rect x="${W * 0.45}" y="24" width="${W * 0.5}" height="${H - 48}" rx="6" fill="none" stroke="${c.hi}" stroke-width="4" opacity=".5"/><line x1="${W * 0.7}" y1="24" x2="${W * 0.7}" y2="${H - 24}" stroke="${c.hi}" stroke-width="4" opacity=".5"/><circle cx="${W * 0.7}" cy="${H / 2}" r="46" fill="none" stroke="${c.hi}" stroke-width="4" opacity=".5"/>`);
      add(`<circle cx="${r1(W * (0.55 + R() * 0.3))}" cy="${r1(H * (0.25 + R() * 0.5))}" r="16" fill="${c.alt}" opacity=".85"/>`);
      break;
    case 'simulation':
      for (let i = 0; i < 3; i++) { const cx = W * (0.62 + i * 0.13), cy = H * (0.3 + (i % 2) * 0.35), r = 34 + i * 10; add(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r}" fill="none" stroke="${c.mid}" stroke-width="14" stroke-dasharray="10 8"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r - 18}" fill="${c.hi}" opacity=".35"/>`); }
      break;
    case 'shooter':
      for (let i = 0; i < 3; i++) add(`<circle cx="${W * 0.74}" cy="${H * 0.42}" r="${40 + i * 38}" fill="none" stroke="${i ? c.mid : c.hi}" stroke-width="${i ? 8 : 4}" opacity="${i ? 1 : 0.7}"/>`);
      add(`<path d="M${W * 0.74} ${H * 0.42 - 150} V${H * 0.42 - 20} M${W * 0.74} ${H * 0.42 + 20} V${H * 0.42 + 150} M${W * 0.74 - 150} ${H * 0.42} H${W * 0.74 - 20} M${W * 0.74 + 20} ${H * 0.42} H${W * 0.74 + 150}" stroke="${c.hi}" stroke-width="4" opacity=".6"/>`);
      break;
    case 'arcade':
      for (let x = 0; x < 11; x++) for (let y = 0; y < 8; y++) if (R() > 0.6) add(`<rect x="${W * 0.46 + x * 30}" y="${10 + y * 30}" width="24" height="24" fill="${R() > 0.7 ? c.hi : c.mid}" opacity=".8"/>`);
      break;
    case 'action':
      for (let i = 0; i < 9; i++) { const y = R() * H; add(`<line x1="${r1(W * 0.4 + R() * 100)}" y1="${r1(y)}" x2="${W + 10}" y2="${r1(y - 40)}" stroke="${i % 3 ? c.mid : c.hi}" stroke-width="${r1(4 + R() * 12)}" stroke-linecap="round" opacity=".7"/>`); }
      add(`<path d="M${W * 0.78} ${H * 0.1} L${W * 0.68} ${H * 0.5} H${W * 0.76} L${W * 0.7} ${H * 0.88} L${W * 0.9} ${H * 0.4} H${W * 0.8} Z" fill="${c.alt}" opacity=".75"/>`);
      break;
    case 'adventure':
      add(`<circle cx="${r1(W * (0.7 + R() * 0.15))}" cy="${r1(H * 0.28)}" r="40" fill="${c.alt}" opacity=".6"/>`);
      add(`<path d="M${W * 0.3} ${H} L${W * 0.55} ${H * 0.45} L${W * 0.68} ${H * 0.62} L${W * 0.8} ${H * 0.4} L${W * 1.05} ${H} Z" fill="${c.mid}"/><path d="M${W * 0.55} ${H * 0.45} L${W * 0.6} ${H * 0.55} L${W * 0.52} ${H * 0.53} Z" fill="${c.hi}" opacity=".8"/>`);
      break;
    default: // casual
      for (let i = 0; i < 6; i++) add(`<circle cx="${r1(W * 0.4 + R() * W * 0.65)}" cy="${r1(R() * H)}" r="${r1(40 + R() * 70)}" fill="${[c.mid, c.hi, c.alt][i % 3]}" opacity="${r1(0.3 + R() * 0.3)}"/>`);
  }
  return out.join('');
}

/** Greedy word wrap using a rough average glyph width for bold sans-serif. */
function wrap(title, maxWidth, fontSize) {
  const perChar = fontSize * 0.58;
  const words = title.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (test.length * perChar > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function fitTitle(title, maxWidth, sizes) {
  for (const size of sizes) {
    const lines = wrap(title, maxWidth, size);
    if (lines.length <= 3 && lines.every((l) => l.length * size * 0.58 <= maxWidth * 1.02)) return { size, lines };
  }
  const size = sizes[sizes.length - 1];
  return { size, lines: wrap(title, maxWidth, size).slice(0, 3) };
}

export function coverSvg(game, { og = false } = {}) {
  const W = og ? 1200 : 640, H = og ? 630 : 360;
  const genre = game.genres[0];
  const seed = hash(game.slug);
  const R = rng(seed);
  const h = ((HUES[genre] ?? 220) + Math.round((R() - 0.5) * 44) + 360) % 360;
  const lv = Math.round((R() - 0.5) * 8);
  const dark = genre === 'horror';
  const c = {
    bg: hsl(h, dark ? 30 : 42, (dark ? 13 : 24) + lv / 2),
    mid: hsl(h, dark ? 30 : 45, dark ? 20 : 32),
    dark: hsl(h, 35, dark ? 8 : 17),
    hi: hsl(h, 70, 64),
    alt: hsl((h + 40) % 360, 75, 62),
  };
  // Motif is drawn in the 640x360 space and scaled up for OG images.
  const art = motif(genre, R, 640, 360, c);
  const scale = og ? 1200 / 640 : 1;
  const pad = og ? 72 : 40;
  // Keep the title inside the centre 4:3 area so mobile crops never cut it.
  const maxW = og ? 700 : 400;
  const { size, lines } = fitTitle(game.title, maxW, og ? [84, 72, 62, 54] : [46, 40, 34, 30]);
  const lineH = size * 1.08;
  const blockH = lines.length * lineH;
  const x = og ? pad : 120;
  const y0 = og ? H - pad - blockH - 40 : (H - blockH) / 2 + size * 0.8;
  const text = lines.map((l, i) => `<tspan x="${x}" y="${r1(y0 + i * lineH + (og ? size * 0.8 : 0))}">${e(l)}</tspan>`).join('');
  const shade = `<rect width="${W}" height="${H}" fill="url(#fade)"/>`;
  const brand = og ? `<g transform="translate(${W - pad - 250} ${pad - 8})"><rect width="48" height="48" rx="12" fill="#fff"/><path d="M13.5 32 24 11l10.5 21M17.4 24.8h13.2" fill="none" stroke="${c.bg}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="37" r="2.6" fill="${c.bg}"/><text x="62" y="36" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="32" font-weight="700" fill="#fff">GameAtlas</text></g>` : '';
  const subtitle = og ? `<text x="${pad}" y="${H - pad}" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="30" font-weight="500" fill="#fff" fill-opacity=".82">${e(game.ogLine || '')}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><linearGradient id="fade" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${c.dark}" stop-opacity=".85"/><stop offset=".55" stop-color="${c.dark}" stop-opacity="0"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="${c.bg}"/>
<g transform="scale(${scale})">${art}</g>
${shade}
<text font-family="Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif" font-size="${size}" font-weight="800" fill="#fff" letter-spacing="-0.5">${text}</text>
${subtitle}${brand}
</svg>`;
}

export function siteOgSvg(site, gameCount) {
  const W = 1200, H = 630;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#141a2e"/>
${Array.from({ length: 7 }, (_, i) => `<circle cx="${980}" cy="${315}" r="${60 + i * 70}" fill="none" stroke="#3451d1" stroke-opacity="${0.5 - i * 0.06}" stroke-width="2"/>`).join('')}
<g transform="translate(80 150)"><rect width="96" height="96" rx="22" fill="#5b74f0"/><path d="M27 66 48 22l21 44M34.8 51.5h26.4" fill="none" stroke="#fff" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="48" cy="76" r="5" fill="#fff"/></g>
<text x="80" y="340" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="104" font-weight="800" fill="#fff" letter-spacing="-2">${e(site.name)}</text>
<text x="84" y="410" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="44" font-weight="500" fill="#c9d2ff">${e(site.tagline)}</text>
<text x="84" y="520" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="28" fill="#fff" fill-opacity=".75">${gameCount} games · filter by players, co-op or versus, genre and platform</text>
</svg>`;
}
