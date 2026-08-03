// The clamp() used by every control that should shrink before the digits
// do. min(vw, vh) means a short but wide window shrinks these on the vh
// term rather than holding steady on vw; the digits are sized on vw alone
// and never use this, which is what gives them priority.
export const shrinkClamp = (minRem: number, vw: number, vh: number, maxRem: number) =>
  `clamp(${minRem}rem, min(${vw}vw, ${vh}vh), ${maxRem}rem)`;
