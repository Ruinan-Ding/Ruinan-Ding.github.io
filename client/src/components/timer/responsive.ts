// Builds the clamp() used by every control that must shrink first when the
// window scales down, so the timer digits (sized on vw alone, never using
// this helper) always keep priority: min(vw, vh) means a short-but-wide
// window shrinks these on the vh term instead of holding steady on vw.
export const shrinkClamp = (minRem: number, vw: number, vh: number, maxRem: number) =>
  `clamp(${minRem}rem, min(${vw}vw, ${vh}vh), ${maxRem}rem)`;
