import type { CSSProperties, ReactNode } from 'react';
import { HEADER_BUTTON_SIZE } from './constants';

interface HeaderToggleButtonProps {
  onClick: () => void;
  icon: ReactNode;
  label: string;
  className?: string;
  style?: CSSProperties;
}

// Shared chrome for the boxed square hide/show toggles (sidebar,
// time fields, word counter) so a look tweak only has to happen once
export default function HeaderToggleButton({ onClick, icon, label, className = '', style }: HeaderToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center border-3 border-white text-white transition-all duration-200 hover:opacity-80 flex-shrink-0 ${className}`}
      style={{ ...HEADER_BUTTON_SIZE, backgroundColor: 'var(--app-surface)', ...style }}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}
