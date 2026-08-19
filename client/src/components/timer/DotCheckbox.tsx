import { TOGGLE_FONT_SIZE } from './constants';

// The square-with-a-dot checkbox shared by every toggle that reads as a
// checkbox rather than a button.
//
// The dot is a child box inset by whole pixels of border and padding,
// which is the one arrangement that stays centred: painted edges snap to
// whole device pixels, and an em-sized inset leaves a fractional gap that
// snaps differently on each side. At ~12px that gap is the whole margin
// and the dot sits visibly up and to the left.
// 'half' is the third state the confirm toggle needs: the same box filled
// to the diagonal rather than edge to edge, so full, half and empty read
// as one dial with three positions instead of three unrelated icons. The
// clip is on the inner box, which is already the inset one, so the
// triangle meets the border the same way the full fill does.
export default function DotCheckbox({ checked, fontSize = TOGGLE_FONT_SIZE }: { checked: boolean | 'half'; fontSize?: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex border-2 flex-shrink-0"
      style={{ fontSize, width: '0.9em', height: '0.9em', borderColor: 'currentColor', padding: '1px' }}
    >
      <span
        className="flex-1"
        style={{
          backgroundColor: checked === false ? 'transparent' : 'currentColor',
          clipPath: checked === 'half' ? 'polygon(0% 0%, 0% 100%, 100% 100%)' : undefined,
        }}
      />
    </span>
  );
}
