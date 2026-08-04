// The clamp() used by every control that should shrink before the digits
// do. min(vw, vh) means a short but wide window shrinks these on the vh
// term rather than holding steady on vw; the digits are sized on vw alone
// and never use this, which is what gives them priority.
export const shrinkClamp = (minRem: number, vw: number, vh: number, maxRem: number) =>
  `clamp(${minRem}rem, min(${vw}vw, ${vh}vh), ${maxRem}rem)`;

// The same idea against the container a control sits in rather than the
// viewport. min(vw, vh) can't do this job for something inside a column:
// on any landscape window the vh term is the smaller one and binds, so
// squeezing the width moves nothing until the window is narrower than it
// is tall. cqi is a percentage of the container's own inline size, so it
// responds to exactly the space the control has.
//
// Falls back to the viewport where there's no container ancestor, which is
// the sub-sm layout, and there the column is full width anyway.
export const fitClamp = (minRem: number, cqi: number, maxRem: number) =>
  `clamp(${minRem}rem, ${cqi}cqi, ${maxRem}rem)`;
