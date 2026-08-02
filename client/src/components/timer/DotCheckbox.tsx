import { TOGGLE_FONT_SIZE } from './constants';

// The square-with-a-dot checkbox shared by every toggle that reads as a
// checkbox rather than a button: the word counter's two alphanumeric
// switches, the dialogs' "don't ask this again", and the confirmations
// toggle in the header corner — that last one the only caller passing a
// size of its own, since it has to match the icons in the square buttons
// beside it rather than a label.
//
// The dot is a child box inset by whole pixels of border and padding,
// which is the one arrangement that actually stays centred. Painted box
// edges snap to whole device pixels, so an em-sized inset — or an
// em-positioned background, which was the previous attempt — leaves a
// fractional gap either side: at ~12px that gap is about 1px, the two
// sides snapped differently depending on where the box happened to land,
// and the dot sat visibly up and to the left. Whole-pixel insets snap
// identically on both sides (round(x + n) is round(x) + n for integer n),
// so both gaps come out at exactly border + padding, at any font size,
// position or zoom.
export default function DotCheckbox({ checked, fontSize = TOGGLE_FONT_SIZE }: { checked: boolean; fontSize?: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex border-2 flex-shrink-0"
      style={{ fontSize, width: '0.9em', height: '0.9em', borderColor: 'currentColor', padding: '1px' }}
    >
      <span className="flex-1" style={{ backgroundColor: checked ? 'currentColor' : 'transparent' }} />
    </span>
  );
}
