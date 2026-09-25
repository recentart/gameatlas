// Minimal headless-Chrome driver over the DevTools protocol (Node 24: global fetch + WebSocket).
// Used by the e2e suite, the image renderer and the source checker. No npm dependencies.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchChrome({ port = 9300 + Math.floor(Math.random() * 500) } = {}) {
  const { existsSync } = await import('node:fs');
  const exe = CHROME_PATHS.find((p) => existsSync(p));
  if (!exe) throw new Error('Chrome not found; set CHROME_PATH');
  const profile = mkdtempSync(join(tmpdir(), 'ga-chrome-'));
  const proc = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio',
    '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });
  let version;
  for (let i = 0; i < 100; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(100); }
  }
  if (!version) throw new Error('Chrome did not start');
  return {
    port,
    async newPage() {
      const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
      return openPage(t.webSocketDebuggerUrl, t.id, port);
    },
    async close() {
      proc.kill();
      await sleep(300);
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
    },
  };
}

function openPage(wsUrl, targetId, port) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  };
  const send = async (method, params = {}, sessionId) => {
    await ready;
    return new Promise((res, rej) => {
      const n = ++id;
      pending.set(n, { res, rej });
      ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  };
  // Out-of-process iframes (e.g. embedded games) get their own sessions; their console
  // errors and exceptions arrive through the same listeners, tagged with msg.sessionId.
  const frames = [];
  let contexts = [];
  listeners.add((m) => {
    if (m.sessionId) return;
    if (m.method === 'Runtime.executionContextCreated') contexts.push(m.params.context);
    if (m.method === 'Runtime.executionContextDestroyed') contexts = contexts.filter((c) => c.id !== m.params.executionContextId);
    if (m.method === 'Runtime.executionContextsCleared') contexts = [];
  });
  listeners.add((m) => {
    if (m.method !== 'Target.attachedToTarget') return;
    const sid = m.params.sessionId;
    frames.push({ sessionId: sid, url: m.params.targetInfo.url });
    send('Runtime.enable', {}, sid).catch(() => {});
    send('Log.enable', {}, sid).catch(() => {});
    send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => {});
  });
  const waitEvent = (name, timeout = 15000) => new Promise((res, rej) => {
    const t = setTimeout(() => { listeners.delete(l); rej(new Error(`timeout waiting for ${name}`)); }, timeout);
    const l = (m) => { if (m.method === name) { clearTimeout(t); listeners.delete(l); res(m.params); } };
    listeners.add(l);
  });

  const page = {
    send,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    frames,
    /** Evaluate in the first iframe document whose URL contains `match` (same- or cross-process). */
    async evalFrame(match, expression) {
      const f = frames.find((x) => x.url.includes(match));
      if (f) {
        const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, f.sessionId);
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
      }
      // Same-process iframe: evaluate in that frame's main-world execution context.
      const tree = await send('Page.getFrameTree');
      const find = (n) => (n.frame.url.includes(match) ? n.frame : (n.childFrames || []).map(find).find(Boolean));
      const frame = find(tree.frameTree);
      if (!frame) throw new Error('frame not found');
      const ctx = contexts.find((c) => c.auxData?.frameId === frame.id && c.auxData?.isDefault);
      if (!ctx) throw new Error('frame context not ready');
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, contextId: ctx.id });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async init() {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Log.enable');
      await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
      return page;
    },
    async goto(url, { timeout = 20000 } = {}) {
      const loaded = waitEvent('Page.loadEventFired', timeout);
      await send('Page.navigate', { url });
      await loaded;
    },
    async eval(expression, { awaitPromise = true } = {}) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expression, timeout = 8000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        try { if (await page.eval(expression)) return true; } catch { /* page navigating */ }
        await sleep(50);
      }
      throw new Error(`waitFor timed out: ${expression}`);
    },
    async viewport(width, height, { mobile = false, scale = 1 } = {}) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
      await send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    },
    async screenshot({ clip, format = 'png', quality } = {}) {
      const r = await send('Page.captureScreenshot', { format, ...(quality ? { quality } : {}), ...(clip ? { clip: { ...clip, scale: 1 } } : {}), captureBeyondViewport: !!clip });
      return Buffer.from(r.data, 'base64');
    },
    async key(key, { code = key, keyCode = 0, text } = {}) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, text });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
    },
    async type(text) {
      for (const ch of text) await send('Input.dispatchKeyEvent', { type: 'char', text: ch });
    },
    async click(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },
    async close() {
      // Close the tab and let Chrome end the socket: closing many WebSockets from the
      // Node side trips a libuv assertion on Windows (Node 24) and kills the run.
      ws.onmessage = null;
      try { await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`); } catch { /* ignore */ }
    },
  };
  return page.init();
}
