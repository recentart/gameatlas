// Verifies catalog sources against the real world. Run before adding or editing games:
//   node scripts/check-sources.mjs
// - Steam games: the app ID must resolve to the same title, and price / single-player /
//   co-op / versus / split-screen / controller claims are compared with Steam's own listing.
// - Other sources: the official page must answer (plain fetch; many sites block bots, so
//   403/429/503 answers are reported as "check by hand" rather than failures).
// Responses are cached in .cache/steam so re-runs are quick.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const games = JSON.parse(readFileSync(join(ROOT, 'data/games.json'), 'utf8'));
const CACHE = join(ROOT, '.cache/steam');
mkdirSync(CACHE, { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
const problems = [], manual = [];

async function steam(id) {
  const f = join(CACHE, `${id}.json`);
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=us&l=english`);
  const d = Object.values(await r.json())[0];
  writeFileSync(f, JSON.stringify(d));
  await new Promise((res) => setTimeout(res, 350));
  return d;
}

for (const g of games) {
  if (g.sourceName === 'GameAtlas Originals') continue;
  if (g.steamAppId) {
    const d = await steam(g.steamAppId);
    if (!d?.success) { problems.push(`${g.slug}: Steam app ${g.steamAppId} not found`); continue; }
    const x = d.data;
    const cats = new Set((x.categories || []).map((c) => c.description));
    if (!norm(x.name).includes(norm(g.title).slice(0, 8))) problems.push(`${g.slug}: Steam name "${x.name}" vs "${g.title}"`);
    const steamFree = x.is_free;
    if (steamFree !== (g.price === 'free') && !g.priceNote) problems.push(`${g.slug}: Steam is_free=${steamFree}, catalog price=${g.price}`);
    const has = (m) => g.modes.includes(m);
    if (has('single') && !cats.has('Single-player')) manual.push(`${g.slug}: catalog says single-player, Steam doesn't list it`);
    if (has('online-coop') && !cats.has('Online Co-op') && !cats.has('Co-op')) manual.push(`${g.slug}: online co-op not listed on Steam`);
    if (has('online-pvp') && !cats.has('Online PvP') && !cats.has('PvP') && !cats.has('Multi-player')) manual.push(`${g.slug}: online versus not listed on Steam`);
    if (g.modes.some((m) => m.startsWith('local-')) && !cats.has('Shared/Split Screen') && !cats.has('Shared/Split Screen Co-op') && !cats.has('Shared/Split Screen PvP')) manual.push(`${g.slug}: local play not listed on Steam (may be console-only)`);
    if (g.controllerSupport && ![...cats].some((c) => /controller/i.test(c))) manual.push(`${g.slug}: controller support not listed on Steam`);
    continue;
  }
  try {
    const r = await fetch(g.sourceUrl, { headers: { 'user-agent': UA, 'accept-language': 'en-US' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if ([401, 403, 429, 503].includes(r.status)) manual.push(`${g.slug}: ${g.sourceUrl} answered ${r.status} to a script (bot protection) — open it in a browser`);
    else if (!r.ok) problems.push(`${g.slug}: ${g.sourceUrl} -> ${r.status}`);
  } catch (e) {
    problems.push(`${g.slug}: ${g.sourceUrl} -> ${e.message}`);
  }
}

console.log(`Checked ${games.length} games.`);
if (manual.length) console.log(`\nCheck by hand (${manual.length}):\n  ${manual.join('\n  ')}`);
if (problems.length) { console.log(`\nProblems (${problems.length}):\n  ${problems.join('\n  ')}`); process.exit(1); }
console.log('\nNo problems.');
