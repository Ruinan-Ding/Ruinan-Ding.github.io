// Every size on a control button, and the two style objects built from
// them. Constants, not state: they were declared in Timer's render body,
// where a countdown re-runs them ten times a second to arrive at the same
// strings. Here they are read once, and the reasoning behind each figure
// sits with the figure rather than in the middle of a component.
import { HEADER_BUTTON_SIZE } from './constants';
import { boxCap, boxClamp, fitClamp, shrinkClamp } from './responsive';

// The key inside "Press TAB to", against the words either side of it. The
// key is the only part worth finding at a glance; the rest is grammar.
// 1.2 of the prose, on a line whose height is held at the prose's own so
// the bigger glyphs don't make the button taller.
export const KEY_SCALE = 1.2;
export const KEY_LINE_HEIGHT = 1 / KEY_SCALE;

// How close "Press TAB to" may come to both sides of its button before the
// hint is dropped. One number, because the size is solved to stay clear of
// it: two would drift, and when they did the difference stood as empty
// margin down every button.
export const HINT_CLEARANCE = 10;
// What that line comes to, in prose ems. Twelve characters of this
// monospace at 0.6em each, three of them the key at KEY_SCALE, and a
// little over so the line isn't sitting exactly on its own hide rule.
export const HINT_EMS = 9 * 0.6 + 3 * 0.6 * KEY_SCALE + 0.3;

// The control button is a fixed box with three rows in it: the key at
// the top edge, the label in the middle, what the key acts on at the
// bottom edge. Every part of that comes off one label size.
//
// The height is spelled out rather than left to the contents, and that
// is the point: the hint comes and goes — on typing, on leaving the
// window, on running out of room — and a box that measured its contents
// resized the whole row every time it did. So the box holds still and
// what changes inside it is the label, which takes the freed space.
// The floors are low on purpose. At 0.7rem and 6.5rem these bottomed out
// around 900px and the buttons then held their size while everything
// beside them kept shrinking, which made them the largest thing on a
// narrow window.
export const CONTROL_LABEL = boxClamp(0.5, 2.05, 5.1, 1.4);
export const CONTROL_PAD_X = fitClamp(0.25, 1.4, 1.0);
export const CONTROL_WIDTH = fitClamp(4, 16, 8.5);
// The hint against the width it actually has, rather than at a fixed
// fraction of the label.
//
// The width is a clamp that tops out, and the label is not, so above
// that cap the button stopped growing while the note inside it went on
// shrinking with the window's height: at 1440x900 "Press TAB to" was
// 84px of a 128px box, and on a short window 71px of 127px. Half the
// line's own width in space it wasn't allowed to use, at a size that is
// hard to read, which is the whole reason it is there.
//
// Solved against what the button will show: the box less its 8px of
// border and the clearance isControlHintClipped drops the hint at,
// divided by HINT_EMS. Both figures come off KEY_SCALE rather than
// being written down beside it — a key drawn larger changes what the
// line measures and what may cap it, and a constant nothing reads is a
// trap for whoever changes it.
//
// Capped by the label as well, at 1/KEY_SCALE: the key inside
// the line is drawn larger again, and this is what stops that key
// outgrowing the word it is a note on. It does two other jobs at the
// same time — it keeps the box from growing on a short window, since
// the label carries a cqh term and the width doesn't, and it keeps the
// key's ink off the border above it, which on a 520px-tall window it
// was touching.
//
// The floor is a real floor, above what the narrow end can fit, so down
// there the line stops fitting and goes rather than shrinking to
// nothing — the label takes the whole box then.
export const CONTROL_HINT = `max(0.62rem, min(calc((${CONTROL_WIDTH} - ${8 + HINT_CLEARANCE}px) / ${HINT_EMS}), calc(${CONTROL_LABEL} * ${(1 / KEY_SCALE).toFixed(3)})))`;
// The whole distance from the key to the top of the box, with the rows
// spread edge to edge. Raised from 0.12/0.6/1.5/0.32 once the key was
// drawn larger than the words beside it: a glyph's ink runs past the
// line box that holds it, and at the old padding the top of a TAB was
// touching the border it sits under.
export const CONTROL_PAD_Y = boxClamp(0.22, 0.9, 2.6, 0.45);
// 1.35 and 2.3, where it was 2.1 and 2.6: the three rows were spread
// across a box drawn taller than they needed and read as three separate
// things rather than one instruction with the button in the middle of it.
export const CONTROL_HEIGHT = `calc(${CONTROL_LABEL} * 1.35 + ${CONTROL_HINT} * 2.3 + ${CONTROL_PAD_Y} * 2)`;
// The label with the hint gone, filling the box it is left alone in.
//
// Solved against RESUME rather than against whichever word is showing,
// because all five have to be the same size: this monospace advances
// exactly 0.6em a character, so six of them is 3.6em, and 3.75 leaves
// the four percent that keeps it off its own border. 8px is the border
// either side, which box-sizing puts inside the width.
//
// The side padding is not taken off, and the label pulls out over it to
// match — see the negative margin where it's drawn. That padding is
// there to hold "Press TAB to" off the borders, and with the hint gone
// there is nothing in the box to hold off anything: at 1024 it was 16px
// of the 94px button reserved for a row that isn't drawn, and the word
// came out a fifth smaller than the space it had.
//
// Worth having as a figure rather than an em multiple: 1.35em was over
// the width at 1600, where RESUME wanted 124px of a 115px box. Only
// START, RESET and STOP are ever on screen at once, so it took a
// running timer to see it.
export const CONTROL_FILL = `min(calc((${CONTROL_WIDTH} - 8px) / 3.75), calc((${CONTROL_HEIGHT} - 2 * ${CONTROL_PAD_Y} - 8px) / 1.15))`;

