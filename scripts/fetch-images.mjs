// Fetches each listed game's official artwork and makes card-sized WebP copies.
//   node scripts/fetch-images.mjs            fetch missing images
//   node scripts/fetch-images.mjs --force    refetch everything
//   node scripts/fetch-images.mjs <slug>     one game
// Sources, in order:
//   Steam games  -> the store capsule (616x353) or header image supplied by the publisher
//   others       -> the official page's og:image / twitter:image (the publisher's share image)
// Output: assets/games/<slug>-640.webp, <slug>-320.webp, and data/images.json (source + credit).
// GameAtlas Originals are captured from real gameplay by scripts/capture-originals.mjs.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './lib/chrome.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets/games');
const MANIFEST = join(ROOT, 'data/images.json');
mkdirSync(OUT, { recursive: true });
const games = JSON.parse(readFileSync(join(ROOT, 'data/games.json'), 'utf8'));
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.find((a) => !a.startsWith('--'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

let chrome;
async function page() {
  chrome ||= await launchChrome();
  const p = await chrome.newPage();
  await p.send('Network.enable');
  await p.send('Network.setUserAgentOverride', { userAgent: UA });
  return p;
}

// Games whose official site has no usable share image.
//   steam: the same game's Steam store listing (same publisher artwork)
//   screenshot: the official browser game's own title screen, captured at 1280x720
const OVERRIDES = {
  'rocket-league': { steam: 252950 },
  'cookie-clicker': { steam: 1454400 },
  'smash-karts': { screenshot: true, wait: 16000 },
  'codenames-online': { screenshot: true },
  'minecraft-classic': { screenshot: true },
  // Its cookie banner is pinned to the bottom: render taller and capture the top 16:9.
  'bonk-io': { screenshot: true, height: 960, clip: { x: 0, y: 0, width: 1280, height: 720 } },
  'a-dark-room': { steam: 2460660 },
  'universal-paperclips': { screenshot: true, width: 760, height: 428, scale: 1.7 },
  'qwop': { screenshot: true },
};

async function screenshotOf(url, o = {}) {
  const p = await page();
  try {
    await p.viewport(o.width || 1280, o.height || 720, { scale: o.scale || 1 });
    await p.goto(url, { timeout: 30000 }).catch(() => {});
    await new Promise((res) => setTimeout(res, o.wait || 6000));
    // Dismiss banners that would cover the game (reject non-essential cookies where offered).
    const re = o.dismiss ? o.dismiss.source : '^(reject all|only essential|decline|necessary only|got it)$';
    await p.eval(`(() => { const b = [...document.querySelectorAll('button, a, input[type=button]')].find(x => new RegExp(${JSON.stringify(re)}, 'i').test((x.textContent || x.value || '').trim())); if (b) b.click(); })()`).catch(() => {});
    if (o.hideText) await p.eval(`(() => { for (const el of document.querySelectorAll('body *')) if ((el.innerText || '').trim().startsWith(${JSON.stringify(o.hideText)})) { let n = el; while (n.parentElement && n.parentElement !== document.body && (n.parentElement.innerText || '').trim().startsWith(${JSON.stringify(o.hideText)})) n = n.parentElement; n.style.display = 'none'; } })()`).catch(() => {});
    await new Promise((res) => setTimeout(res, 1200));
    return { bytes: await p.screenshot(o.clip ? { clip: o.clip } : {}), type: 'image/png' };
  } finally { await p.close(); }
}

async function steamImage(id) {
  const capsule = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/capsule_616x353.jpg`;
  const r = await fetch(capsule, { method: 'HEAD' });
  if (r.ok && (r.headers.get('content-type') || '').startsWith('image/')) return capsule;
  const d = Object.values(await (await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=us&l=english`)).json())[0];
  return d?.data?.header_image || null;
}

