// For every control that should shrink before the digits do. min(vw, vh)
// so a short but wide window shrinks these on the vh term; the digits are
// sized on vw alone and never use this, which is what gives them priority.
//
// dvh rather than vh: bare vh is pinned to the browser's large viewport
// and ignores a mobile address bar, so with one showing these would hold
// the size they'd have with more room than there is. dvh tracks the
// current viewport, the same one the app's root h-dvh container does.
export const shrinkClamp = (minRem: number, vw: number, vh: number, maxRem: number) =>
  `clamp(${minRem}rem, min(${vw}vw, ${vh}dvh), ${maxRem}rem)`;

// The same idea against the container a control sits in rather than the
// viewport. min(vw, vh) can't do this job inside a column: on any
// landscape window the vh term binds, so squeezing the width moves nothing
// until the window is narrower than it is tall. cqi is a percentage of the
// container's own inline size, so it answers to the space the control has.
export const fitClamp = (minRem: number, cqi: number, maxRem: number) =>
  `clamp(${minRem}rem, ${cqi}cqi, ${maxRem}rem)`;

// A size that keeps whatever it already is until the container runs short,
// then takes a fixed share of the room there actually is.
//
// This is what lets a row hold one line at every width. Every clamp in the
// app bottoms out on a rem floor, so past that point the window keeps
// narrowing while the contents don't, and a row that can't wrap runs off
// the end. A cqi cap has no floor to reach: capped, each piece is a
// constant fraction of the container, so a row that fits at one width fits
// at all of them. Above the cap nothing changes at all.
export const boxCap = (value: string, cqi: number) => `min(${value}, ${cqi}cqi)`;

// Both of the container's axes, for anything the digits' height reserve
// has to predict. On cqi alone a wide but short window grows these off the
// column's width while the reserve estimates them off the viewport's
// height, and the two disagree by enough to push the column past the row.
// cqh is the same height the reserve is spending.
export const boxClamp = (minRem: number, cqi: number, cqh: number, maxRem: number) =>
  `clamp(${minRem}rem, min(${cqi}cqi, ${cqh}cqh), ${maxRem}rem)`;
