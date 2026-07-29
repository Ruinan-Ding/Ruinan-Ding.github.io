// The square-with-a-dot checkbox shared by every toggle that reads as a
// checkbox rather than a button: CONFIRMATIONS, the word counter's two
// alphanumeric switches, and the dialogs' "don't ask this again". Sized
// in em so it tracks whatever text it sits beside.
//
// The dot is a centered background, not a nested box, so it can't land
// off-centre. As a child element its edges get snapped to whole device
// pixels independently of the parent's — at 0.9em (~11px) the leftover
// space either side is a fraction of a pixel, and those two snaps
// disagreed, pushing the dot visibly up and to the left. A background
// is painted at subpixel precision from background-position, so the
// gaps stay equal at any font size or zoom.
export default function DotCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block border-2 flex-shrink-0"
      style={{
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
