// Every size on a control button, and the two style objects built from
// them. Constants rather than state, so a running countdown isn't
// rebuilding the same strings on every tick.
import { HEADER_BUTTON_SIZE } from './constants';
import { boxCap, boxClamp, fitClamp, shrinkClamp } from './responsive';

// The key inside "Press TAB to" is the only part worth finding at a
// glance; the rest is grammar. Its line height is held at the prose's own
// so the bigger glyphs don't make the button taller.
export const KEY_SCALE = 1.2;
export const KEY_LINE_HEIGHT = 1 / KEY_SCALE;

// How close the hint may come to both sides of its button before
// isControlHintClipped drops it. Shared with the size below, which is
// solved to stay clear of it: as two numbers they drift, and the
// difference stands as empty margin down every button.
export const HINT_CLEARANCE = 10;
// What that line comes to, in prose ems. IBM Plex Mono advances exactly
// 0.6em a character; "Press TAB to" is nine of prose and three of key,
// and the 0.3 keeps it off the edge of its own hide rule.
export const HINT_EMS = 9 * 0.6 + 3 * 0.6 * KEY_SCALE + 0.3;

// The button is a fixed box with three rows: the key at the top edge, the
// label in the middle, what the key acts on at the bottom. The height is
// spelled out rather than left to the contents, which is the point — the
// hint comes and goes, on typing, on leaving the window, on running out
// of room, and a box that measured its contents resized the whole row
// every time. The box holds still and the label takes the freed space.
export const CONTROL_LABEL = boxClamp(0.5, 2.05, 5.1, 1.4);
export const CONTROL_PAD_X = fitClamp(0.25, 1.4, 1.0);
export const CONTROL_WIDTH = fitClamp(4, 16, 8.5);
// Solved against what the button will show: its box less 8px of border
// and the clearance that hides the hint, over HINT_EMS. Both come off
// KEY_SCALE rather than being written down beside it, since a larger key
// changes what the line measures and what may cap it.
//
// Capped at 1/KEY_SCALE of the label so the key can't outgrow the word it
// annotates. That cap does two other jobs: the label carries a cqh term
// and the width doesn't, so it keeps the box from growing on a short
// window, and it keeps the key's ink off the border above it.
//
// The floor is above what the narrow end can fit, so down there the line
// stops fitting and goes rather than shrinking to nothing.
export const CONTROL_HINT = `max(0.62rem, min(calc((${CONTROL_WIDTH} - ${8 + HINT_CLEARANCE}px) / ${HINT_EMS}), calc(${CONTROL_LABEL} * ${(1 / KEY_SCALE).toFixed(3)})))`;
// The whole distance from the key to the top of the box, with the rows
// spread edge to edge. A glyph's ink runs past the line box that holds
// it, so this has to cover the key's ascent as well as the gap.
export const CONTROL_PAD_Y = boxClamp(0.22, 0.9, 2.6, 0.45);
export const CONTROL_HEIGHT = `calc(${CONTROL_LABEL} * 1.35 + ${CONTROL_HINT} * 2.3 + ${CONTROL_PAD_Y} * 2)`;
// The label with the hint gone, filling the box it is left alone in.
//
// Solved against RESUME rather than whichever word is showing, since all
// five have to be the same size: six characters is 3.6em, and 3.75 leaves
// the four percent that keeps it off its own border. The 8px is the
// border, which box-sizing puts inside the width.
//
// The side padding is not taken off, and the label pulls out over it to
// match (see the negative margin where it's drawn). That padding holds
// the hint off the borders, and with no hint there is nothing to hold.
export const CONTROL_FILL = `min(calc((${CONTROL_WIDTH} - 8px) / 3.75), calc((${CONTROL_HEIGHT} - 2 * ${CONTROL_PAD_Y} - 8px) / 1.15))`;

// Everything the countdown has to leave room for below itself: the
// control row, the status word, and the column's two gaps. Written as the
// controls' own height rather than estimated, so it can't drift from the
// thing it is made of.
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
  // rather than removed they stay put and only the label changes, which
  // is what keeps the row from twitching.
  justifyContent: 'space-between',
  fontSize: CONTROL_LABEL,
  borderColor: color,
  color,
  backgroundColor: 'var(--app-surface)',
  // width, not minWidth: a minimum lets RESUME outgrow the four beside
  // it and the row shifts as START becomes it. Solved against the widest
  // thing on the button, which is the hint rather than any label.
  width: CONTROL_WIDTH,
});

// The same buttons scaled to the word counter's fullscreen header, which
// covers the real ones. Capped against that row, which holds one line at
// any width, so what doesn't fit comes off the size rather than the line.
export const compactControlButtonStyle = (color: string) => ({
  fontFamily: "'IBM Plex Mono', monospace",
  height: boxCap(HEADER_BUTTON_SIZE.height, 6.8),
  padding: `0 ${boxCap(shrinkClamp(0.5, 1, 1.1, 0.75), 1.4)}`,
  fontSize: boxCap(shrinkClamp(0.6, 1.3, 1.4, 0.9), 1.95),
  borderColor: color,
  color,
  backgroundColor: 'var(--app-surface)',
});
