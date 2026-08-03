import { TOGGLE_FONT_SIZE } from './constants';

// The square-with-a-dot checkbox shared by every toggle that reads as a
// checkbox rather than a button: the word counter's two switches, the
// dialogs' "don't ask this again", and the confirmations toggle, which is
// the only caller passing a size of its own.
//
// The dot is a child box inset by whole pixels of border and padding,
// which is the one arrangement that stays centred. Painted edges snap to
// whole device pixels, so an em-sized inset leaves a fractional gap that
// snaps differently on each side, and at ~12px that gap is the whole
// margin: the dot sits visibly up and to the left. Whole-pixel insets snap
// identically on both sides, since round(x + n) is round(x) + n for
// integer n.
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
