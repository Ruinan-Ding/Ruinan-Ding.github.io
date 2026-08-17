// The word counter's switch row: hint under the switches, Copy/Clear/
// full-screen holding their line as the window narrows instead of dropping
// beneath them.
import { spawnSync } from 'node:child_process';

const expr = `(() => {
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return {t:Math.round(b.top), b:Math.round(b.bottom), l:Math.round(b.left), r:Math.round(b.right)}; };
  const findBtn = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.textContent.trim()));
  const words = findBtn(/^Alphanumeric words only$/);
  const chars = findBtn(/^Alphanumeric chars only$/);
  if (!words) return { err: 'no switches — word counter collapsed?' };
  const hint = [...document.querySelectorAll('span')].find((s) => s.textContent.startsWith('Turn both off'));
  const copy = findBtn(/^(Copy|Copied|Failed)$/);
  const clear = findBtn(/^Clear$/);
  const full = document.querySelector('[aria-label="Full screen"], [aria-label="Exit full screen"]');
  const row = words.closest('.flex.justify-between');
  const W = r(words), H = r(hint), F = r(full), C = r(copy), CL = r(clear), R = r(row);
  return {
    // The hint sits beside the switches now rather than under them, so what
    // it has to do is share their line and stay to their right.
    hintOnSwitchLine: H && W ? Math.abs(H.t - W.t) <= Math.max(6, W.b - W.t) : null,
    hintRightOfSwitches: H && W ? H.l >= W.l : null,
    // the right-hand cluster must share the row's top line, not sit under it
    buttonsOnTopLine: F && W ? Math.abs(F.t - W.t) <= 6 : null,
    buttonsRightOfSwitches: F && W ? F.l > W.r : null,
    fullBtn: F, copyBtn: C, clearBtn: CL, switch1: W, hint: H, row: R,
    rowH: R ? R.b - R.t : null,
    fitsRow: F && R ? F.r <= R.r + 1 : null,
    pageScrolls: document.scrollingElement.scrollWidth > innerWidth,
  };
})()`;

const cfg = {
  url: 'http://localhost:5199/',
  port: Number(process.argv[2] ?? 9420),
  storage: {
    wordCounterCollapsed: 'false',
    wordCounterCollapsedAt: 'null',
    wordCounterFullscreen: 'false',
    wordCounterText: 'some text so Copy and Clear render',
    timerSidebarHidden: 'true',
    timerTimeFieldsHidden: 'true',
  },
  sizes: [[1920, 1000], [1400, 850], [1100, 800], [900, 800], [768, 800], [640, 800], [560, 800], [480, 800], [420, 800], [360, 800]],
  expr,
  settle: 2500,
};

const res = spawnSync('node', ['cdp.mjs', JSON.stringify(cfg)], { cwd: import.meta.dirname, encoding: 'utf8', timeout: 600000 });
const rows = (res.stdout || '').split('\n').filter((l) => l.startsWith('{')).map(JSON.parse);
let bad = 0;
for (const r of rows) {
  if (r.err) { console.log(`${r.w}x${r.h}  ${r.err}`); continue; }
  // The tip is allowed to be gone: below 36rem index.css hides it, as the
  // first thing to go when the row runs short. Hidden by display:none it
  // still answers querySelector and reports a rect of zeros, which is what
  // "no box" looks like from out here. What it is not allowed to do is
  // show up in the wrong place, so this asks about its position only when
  // it has one.
  const hintShown = r.hint !== null && (r.hint.b - r.hint.t > 0 || r.hint.r - r.hint.l > 0);
  const hintOk = !hintShown || (r.hintOnSwitchLine && r.hintRightOfSwitches);
  const ok = hintOk && r.buttonsOnTopLine && r.buttonsRightOfSwitches && r.fitsRow && !r.pageScrolls;
  if (!ok) bad++;
  const hintState = hintShown ? `sameline=${r.hintOnSwitchLine} right=${r.hintRightOfSwitches}` : 'hidden';
  console.log(`${String(r.w).padStart(5)}px  hint=${hintState.padEnd(24)} btnsTopLine=${String(r.buttonsOnTopLine).padEnd(5)} btnsRight=${String(r.buttonsRightOfSwitches).padEnd(5)} fits=${String(r.fitsRow).padEnd(5)} switchTop=${r.switch1?.t} fullTop=${r.fullBtn?.t} fullRight=${r.fullBtn?.r} rowRight=${r.row?.r}  ${ok ? '' : '<== FAIL'}`);
}
console.log(bad ? `\n${bad} failing widths` : '\nall widths pass');
process.stderr.write(res.stderr || '');
