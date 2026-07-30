import { TOGGLE_FONT_SIZE } from './constants';

// The square-with-a-dot checkbox shared by every toggle that reads as a
// checkbox rather than a button: CONFIRMATIONS, the word counter's two
// alphanumeric switches, and the dialogs' "don't ask this again".
//
// Carries its own font size (TOGGLE_FONT_SIZE) rather than inheriting
// whatever text it sits beside, so all of them are the same box at the
// same window width — see that constant for why a 6% difference showed.
//
// The dot is a centered background, not a nested box, so it can't land
// off-centre. As a child element its edges get snapped to whole device
// pixels independently of the parent's, and at ~11px the leftover space
// either side is a fraction of a pixel, so those two snaps disagreed and
// pushed the dot up and to the left. A background is painted at subpixel
// precision from background-position, so the gaps stay equal at any zoom.
export default function DotCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block border-2 flex-shrink-0"
      style={{
        fontSize: TOGGLE_FONT_SIZE,
        width: '0.9em',
        height: '0.9em',
        borderColor: 'currentColor',
        backgroundImage: checked ? 'linear-gradient(currentColor, currentColor)' : 'none',
        backgroundSize: '0.45em 0.45em',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
}
