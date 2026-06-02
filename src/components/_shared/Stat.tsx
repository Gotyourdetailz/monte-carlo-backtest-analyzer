import type { ReactElement } from 'react';
import { cn } from '../../lib/utils';

export interface StatProps {
  label: string;
  value: string | number;
  hint?: string;
  /** When true, render the value in the negative-accent color (loss / breach indicator). */
  negative?: boolean;
  /**
   * Color to use when `negative` is true.
   * - `'red'` (default): loss / breach — the dominant convention.
   * - `'amber'`: calibration warning that is not a loss (e.g. WalkForward OOS drift).
   */
  negativeTone?: 'red' | 'amber';
  /** Extra Tailwind classes merged onto the wrapper via `cn(...)`; later classes win. */
  className?: string;
}

/**
 * Compact metric tile shared across panels (Attribution, EVT, MultiFactor, WalkForward,
 * TimestampAnalytics, ...). Replaces six near-identical local definitions.
 *
 * Visual convention: `negative` ⇒ red value (loss / breach). Pass `negativeTone="amber"`
 * for panels where the negative flag means "warning / drift" rather than a loss.
 */
export function Stat({
  label,
  value,
  hint,
  negative,
  negativeTone = 'red',
  className,
}: StatProps): ReactElement {
  return (
    <div className={cn(className)}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-1">
        {label}
      </div>
      <div
        className={cn(
          'metric-value text-base',
          negative
            ? negativeTone === 'amber'
              ? 'text-[var(--accent-amber)]'
              : 'text-[var(--accent-red)]'
            : 'text-[var(--text-primary)]',
        )}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[10px] text-[var(--text-secondary)] opacity-60 mt-0.5">{hint}</div>
      )}
    </div>
  );
}
