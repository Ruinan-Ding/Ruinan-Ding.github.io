import { TOGGLE_FONT_SIZE } from './constants';

// The square-with-a-dot checkbox shared by every toggle that reads as a
// checkbox rather than a button.
//
// The dot is a child box inset by whole pixels of border and padding,
// which is the one arrangement that stays centred: painted edges snap to
// whole device pixels, and an em-sized inset leaves a fractional gap that
// snaps differently on each side. At ~12px that gap is the whole margin
// and the dot sits visibly up and to the left.
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
