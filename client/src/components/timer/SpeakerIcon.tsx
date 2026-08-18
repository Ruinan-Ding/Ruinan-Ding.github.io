import { shrinkClamp } from './responsive';

// Sound waves grow in as the volume rises. Two ways to be silent, and they
// don't draw the same, because they aren't the same thing and the fix for
// one isn't the fix for the other: muted is a switch, and clicking the
// button undoes it; 0% is a level, and only the slider moves it. Muted
// gets a red slash straight through the whole icon, a "no" sign, readable
// at a glance and at the smallest size this shrinks to. A silent slider
// keeps the small grey X beside the speaker: same speaker, no waves left.
export default function SpeakerIcon({ volume, muted, color }: { volume: number; muted: boolean; color: string }) {
  const wave = (threshold: number) => Math.max(0, Math.min(1, (volume - threshold) / 0.25));
  const silentSlider = !muted && volume === 0;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Larger than the icons beside it for the same drawn size: the
      // speaker and its waves reach about three quarters across this
      // viewBox where a lucide glyph reaches all of it, so at a matched
      // box this drew noticeably smaller. The overhang is empty viewBox,
      // not ink, so it sits inside the button either way.
      style={{ width: shrinkClamp(1.9, 4.7, 4.7, 3.3), height: shrinkClamp(1.9, 4.7, 4.7, 3.3) }}
    >
      <polygon points="9 5 4 9 1 9 1 15 4 15 9 19 9 5" fill={color} />
      {!muted && (
        <>
          <path d="M12.5 9.5a3.5 3.5 0 0 1 0 5" opacity={wave(0)} />
          <path d="M15 7a7 7 0 0 1 0 10" opacity={wave(0.33)} />
          <path d="M17.5 4.5a10.5 10.5 0 0 1 0 15" opacity={wave(0.66)} />
        </>
      )}
      {silentSlider && (
        <>
          <line x1="14" y1="9" x2="20" y2="15" />
          <line x1="20" y1="9" x2="14" y2="15" />
        </>
      )}
      {/* Drawn last and in its own red, so it reads over the speaker
          rather than beside it, and stays the one red thing in the corner
          whatever colour the button itself is wearing. */}
      {muted && <line x1="3" y1="3" x2="21" y2="21" stroke="#ef4444" strokeWidth={2.5} />}
    </svg>
  );
}
