# GameAtlas

**Find the right game.** An organised game directory: filter games by number of players, co-op or versus, local or online, genre, platform, price, session length and more.

Live: https://gameatlas.freewebtoolss.workers.dev

- 184 games: 171 listed from their official sources, plus 13 **GameAtlas Originals** you can play on the site (with fullscreen), each playable with keyboard/mouse, touch or a controller.
- Official artwork for every listed game; real gameplay screenshots for the Originals.
- The whole site can be browsed with a game controller (D-pad, A, B, Y, LB/RB).
- 43 category pages (only categories with at least 3 games get a page).
- Natural search without AI: "4 player fighting", "2 player horror", "local racing", "free browser games".
- Favourites, recently played and saved searches in the browser. No account needed.
- No backend, no analytics, no tracking, no third-party requests. Static files on Cloudflare.

## Commands

```bash
node scripts/build.mjs          # validate data/ and build dist/
node scripts/serve.mjs          # serve dist/ at http://localhost:8788 (mimics Cloudflare)
npm test                        # logic tests: search, filters, storage, catalog validation
node scripts/e2e.mjs            # 58 headless-Chrome tests against a local server (incl. every game played in its page and fake-controller tests)
BASE_URL=https://gameatlas.freewebtoolss.workers.dev node scripts/e2e.mjs   # same tests, live site
node scripts/check-sources.mjs  # check every game's source link and Steam facts
node scripts/fetch-images.mjs   # fetch official artwork for listed games -> assets/games + data/images.json
node scripts/capture-originals.mjs  # gameplay screenshots for GameAtlas Originals (after a build)
node scripts/render-images.mjs  # re-render OG images + favicons into assets/ (after a build)
npx wrangler deploy             # builds, then uploads dist/ to Cloudflare
```

