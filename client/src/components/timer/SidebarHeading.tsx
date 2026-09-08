import { useRef } from 'react';
import { countColor, SIDEBAR_COUNT_FONT_SIZE, SIDEBAR_COUNT_FONT_SIZE_SOLO, SIDEBAR_HEADING_FONT_SIZE } from './constants';
import { shrinkClamp } from './responsive';
import { gapBetween, useTightFit } from './useTightFit';

type SidebarHeadingProps = {
  label: string;
  count: number;
  max: number;
  warn: number;
  countTitle: string;
  clearTitle?: string;
  onClear: () => void;
};

// The rule both sidebar lists wear: the name, the count out of its
// ceiling, and Clear once there is something to clear.
//
// One component rather than a copy per panel. The two were copies, and
// copies drift: they were once on different font clamps and HISTORY
// rendered smaller than PRESETS at most widths, which is what the one
// SIDEBAR_HEADING_FONT_SIZE in constants was for.
//
// One line, always: the heading and its count stay level with Clear at
// every width. A gap so they can't touch, and the count is what gives when
// they can't all fit, it's an annotation, and the sidebar is too narrow for
// "HISTORY 1000/1000 Clear" below about 900px however small the type gets.
// See sidebar-count in index.css.
function SidebarHeading({ label, count, max, warn, countTitle, clearTitle, onClear }: SidebarHeadingProps) {
  const headingRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);
  // The denominator goes when the count reaches Clear. Measured rather
  // than named as a width, since the count's own text is part of the sum.
  const isCountTight = useTightFit(gapBetween(countRef, clearRef), headingRef, 6, count);
  // Once, not once per style property: the colour and the opacity beside it
  // are the same decision and have to stay the same answer.
  const warnColor = countColor(count, warn, max);

  return (
    <div
      ref={headingRef}
      className="flex justify-between items-center gap-x-2 border-b-2 border-white flex-shrink-0"
      style={{ marginBottom: shrinkClamp(0.5, 0.9, 1, 1), paddingBottom: shrinkClamp(0.25, 0.45, 0.5, 0.5), containerType: 'inline-size', containerName: 'sidebar-heading' }}
    >
      <span className="flex items-baseline gap-1.5 min-w-0 overflow-hidden">
        <h2 className="text-white font-bold flex-shrink-0" style={{ fontSize: SIDEBAR_HEADING_FONT_SIZE }}>{label}</h2>
        <span
          ref={countRef}
          className="sidebar-count text-white font-bold whitespace-nowrap"
          style={{
            fontSize: isCountTight ? SIDEBAR_COUNT_FONT_SIZE_SOLO : SIDEBAR_COUNT_FONT_SIZE,
            color: warnColor,
            opacity: warnColor ? 1 : 0.6,
          }}
          title={count >= max ? countTitle : undefined}
        >
          {count}{!isCountTight && <span>/{max}</span>}
        </span>
      </span>
      {count > 0 && (
        <button
          ref={clearRef}
          onClick={onClear}
          title={clearTitle}
          className="text-white border border-white hover:bg-white hover:text-black transition-colors flex-shrink-0"
          style={{ fontSize: shrinkClamp(0.55, 0.8, 0.85, 0.7), padding: shrinkClamp(0.25, 0.4, 0.45, 0.375) }}
        >
          Clear
        </button>
      )}
    </div>
  );
}

export default SidebarHeading;