function metaImage(html, base) {
  const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/i);
  if (!m) return null;
  const c = m[0].match(/content=["']([^"']+)["']/i);
  return c ? new URL(c[1].replace(/&amp;/g, '&'), base).href : null;
}

async function officialImage(url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en-US' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (r.ok) { const img = metaImage(await r.text(), r.url); if (img) return img; }
  } catch { /* fall through to Chrome */ }
  const p = await page();
  try {
    await p.goto(url, { timeout: 30000 }).catch(() => {});
    await new Promise((res) => setTimeout(res, 2500));
    return await p.eval(`(() => { const m = document.querySelector('meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="twitter:image"], meta[property="twitter:image"]'); return m ? new URL(m.content, location.href).href : null; })()`);
  } finally { await p.close(); }
}

async function download(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, referer: new URL(url).origin + '/' }, signal: AbortSignal.timeout(30000) });
  const type = r.headers.get('content-type') || '';
  if (!r.ok || !type.startsWith('image/')) throw new Error(`${r.status} ${type}`);
  return { bytes: Buffer.from(await r.arrayBuffer()), type };
}

// Cover-crop to 16:9 and encode WebP in Chrome (no image libraries needed).
export async function toWebp(bytes, type, sizes = [640, 320]) {
  const p = await page();
  try {
    await p.goto('about:blank');
    const out = await p.eval(`(async () => {
      const img = new Image();
      img.src = 'data:${type};base64,${bytes.toString('base64')}';
      await img.decode();
      const res = {};
      for (const w of ${JSON.stringify(sizes)}) {
        const h = Math.round(w * 9 / 16);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
        const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
        const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
        g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        res[w] = c.toDataURL('image/webp', 0.84).split(',')[1];
      }
      return { res, w: img.naturalWidth, h: img.naturalHeight };
    })()`);
    return out;
  } finally { await p.close(); }
}

async function main() {
  const todo = games.filter((g) => g.sourceName !== 'GameAtlas Originals' && (!only || g.slug === only)
    && (force || only || !manifest[g.slug] || !existsSync(join(OUT, `${g.slug}-640.webp`))));
  const failed = [];
  for (const g of todo) {
    try {
      const o = OVERRIDES[g.slug] || {};
      const steamId = g.steamAppId || o.steam;
      let from, url, bytes, type;
      if (o.screenshot) {
        from = 'official game page (title screen)';
        url = g.sourceUrl;
        ({ bytes, type } = await screenshotOf(g.sourceUrl, o));
      } else {
        from = steamId ? 'Steam store page' : ({ 'Official site': 'official site', Nintendo: 'Nintendo store page', 'itch.io': 'itch.io page', 'The New York Times': 'official site' }[g.sourceName] || `${g.sourceName} page`);
        url = steamId ? await steamImage(steamId) : await officialImage(g.sourceUrl);
        if (!url) throw new Error('no official image found');
        ({ bytes, type } = await download(url));
      }
      const { res, w, h } = await toWebp(bytes, type);
      if (w < 300) throw new Error(`image too small (${w}x${h})`);
      writeFileSync(join(OUT, `${g.slug}-640.webp`), Buffer.from(res[640], 'base64'));
      writeFileSync(join(OUT, `${g.slug}-320.webp`), Buffer.from(res[320], 'base64'));
      manifest[g.slug] = { url, from, page: g.sourceUrl, credit: `Artwork © ${g.developer} and/or its publisher, from the ${from}`, size: `${w}x${h}`, fetched: new Date().toISOString().slice(0, 10) };
      console.log(`ok   ${g.slug}  ${w}x${h}  ${url}`);
    } catch (e) {
      failed.push(g.slug);
      console.log(`FAIL ${g.slug}: ${e.message}`);
    }
    writeFileSync(MANIFEST, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 2) + '\n');
  }
  await chrome?.close();
  console.log(`\n${todo.length - failed.length}/${todo.length} fetched${failed.length ? `; failed: ${failed.join(', ')}` : ''}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
