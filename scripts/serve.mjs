// Local static server that mimics Cloudflare Workers static assets for dist/:
// html_handling "drop-trailing-slash", not_found_handling "404-page", _headers and _redirects.
// Usage: node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

function parseHeaders() {
  const rules = [];
  let cur = null;
  for (const line of readFileSync(join(DIST, '_headers'), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    if (!line.startsWith(' ')) { cur = { pattern: line.trim(), headers: {} }; rules.push(cur); continue; }
    const i = line.indexOf(':');
    cur.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return rules;
}
function parseRedirects() {
  return readFileSync(join(DIST, '_redirects'), 'utf8').split('\n').filter(Boolean).map((l) => l.trim().split(/\s+/));
}
const isFile = (p) => existsSync(p) && statSync(p).isFile();

export function startServer(port = 8788) {
  const headerRules = parseHeaders();
  const redirects = parseRedirects();
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    const extra = {};
    for (const r of headerRules) {
      const re = new RegExp(`^${r.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
      if (re.test(path)) Object.assign(extra, r.headers);
    }
    const send = (status, file, headers = {}) => {
      res.writeHead(status, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', ...extra, ...headers });
      res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
    };
    for (const [from, to, code] of redirects) {
      const names = [];
      const re = new RegExp(`^${from.replace(/:([a-z]+)/g, (_, n) => { names.push(n); return '([^/]+)'; })}$`);
      const m = path.match(re);
      if (!m) continue;
      const target = names.reduce((t, n, i) => t.replace(`:${n}`, m[i + 1]), to);
      res.writeHead(Number(code) || 302, { Location: target + url.search });
      return res.end();
    }
    if (path.includes('..') || path.includes('/_')) { return send(404, join(DIST, '404.html')); }
    if (path.length > 1 && path.endsWith('/')) {
      const bare = path.slice(0, -1);
      if (isFile(join(DIST, `${bare}.html`)) || isFile(join(DIST, bare, 'index.html'))) { res.writeHead(307, { Location: bare + url.search }); return res.end(); }
    }
    if (path.endsWith('.html')) { res.writeHead(307, { Location: path.replace(/(index)?\.html$/, '') || '/' }); return res.end(); }
    const candidates = path === '/' ? [join(DIST, 'index.html')] : [join(DIST, path), join(DIST, `${path}.html`), join(DIST, path, 'index.html')];
    for (const c of candidates) if (isFile(c)) return send(200, c);
    return send(404, join(DIST, '404.html'));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.argv[2]) || 8788;
  startServer(port).then(() => console.log(`GameAtlas at http://localhost:${port}`));
}
