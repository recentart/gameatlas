# GameAtlas — notes for Claude sessions

Read README.md first: it documents the structure, the data schema, filter semantics and every command.

Rules that matter here:
- Static site only: no backend, no analytics, no tracking, no npm dependencies, no external requests from pages.
- Never copy store descriptions: write original text. Game images are official publisher artwork fetched by `scripts/fetch-images.mjs` (Steam capsule or the official page's share image), credited via `data/images.json`; Originals use real gameplay captured by `scripts/capture-originals.mjs`. Generated SVG covers are only a fallback.
- Only GameAtlas Originals (`src/play/`) may be embedded. Everything else links to its official source.
- No login walls, sign-up prompts or account reminders. The only account prompt is the dismissible line on /saved.
- Ads only in the existing `adSlot()` placements; never in the player, filters, navigation or fullscreen.
- `src/js/lib/*` is shared by the build and the browser: keep it pure (no DOM at import time).
- CSP is strict (`style-src 'self'`): no inline `style=""` attributes in HTML or game pages; set styles via CSSOM or classes.
- Pages use `html_handling: drop-trailing-slash`, so links are `/games/<slug>` (no trailing slash) and game pages reference assets by absolute path.

Before finishing any change: `npm test`, `node scripts/build.mjs`, `node scripts/e2e.mjs` (all must pass). After editing games also run `node scripts/check-sources.mjs`, `node scripts/fetch-images.mjs` (or `capture-originals.mjs` for Originals), `node scripts/build.mjs` and `node scripts/render-images.mjs`.

Every Original must work with keyboard/mouse, touch and a controller (see `src/play/shared/shell.js`: GA.pads, GA.onPad, GA.padMode, GA.moveFocus) and must be added to PROBES in `scripts/e2e.mjs`. Deploy with `npx wrangler deploy`, then run the e2e suite with `BASE_URL` set to the live URL.

On Windows Git Bash, prefix commands that take `/paths` as arguments with `MSYS_NO_PATHCONV=1`.
