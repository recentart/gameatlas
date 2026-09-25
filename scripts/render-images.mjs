// Renders raster images with headless Chrome and writes them to assets/ (committed):
//   assets/og/<slug>.jpg, assets/og/site.jpg   1200x630 Open Graph images
//   assets/favicon.svg, favicon.ico, apple-touch-icon.png
// Run after `node scripts/build.mjs` (which writes the OG source SVGs to .cache/og-src).
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './lib/chrome.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, '.cache/og-src');
const OUT = join(ROOT, 'assets');
mkdirSync(join(OUT, 'og'), { recursive: true });

const MARK = (bg, fg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${bg}"/><path d="M9 21.5 16 7l7 14.5" fill="none" stroke="${fg}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.6 16.5h8.8" stroke="${fg}" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="24.5" r="1.8" fill="${fg}"/></svg>`;
writeFileSync(join(OUT, 'favicon.svg'), MARK('#3451d1', '#ffffff'));

const only = process.argv[2];
const chrome = await launchChrome();
const page = await chrome.newPage();

async function render(svg, w, h, fmt) {
  await page.viewport(w, h);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style></head><body>${svg}</body></html>`;
  await page.goto(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  return page.screenshot({ clip: { x: 0, y: 0, width: w, height: h }, ...(fmt ? { format: fmt, quality: 84 } : {}) });
}

// Favicons
const png32 = await render(MARK('#3451d1', '#ffffff').replace('viewBox', 'width="32" height="32" viewBox'), 32, 32);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); // header: icon, 1 image
ico.writeUInt8(32, 6); ico.writeUInt8(32, 7); ico.writeUInt8(0, 8); ico.writeUInt8(0, 9);
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png32.length, 14); ico.writeUInt32LE(22, 18);
writeFileSync(join(OUT, 'favicon.ico'), Buffer.concat([ico, png32])); // PNG-in-ICO, supported by all current browsers
const touch = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180"><rect width="180" height="180" fill="#3451d1"/><g transform="translate(26 26) scale(4)"><path d="M9 21.5 16 7l7 14.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.6 16.5h8.8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="24.5" r="1.8" fill="#fff"/></g></svg>`;
writeFileSync(join(OUT, 'apple-touch-icon.png'), await render(touch, 180, 180));

// Open Graph images
let n = 0;
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.svg'))) {
  if (only && !f.startsWith(only)) continue;
  writeFileSync(join(OUT, 'og', f.replace('.svg', '.jpg')), await render(readFileSync(join(SRC, f), 'utf8'), 1200, 630, 'jpeg'));
  n++;
}
await page.close();
await chrome.close();
console.log(`Rendered ${n} OG images and favicons into assets/`);
