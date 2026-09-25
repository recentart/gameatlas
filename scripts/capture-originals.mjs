// Captures real gameplay screenshots of every GameAtlas Original as its cover image.
//   node scripts/build.mjs && node scripts/capture-originals.mjs [slug]
// Each game is started and played briefly by a script (CPU opponents, a few moves),
// then captured at 1280x720 and saved as assets/games/<slug>-640.webp / -320.webp.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './lib/chrome.mjs';
import { startServer } from './serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets/games');
const MANIFEST = join(ROOT, 'data/images.json');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv[2];

// Scripted play per game: `setup` clicks menu options, `play` runs after Start.
const SCRIPTS = {
  'paddle-duel': { play: async (p) => { await p.eval(`GA.keys.KeyW = true`); await sleep(500); await p.eval(`GA.keys.KeyW = false`); await sleep(1600); } },
  'four-in-a-row': { play: async (p) => { for (const c of [3, 2, 4, 4, 5]) { await p.eval(`document.querySelector('[data-col="${c}"]').click()`); await sleep(700); } await sleep(600); } },
  'light-trails': { setup: `document.querySelector('[data-opt=humans] [data-value="1"]').click(); document.querySelector('[data-opt=total] [data-value="4"]').click()`,
    play: async (p) => { await sleep(1400); const turns = ['KeyS', 'KeyD', 'KeyS', 'KeyD', 'KeyW', 'KeyD']; for (const k of turns) { await p.eval(`GA.keys.${k} = true`); await sleep(90); await p.eval(`GA.keys.${k} = false`); await sleep(260); } await sleep(300); } },
  'reflex-party': { setup: `document.querySelector('[data-opt=players] [data-value="4"]').click()`, play: async () => { await sleep(900); } },
  'memory-pairs': { setup: `document.querySelector('[data-opt=players] [data-value="2"]').click(); document.querySelector('[data-opt=size] [data-value="12"]').click()`,
    play: async (p) => {
      // Match three pairs, then leave two cards face up.
      await p.eval(`(async () => { const cards = [...document.querySelectorAll('[data-i]')]; const faces = cards.map(c => c.querySelector('.f').innerHTML); let found = 0; for (let i = 0; i < faces.length && found < 3; i++) { const j = faces.findIndex((f, k) => k > i && f === faces[i]); if (j > 0 && !cards[i].classList.contains('done')) { document.querySelector('[data-i="' + i + '"]').click(); document.querySelector('[data-i="' + j + '"]').click(); found++; await new Promise(r => setTimeout(r, 350)); } } })()`);
      await sleep(400);
      await p.eval(`(() => { const free = [...document.querySelectorAll('.card:not(.done)')]; free[0].click(); free[5].click(); })()`);
      await sleep(350);
    } },
  'dots-and-boxes': { play: async (p) => { for (const id of ['h-0-0', 'v-0-0', 'h-1-1', 'v-1-2', 'h-2-2', 'v-2-3', 'h-3-0', 'v-1-0']) { await p.eval(`(() => { const g = document.querySelector('.line[data-id="${id}"]:not(.taken)'); if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`); await sleep(650); } await sleep(500); } },
  'serpent': { play: async (p) => { await sleep(1050); await p.eval(`GA.demoGrow(16)`); for (const [k, ms] of [['', 900], ['KeyS', 480], ['KeyD', 650], ['KeyW', 380]]) { if (k) { await p.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${k}' })); GA.keys['${k}'] = true`); await sleep(60); await p.eval(`GA.keys['${k}'] = false`); } await sleep(ms); } } },
  'brick-breaker': { play: async (p) => { await p.eval(`GA.keys.Space = true`); await sleep(200); await p.eval(`GA.keys.Space = false`); await sleep(2600); } },
  'air-hockey': { play: async (p) => { await sleep(2200); } },
  'mine-field': { setup: `document.querySelector('[data-opt=size] [data-value="12"]').click()`, play: async (p) => { await p.eval(`document.querySelector('[data-i="78"]').click()`); await sleep(300); await p.eval(`(() => { const hidden = [...document.querySelectorAll('.cell:not(.open)')]; for (const i of [3, 9, 20]) hidden[i] && hidden[i].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); })()`); await sleep(300); } },
  'block-drop': { setup: `document.querySelector('[data-opt=level] [data-value="5"]').click()`, play: async (p) => { const seq = ['ArrowLeft', 'ArrowLeft', 'Space', 'ArrowRight', 'ArrowUp', 'Space', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'Space', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'Space', 'ArrowUp', 'Space', 'ArrowRight', 'ArrowRight', 'Space']; for (const k of seq) { await p.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${k}' }))`); await sleep(140); } await sleep(500); } },
  'tank-duel': { setup: `document.querySelector('[data-opt=tanks] [data-value="3"]').click()`, play: async (p) => { await sleep(1600); await p.eval(`GA.keys.ArrowUp = true`); await sleep(500); await p.eval(`GA.keys.ArrowUp = false; GA.keys.Space = true`); await sleep(150); await p.eval(`GA.keys.Space = false`); await sleep(650); } },
  'loop-racer': { play: async (p) => { await sleep(3100); await p.eval(`GA.keys.KeyW = true`); await sleep(2600); } },
};

async function toWebp(page, png, title) {
  await page.goto('about:blank');
  return page.eval(`(async () => {
    const img = new Image(); img.src = 'data:image/png;base64,${png.toString('base64')}'; await img.decode();
    const res = {};
    for (const w of [640, 320]) { const c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * 9 / 16); const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
      // Key-art treatment: a dark band at the bottom-left with the game's title.
      const k = w / 640; const grd = g.createLinearGradient(0, c.height, 0, c.height * 0.45); grd.addColorStop(0, 'rgba(8,10,16,0.92)'); grd.addColorStop(1, 'rgba(8,10,16,0)'); g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#fff'; g.font = '800 ' + Math.round(48 * k) + 'px Segoe UI, Roboto, Arial, sans-serif'; g.textBaseline = 'alphabetic'; g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 8 * k; g.fillText(${JSON.stringify(title)}, 28 * k, c.height - 50 * k);
      g.shadowBlur = 0; g.font = '700 ' + Math.round(16 * k) + 'px Segoe UI, Roboto, Arial, sans-serif'; g.fillStyle = '#c9b4ff'; g.fillText('PLAY FREE ON GAMEATLAS', 30 * k, c.height - 24 * k);
      res[w] = c.toDataURL('image/webp', 0.86).split(',')[1]; }
    return res;
  })()`);
}

const server = await startServer(8795);
const chrome = await launchChrome();
const games = JSON.parse(readFileSync(join(ROOT, 'data/games.json'), 'utf8')).filter((g) => g.embedAllowed && (!only || g.slug === only));
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
for (const g of games) {
  const s = SCRIPTS[g.slug] || {};
  const p = await chrome.newPage();
  await p.viewport(1280, 720);
  await p.goto(`http://localhost:8795${g.embedUrl}`);
  await sleep(400);
  if (s.setup) await p.eval(s.setup);
  await p.eval(`document.getElementById('start').click()`);
  await sleep(300);
  if (s.play) await s.play(p);
  const png = await p.screenshot();
  const res = await toWebp(p, png, g.title);
  writeFileSync(join(OUT, `${g.slug}-640.webp`), Buffer.from(res[640], 'base64'));
  writeFileSync(join(OUT, `${g.slug}-320.webp`), Buffer.from(res[320], 'base64'));
  manifest[g.slug] = { url: g.embedUrl, from: 'gameplay on GameAtlas', page: `/games/${g.slug}`, credit: 'Gameplay screenshot of this GameAtlas Original', size: '1280x720', fetched: new Date().toISOString().slice(0, 10) };
  console.log(`ok   ${g.slug}`);
  await p.close();
}
writeFileSync(MANIFEST, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 2) + '\n');
await chrome.close();
server.close();
