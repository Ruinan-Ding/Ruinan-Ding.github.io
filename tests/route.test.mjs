// The one route and its fallback. There is no router: App.tsx compares the
// path it was loaded on against Vite's base, and GitHub Pages hands the
// same bundle to anything it can't resolve to a file.
//
// /index.html is the case worth a test. It resolves, so Pages serves it
// rather than 404.html, and it arrives spelled that way instead of as /,
// which read as an unknown path and put the 404 screen on the home page.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 9800);
const profile = mkdtempSync(join(tmpdir(), 'route-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 100 && !wsUrl; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
  } catch { /* not up */ }
  if (!wsUrl) await sleep(100);
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 1; const pending = new Map();
ws.onmessage = (m) => { const x = JSON.parse(m.data); if (pending.has(x.id)) { pending.get(x.id)(x.result); pending.delete(x.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = id++; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;

const out = [];
const check = (name, got, want) => out.push({ name, got: String(got), want: String(want), pass: String(got) === String(want) });

// The <h1> is the whole verdict: "Write Timer" is the sr-only heading on
// the real page, "404" is the one on the fallback.
const heading = async (path) => {
  await send('Page.navigate', { url: `http://localhost:5199${path}` });
  await sleep(2000);
  return ev(`document.querySelector('h1')?.textContent ?? null`);
};

check('/ is the timer', await heading('/'), 'Write Timer');
check('/index.html is the same page', await heading('/index.html'), 'Write Timer');
check('an unknown path is the 404', await heading('/nope'), '404');
check('so is a deeper one', await heading('/a/b/c'), '404');
// A real link, not a button calling into a router that is no longer there.
await heading('/nope');
check('the way home is a link', await ev(`document.querySelector('a[href="/"]')?.textContent?.trim() ?? null`), 'GO HOME');

for (const r of out) console.log(`${r.pass ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(34)} got=${r.got} want=${r.want}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);

ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
