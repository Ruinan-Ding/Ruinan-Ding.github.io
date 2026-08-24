// The alarm tip: does it show, is it cut to the room it has, and does it
// stay off the readout beside it.
//
// The tip is a tall narrow column in the top-left corner and the readout is
// centred behind it, so whether they meet depends on the sidebar, the
// window's width and how far the countdown has grown — not on height, which
// is why a stylesheet's height queries could not answer it. Left to those,
// the tip ran over the digits at 13 of these 72 viewports.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHROME } from './chrome.mjs';

const port = Number(process.argv[2] ?? 9591);
const profile = mkdtempSync(join(tmpdir(), 'tipfit-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 100 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
  } catch { /* not up */ }
  if (!wsUrl) await sleep(100);
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 1; const pending = new Map();
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: id++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); return; }
  if (pending.has(x.id)) { pending.get(x.id)(x.result); pending.delete(x.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = id++; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(2500);

const PROBE = `(()=>{
  const p=document.querySelector('.alarm-tip');
  const row=[...document.querySelectorAll('div')].find(e=>e.className.includes && e.className.includes('sm:flex-row') && e.className.includes('flex-1'));
  const col=row?[...row.children].find(e=>!e.className.includes('hidden')):null;
  const inner=col?col.querySelector(':scope > div:last-child'):null;
  // The readout row itself, the same element the clamp measures against.
  // inner.children[0] is the whole block — clock, digits, total, bar — and
  // the clock has its own rule for keeping out of the tip's way.
  const block=inner?inner.children[0]:null;
  const digits=block?[...block.querySelectorAll(':scope > div')].find(e=>e.className.includes('items-baseline')):null;
  // The ink, not the box. The digits are drawn with leading-none, so
  // their row's rect starts well below the top of the numbers in it —
  // 25px at a large size — and an overlap check against the box scores a
  // tip standing squarely in the countdown as clear of it.
  const g=digits?document.createRange():null;
  if(g) g.selectNodeContents(digits);
  const d=g?g.getBoundingClientRect():null;
  if(!p) return {shown:false};
  const cs=getComputedStyle(p);
  if(cs.display==='none') return {shown:false};
  const r=p.getBoundingClientRect();
  const lh=parseFloat(cs.lineHeight);
  const overX=d?Math.round(Math.min(r.right,d.right)-Math.max(r.left,d.left)):0;
  const overY=d?Math.round(Math.min(r.bottom,d.bottom)-Math.max(r.top,d.top)):0;
  return {
    shown:true,
    lines: Math.round(r.height/lh),
    clamp: cs.webkitLineClamp || cs['-webkit-line-clamp'] || '?',
    truncated: p.scrollHeight > p.clientHeight + 1,
    box: [Math.round(r.left),Math.round(r.right),Math.round(r.top),Math.round(r.bottom)],
    digitsL: d?Math.round(d.left):null,
    overlap: (overX>0&&overY>0)?Math.min(overX,overY):0,
  };
})()`;

let bad = 0, total = 0;
for (const sidebar of ['false', 'true']) {
  await ev(`localStorage.clear(),
    localStorage.setItem('timerSilentMode','true'),
    localStorage.setItem('timerSidebarHidden','${sidebar}'),
    localStorage.setItem('wordCounterCollapsed','false'),
    localStorage.setItem('wordCounterCollapsedAt','null'),
    localStorage.setItem('wordCounterFullscreen','false'), 'ok'`);
  await send('Page.reload', {});
  await sleep(2200);
  // 1000 as well as 950: the tip only reached into the digits on a tall
  // window, where the readout has room to grow left into the corner, and
  // the sweep that found it stepped in 40s.
  for (const h of [400, 460, 560, 660, 800, 950, 1000]) {
    for (const w of [700, 820, 1000, 1200, 1500, 1800]) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await sleep(450);
      const r = await ev(PROBE);
      total++;
      const tag = `${w}x${h} sb=${sidebar === 'true' ? 'hid' : 'shown'}`;
      if (!r.shown) { console.log(`   ${tag.padEnd(22)} tip dropped`); continue; }
      if (r.overlap > 0) { bad++; console.log(`FAIL ${tag.padEnd(22)} tip overlaps the countdown by ${r.overlap}px  box=[${r.box}] digitsL=${r.digitsL}`); }
      else console.log(`   ${tag.padEnd(22)} ${String(r.lines).padStart(2)} lines (clamp ${r.clamp})${r.truncated ? ' …' : ''}`);
    }
  }
}
console.log(bad === 0 ? `all ${total} viewports pass` : `${bad} of ${total} viewports fail`);
ws.close(); chrome.kill();
process.exit(bad === 0 ? 0 : 1);
