// Headless-Chrome measuring tape. No deps: node 25 has a global WebSocket,
// so CDP is reachable over the wire straight from the runtime.
//
//   node cdp.mjs '<json config>'
//
// config: { url, port?, storage?: {k:v}, sizes: [[w,h],...], expr: "<js>" }
// expr runs in the page after each resize+reload and must evaluate to a
// JSON-serialisable value (top-level await allowed).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const cfg = JSON.parse(process.argv[2]);
const port = cfg.port ?? 9333;
const profile = mkdtempSync(join(tmpdir(), 'cdp-'));

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--force-device-scale-factor=1',
  '--hide-scrollbars',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetUrl() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('chrome never came up');
}

const ws = new WebSocket(await targetUrl());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let nextId = 1;
const pending = new Map();
const events = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  } else if (msg.method) events.push(msg);
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = nextId++;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval threw');
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');

// Seed storage on the real origin before the app's first render reads it.
await send('Page.navigate', { url: cfg.url });
await sleep(3000);

// Re-seeded before every reload, not once up front: the app writes its own
// defaults back on mount, so a seed that lands while the dev server is
// still compiling is gone by the time anything renders.
const seed = cfg.storage
  ? `Object.entries(${JSON.stringify(cfg.storage)}).forEach(([k,v])=>localStorage.setItem(k,v)), JSON.stringify(Object.fromEntries(Object.keys(${JSON.stringify(cfg.storage)}).map(k=>[k,localStorage.getItem(k)])))`
  : null;

const out = [];
for (const [w, h] of cfg.sizes) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  // reload:false drags the window instead of reloading, which is what a
  // breakpoint-flapping test needs — the state has to survive the crossing.
  if (cfg.reload !== false) {
    if (seed) await evaluate(seed);
    await send('Page.reload', {});
  }
  await sleep(cfg.settle ?? 1400);
  try {
    out.push({ w, h, ...(await evaluate(cfg.expr)) });
  } catch (e) {
    out.push({ w, h, error: String(e.message).slice(0, 300) });
  }
}

out.forEach((row) => console.log(JSON.stringify(row)));
ws.close();
chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* windows holds the lock briefly */ }
process.exit(0);
