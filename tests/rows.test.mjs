// Five asks, checked by geometry rather than by eye:
//  1 the two switches never stack
//  2 Copy/Clear/full-screen hold their line
//  3 the "turn both off" hint is one line or absent, never two
//  4 the ENTER/R/S hints are three lines, none of them wrapped
//  5 the L/W/C legend is three lines, none of them wrapped
import { spawnSync } from 'node:child_process';

const expr = `(() => {
  const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return {t:Math.round(b.top), b:Math.round(b.bottom), l:Math.round(b.left), r:Math.round(b.right), h:Math.round(b.height), w:Math.round(b.width)}; };
  // a block of text is wrapped if it's taller than one of its own line boxes
  const wrapped = (e) => { if (!e) return null; const lh = parseFloat(getComputedStyle(e).lineHeight); return e.getBoundingClientRect().height > lh * 1.5; };
  const findBtn = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.textContent.trim()));
  const words = findBtn(/^Alphanumeric words only$/), chars = findBtn(/^Alphanumeric chars only$/);
  if (!words) return { err: 'counter collapsed' };
  const hint = document.querySelector('.counter-hint');
  const full = document.querySelector('[aria-label="Full screen"], [aria-label="Exit full screen"]');
  const W = box(words), C = box(chars), F = box(full), H = box(hint);

  // timer hints: the three Press ... lines
  const hintRoot = [...document.querySelectorAll('div')].filter((d) => /^Press /.test(d.textContent.trim()) && d.children.length === 3).pop();
  const timerLines = hintRoot ? [...hintRoot.children].map((c) => ({ h: Math.round(c.getBoundingClientRect().height), wrapped: wrapped(c), text: c.textContent.slice(0, 24) })) : null;

  // legend: L / W / C
  const legend = [...document.querySelectorAll('div')].filter((d) => d.children.length === 3 && /^L:/.test(d.textContent.trim())).pop();
  const legendLines = legend ? [...legend.children].map((c) => ({ h: Math.round(c.getBoundingClientRect().height), wrapped: wrapped(c) })) : null;
  const legendBox = box(legend);

  const de = document.scrollingElement;
  return {
    switchesSideBySide: W && C ? Math.abs(W.t - C.t) <= 2 && C.l > W.r : null,
    switchFs: getComputedStyle(words).fontSize, stacked: W && C ? C.t > W.b - 2 : null, lwcH: (() => { const b=[...document.querySelectorAll('div')].find(d=>d.textContent.trim()==='L'&&d.className.includes('border-2')); return b ? Math.round(b.getBoundingClientRect().height) : null; })(), timerHintFs: (() => { const r=[...document.querySelectorAll('div')].filter(d=>/^Press /.test(d.textContent.trim())&&d.children.length===3).pop(); return r ? getComputedStyle(r).fontSize : null; })(),
    buttonsOnSwitchLine: F && W ? Math.abs(F.t - W.t) <= 6 : null,
    buttonsRightOfSwitches: F && W ? F.l > W.r : null,
    hintPresent: !!hint && getComputedStyle(hint).display !== 'none',
    hintWrapped: hint && getComputedStyle(hint).display !== 'none' ? wrapped(hint) : false,
    hintFits: H && hint && getComputedStyle(hint).display !== 'none' ? H.r <= (W ? box(words.closest('.flex.flex-col')).r + 1 : 1e9) : null,
    timerHintCount: timerLines ? timerLines.length : null,
    timerHintWrapped: timerLines ? timerLines.some((l) => l.wrapped) : null,
    legendCount: legendLines ? legendLines.length : null,
    legendWrapped: legendLines ? legendLines.some((l) => l.wrapped) : null,
    legendFs: legend ? getComputedStyle(legend).fontSize : null,
    legendFitsRow: legendBox && legend ? legendBox.r <= Math.round(legend.parentElement.getBoundingClientRect().right) + 1 : null,
    pageScrolls: de.scrollWidth > innerWidth,
  };
})()`;

const cfg = {
  url: 'http://localhost:5199/',
  port: Number(process.argv[2] ?? 9430),
  storage: {
    wordCounterCollapsed: 'false', wordCounterCollapsedAt: 'null', wordCounterFullscreen: 'false',
    wordCounterText: 'some text so Copy and Clear render',
    wordCounterAlnumWordsOnly: process.argv[3] ?? 'true', wordCounterAlnumCharsOnly: process.argv[3] ?? 'true',
    timerSidebarHidden: 'true', timerTimeFieldsHidden: 'true',
  },
  sizes: [[1920, 1000], [1100, 900], [768, 900], [640, 900], [560, 900], [520, 900], [500, 900], [480, 900], [460, 900], [440, 900], [420, 900], [360, 900]],
  expr,
  settle: 2500,
};

const res = spawnSync('node', ['cdp.mjs', JSON.stringify(cfg)], { cwd: import.meta.dirname, encoding: 'utf8', timeout: 600000 });
const rows = (res.stdout || '').split('\n').filter((l) => l.startsWith('{')).map(JSON.parse);
let bad = 0;
for (const r of rows) {
  if (r.err) { console.log(`${r.w}  ${r.err}`); continue; }
  const ok = (r.switchesSideBySide || r.stacked) && r.buttonsOnSwitchLine && r.buttonsRightOfSwitches
    && !r.hintWrapped && r.timerHintCount === 3 && !r.timerHintWrapped
    && r.legendCount === 3 && !r.legendWrapped && r.legendFitsRow && !r.pageScrolls;
  if (!ok) bad++;
  console.log(`${String(r.w).padStart(5)}  form=${r.switchesSideBySide?"side":"STACK"} switchFs=${String(r.switchFs).padEnd(8)} btnsSameLine=${String(r.buttonsOnSwitchLine).padEnd(5)} hint=${r.hintPresent ? 'shown' : 'hidden'} hintWrap=${String(r.hintWrapped).padEnd(5)} timerLines=${r.timerHintCount} timerWrap=${String(r.timerHintWrapped).padEnd(5)} legend=${r.legendCount}@${String(r.legendFs).padEnd(7)} legendWrap=${String(r.legendWrapped).padEnd(5)} lwcH=${String(r.lwcH).padEnd(3)} hintFs=${String(r.timerHintFs).padEnd(7)} scroll=${r.pageScrolls}  ${ok ? '' : '<== FAIL'}`);
}
console.log(bad ? `\n${bad} failing widths` : '\nall widths pass');
process.stderr.write(res.stderr || '');
