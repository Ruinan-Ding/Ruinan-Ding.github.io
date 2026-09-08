// useClockSettings, end to end: the theme the clocks are drawn in, the
// 12/24 setting they show, and the zone they read.
//
// The theme half covers the one thing hanging off that pair which isn't a
// CSS variable: the theme-color meta, which tells the browser's own chrome
// what colour the page went and so has to follow the toggle, not the OS.
// The zone half covers the validation, which is load-bearing: Intl throws
// on an unknown zone and on every format call after, so a hand-edited
// store took the whole page down rather than the clock.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 9850);
const profile = mkdtempSync(join(tmpdir(), 'theme-'));
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

const clickEl = async (expr, name) => {
  const p = await ev(`(()=>{const e=${expr};if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  if (!p) { out.push({ name: `${name} (not found)`, got: 'missing', want: 'found', pass: false }); return false; }
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(600);
  return true;
};

const themeColor = () => ev(`document.querySelector('meta[name="theme-color"]')?.content ?? null`);
const surface = () => ev(`getComputedStyle(document.documentElement).getPropertyValue('--app-surface').trim()`);
const THEME_BUTTON = `[...document.querySelectorAll('button')].find((b) => /Switch to the (light|dark) theme/.test(b.getAttribute('aria-label') ?? ''))`;

await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(1500);
// Confirmations off, so the theme button acts on one click.
await ev(`localStorage.setItem('timerConfirmMode','"none"'), localStorage.setItem('timerLightTheme','false'), 'ok'`);
await send('Page.reload');
await sleep(2500);

check('starts dark', await ev(`document.documentElement.dataset.theme`), 'dark');
check('and says so to the browser', await themeColor(), await surface());
const dark = await themeColor();

await clickEl(THEME_BUTTON, 'the theme button');
check('one click is the light theme', await ev(`document.documentElement.dataset.theme`), 'light');
check('the chrome followed it', await themeColor(), await surface());
check('to a different colour', (await themeColor()) !== dark, 'true');

await clickEl(THEME_BUTTON, 'the theme button again');
check('and back', await ev(`document.documentElement.dataset.theme`), 'dark');
check('with the colour back too', await themeColor(), dark);

// The stored theme is what the next visit opens on, chrome included.
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(1500);
await ev(`localStorage.setItem('timerLightTheme','true'), 'ok'`);
await send('Page.reload');
await sleep(2500);
check('a stored light theme reloads light', await ev(`document.documentElement.dataset.theme`), 'light');
check('and the chrome with it', await themeColor(), await surface());

// The clock's own button. 12-hour time carries AM or PM and 24-hour
// does not, so the face itself says which setting is live.
const FORMAT_BUTTON = `[...document.querySelectorAll('button')].find((b) => /Show the clock as (12|24)-hour time/.test(b.getAttribute('aria-label') ?? ''))`;
const clockFace = () => ev(`${FORMAT_BUTTON}?.textContent?.trim() ?? null`);
const isTwelveHour = async () => /(AM|PM)/.test((await clockFace()) ?? '');

await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(1500);
await ev(`localStorage.setItem('timerConfirmMode','"none"'), localStorage.setItem('timerClock24Hour','false'), 'ok'`);
await send('Page.reload');
await sleep(2500);

check('starts on 12-hour time', await isTwelveHour(), 'true');
await clickEl(FORMAT_BUTTON, 'the clock');
check('one click is 24-hour', await isTwelveHour(), 'false');
check('and the button offers the way back', await ev(`${FORMAT_BUTTON}?.getAttribute('aria-label')`), 'Show the clock as 12-hour time');
check('the setting is stored', await ev(`localStorage.getItem('timerClock24Hour')`), 'true');
await send('Page.reload');
await sleep(2500);
check('and survives a reload', await isTwelveHour(), 'false');

// A zone the browser doesn't know reaches Intl on every format call.
// Falling back is what keeps that from taking the page down.
await ev(`localStorage.setItem('timerClockTimeZone','"Not/AZone"'), 'ok'`);
await send('Page.reload');
await sleep(2500);
check('a junk zone still renders', await ev(`document.querySelector('h1')?.textContent ?? null`), 'Write Timer');
check('and is replaced by the default', await ev(`localStorage.getItem('timerClockTimeZone')`), '"America/New_York"');

for (const r of out) console.log(`${r.pass ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(34)} got=${r.got} want=${r.want}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);

ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