// Everything the countdown has to leave room for below itself: the
// control row, the status word under it, and the column's two gaps.
//
// Written as the controls' own height rather than estimated, which is
// what the reserve used to be: max(7.5rem, 1.5rem + 13dvh). Measured
// against what actually sits there, that guess was 42 to 56px too big
// at every size tried, and on a short window it cost the countdown a
// quarter of the column for space nothing then used — the readout came
// out at 46px with 47px buttons beside it. An expression can't drift
// from the thing it is made of, which is the point of boxClamp sizing
// the controls on both axes in the first place.
export const STATUS_FONT_SIZE = shrinkClamp(0.6, 1.9, 2.5, 1.5);
export const BELOW_DIGITS = `calc(${CONTROL_HEIGHT} + ${STATUS_FONT_SIZE} * 1.5 + 0.5rem)`;
export const controlButtonStyle = (color: string) => ({
  fontFamily: "'IBM Plex Mono', monospace",
  padding: `${CONTROL_PAD_Y} ${CONTROL_PAD_X}`,
  height: CONTROL_HEIGHT,
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  // The three rows to the two edges and the middle. With the hint hidden
  // rather than removed they stay where they are and only the label
  // changes, which is what keeps the row from twitching.
  justifyContent: 'space-between',
  fontSize: CONTROL_LABEL,
  borderColor: color,
  color,
  // A surface-coloured chip keeps the borders readable on the coloured
  // window behind them.
  backgroundColor: 'var(--app-surface)',
  // width, not minWidth: with a minimum, RESUME, the one six-letter
  // label, outgrew it and came out wider than the four beside it, and
  // the row shifted as START became it. A fixed width makes every button
  // the same box whatever it says.
  //
  // Solved against the widest thing on the button, which is no longer
  // RESUME but the hint above it, and the widest of those is "Press TAB
  // to" at 12 characters of this monospace, plus both paddings.
  width: CONTROL_WIDTH,
});
// The same buttons scaled to a single header row, for the word counter's
// fullscreen view, which covers the real ones. Every size is capped
// against that row, it holds one line at any width, so what doesn't fit
// has to come off the size rather than off the line.
export const compactControlButtonStyle = (color: string) => ({
  fontFamily: "'IBM Plex Mono', monospace",
  height: boxCap(HEADER_BUTTON_SIZE.height, 6.8),
  padding: `0 ${boxCap(shrinkClamp(0.5, 1, 1.1, 0.75), 1.4)}`,
  fontSize: boxCap(shrinkClamp(0.6, 1.3, 1.4, 0.9), 1.95),
  borderColor: color,
  color,
  backgroundColor: 'var(--app-surface)',
});