Node 22+ is the only requirement. There are no npm dependencies; the browser tests drive a local Chrome over the DevTools protocol (`scripts/lib/chrome.mjs`, set `CHROME_PATH` if Chrome isn't in the usual place).

## Project structure

```
data/
  games.json          the catalog (one object per game, schema below)
  categories.json     category pages; each one is a filter definition
  taxonomy.json       genres, modes, platforms, lengths, features (labels + ids)
  site.json           name, URLs, ad slots, accounts flag
src/
  js/app.js           entry for every page: theme, menu, saves, search dialog, page router
  js/lib/             pure logic, shared by the build (Node) and the browser
    filters.js        filter state, matching rules, facet counts, URL (de)serialisation
    search.js         query parser ("4 player fighting" -> filters) and ranking
    storage.js        localStorage document: favourites, recent, saved searches, prefs
    account.js        optional-account interface (no backend in V1)
    format.js         labels ("2–4 players", "Local & online co-op")
    catalog.js        loads the hashed catalog JSON once
  js/ui/              card.js (shared card markup), icons.js (SVG sprite), searchbox.js, ads.js
  js/pages/           browse.js, game.js, saved.js, account.js, home.js, notfound.js
  styles/             tokens.css (light/dark), base, components, browse, game, pages
  play/               GameAtlas Originals (self-contained HTML5 games, embedded via iframe)
scripts/
  build.mjs           the static site generator
  lib/templates.mjs   page templates;  lib/covers.mjs   original SVG cover art
  lib/validate.mjs    catalog rules (the build fails on any error)
  serve.mjs, e2e.mjs, check-sources.mjs, render-images.mjs, lib/chrome.mjs
assets/               favicons and OG images (committed, made by render-images.mjs)
test/logic.test.mjs   node:test unit tests
```

`dist/` is generated and not committed. `wrangler.jsonc` points Cloudflare at `./dist` and runs the build before every deploy.

## Adding a game

1. Add an object to `data/games.json`. Copy a similar game and change every field.
2. Write the `summary` (max 110 characters) and `description` yourself. Never paste store text.
3. `sourceUrl` must be the official store page, official site or publisher page. For Steam games also set `steamAppId`.
4. Run `node scripts/check-sources.mjs`, then `npm test` and `node scripts/build.mjs`.
5. Run `node scripts/fetch-images.mjs <slug>` for its official artwork, then `node scripts/build.mjs` and `node scripts/render-images.mjs <slug>` for its share image.

| Field | Meaning |
| --- | --- |
| `players` | `{ min, max, local?, online?, plus? }`. `max: null` = no fixed limit; `plus: true` shows "8+". `local`/`online` are the max on one screen / online. |
| `modes` | any of `single`, `local-coop`, `local-pvp`, `online-coop`, `online-pvp`, `team`, `turn-based` |
| `genres`, `platforms` | ids from `taxonomy.json`; platforms are `browser`, `pc`, `mobile`, `console` |
| `price` | `free` (includes free-to-play) or `paid`; put details in `priceNote` |
| `sessionLength` | `under-10`, `10-30`, `30-60`, `60-plus` (a typical round or sitting) |
| `downloadRequired`, `accountRequired`, `controllerSupport`, `keyboardSupport`, `mobileFriendly`, `familyFriendly` | booleans; `accountNote` explains which account |
| `embedAllowed`, `embedUrl` | only for games GameAtlas hosts itself (`/play/<slug>`). The validator refuses anything else. |
| `featured` | shows the game earlier in default ordering |

The validator also enforces consistency (a 1-player game can't have multiplayer modes, a game with a single-player mode must have `min: 1`, category slugs can't collide with game slugs, and so on).

## How search and filters work

- **Filters**: within Players, Genre, Platform, Price and Session length, choices are OR ("2 or 4 players"). Mode and Other choices are AND. Local/Online pair with Co-op/PvP, so *Local + Co-op* means "has local co-op".
- **Players**: "1" means the game has a real single-player mode; other numbers mean `min <= n <= max`.
- **Search** (`src/js/lib/search.js`): phrases are recognised first ("4 player", "couch co-op", "free", "horror", "quick" …) and become filters, shown as removable "Showing:" chips. Leftover words must match the title, tags, developer or description (prefix and small-typo matching). A query that is part of a title always finds that game. If keywords match nothing, the structured part is shown instead with a note.
- Filter state lives in the URL (`?players=4&genre=fighting&mode=local`), so every result list can be shared or saved.

## Categories

`data/categories.json` defines each page as a filter, e.g. `{ "slug": "local-co-op", "filters": { "modes": ["local", "coop"] } }`. To add one, add an entry with an original `h1`, `description` and `intro`. The build skips categories with fewer than `minGames` games, so there are no empty SEO pages.

## Ads

Placeholder slots are rendered by `adSlot()` in `scripts/lib/templates.mjs` (home, results bottom, game page below the details). They are labelled "Advertisement", reserve realistic sizes (728×90 desktop, 320×100 mobile) and are never inside the game player, filters, navigation or fullscreen. To use a real network, call `registerAdProvider({ name, render(slot, { id, format }) })` from `src/js/ui/ads.js` and widen the Content-Security-Policy in `scripts/build.mjs`.

## Accounts

The site never requires an account. V1 has no auth backend: the header's "Log in" leads to a page that says so plainly and offers the real benefit (moving saves between devices) through export/import of the same JSON document `storage.js` keeps. `src/js/lib/account.js` defines the provider interface a future sync service would implement. The only account prompt is a quiet, dismissible line on the Saved page after 3 saves.

## GameAtlas Originals

`src/play/<slug>/` holds small original games (Paddle Duel, Four in a Row, Light Trails, Reflex Party, Memory Pairs, Dots and Boxes, Loop Racer, Serpent, Brick Breaker, Air Hockey, Mine Field, Block Drop, Tank Duel). The shared shell gives every game controller support (D-pad/stick through menus and boards, A select, Start pause, Select returns to the page), and touch controls on phones. They are plain classic scripts sharing `src/play/shared/shell.js`, run in a sandboxed iframe (`allow-scripts allow-same-origin allow-pointer-lock`: no pop-ups or top navigation, but a real origin so the Gamepad API works), and never show ads. Fullscreen targets only the game frame; browsers without the Fullscreen API (iPhone) get a fixed-position fallback with an exit bar above, not over, the game.

## Content policy

Every description is original. Game images are the publishers' official artwork (Steam store capsule or the official page's share image), fetched by `scripts/fetch-images.mjs`, recorded with source and credit in `data/images.json`, and credited on each game page; a few browser games without share images use a capture of their own title screen. Originals use gameplay screenshots from `scripts/capture-originals.mjs`. Generated SVG covers (`scripts/lib/covers.mjs`) remain as a fallback. Third-party games are only linked, never embedded or re-hosted.
