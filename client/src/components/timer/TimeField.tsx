import { ChevronDown, ChevronUp } from 'lucide-react';
import { memo } from 'react';

interface TimeFieldProps {
  label: string;
  value: number;
  max: number;
  /** Called with the clamped new value whenever the user types or clicks a chevron. */
  onRequestChange: (value: number) => void;
}

const chevronButtonClass =
  'border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 disabled:opacity-50 disabled:cursor-not-allowed';
const chevronButtonStyle = { padding: 'clamp(0.25rem, 0.5vw, 0.375rem)' };

/** A labelled number input with increment/decrement chevrons, clamped to [0, max]. */
function TimeField({ label, value, max, onRequestChange }: TimeFieldProps) {
  const clamp = (next: number) => Math.max(0, Math.min(max, next));

  return (
    <div className="flex items-center gap-1 sm:gap-2 md:gap-4 min-w-0 flex-wrap justify-between">
      <label
        className="text-white font-bold whitespace-nowrap"
        style={{ fontSize: 'clamp(0.8rem, 1.6vw, 1.1rem)', fontFamily: "'IBM Plex Mono', monospace", width: 'clamp(2.2rem, 5.5vw, 3.5rem)' }}
      >
        {label}:
      </label>
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <input
          type="number"
          value={value}
          onChange={(e) => onRequestChange(clamp(parseInt(e.target.value) || 0))}
          className="bg-black border-4 border-white text-white font-bold text-center outline-none flex-shrink-0"
          style={{ fontFamily: "'IBM Plex Mono', monospace", width: 'clamp(2.5rem, 6vw, 4rem)', fontSize: 'clamp(1rem, 1.8vw, 1.5rem)', padding: 'clamp(0.25rem, 0.5vw, 0.375rem)' }}
        />
        <div className="flex flex-col gap-1">
          <button
            onClick={() => onRequestChange(clamp(value + 1))}
            disabled={value >= max}
            className={chevronButtonClass}
            style={chevronButtonStyle}
          >
            <ChevronUp size={20} />
          </button>
          <button
            onClick={() => onRequestChange(clamp(value - 1))}
            disabled={value <= 0}
            className={chevronButtonClass}
            style={chevronButtonStyle}
          >
            <ChevronDown size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(TimeField);
