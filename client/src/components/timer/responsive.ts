// The clamp() used by every control that should shrink before the digits
// do. min(vw, vh) means a short but wide window shrinks these on the vh
// term rather than holding steady on vw; the digits are sized on vw alone
// and never use this, which is what gives them priority.
//
// Emits dvh, not vh: bare vh is pinned to the browser's large/static
// viewport and ignores a mobile address bar, so on a phone with it showing
// every control here would hold the size it'd have with more room than it
// actually has. dvh tracks the real, current viewport, same as the app's
// root h-dvh container, so this shrinks in step with it instead of only
// the container doing so.
export const shrinkClamp = (minRem: number, vw: number, vh: number, maxRem: number) =>
  `clamp(${minRem}rem, min(${vw}vw, ${vh}dvh), ${maxRem}rem)`;

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
