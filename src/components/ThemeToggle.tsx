/**
 * ThemeToggle — compact, accessible theme + density control.
 *
 * - Theme: 3-way segmented control (light / dark / system) with `aria-pressed`
 *   reflecting the active mode.
 * - Density: a single toggle button flipping spacious <-> compact.
 *
 * Styled with theme tokens so it adapts across modes. Focus rings are provided
 * globally (see index.css :focus-visible).
 */

import { Sun, Moon, Monitor, Rows3, Rows2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeMode } from '../theme/themeMode';
import { cn } from '../lib/utils';

interface ModeOption {
  mode: ThemeMode;
  label: string;
  Icon: typeof Sun;
}

const MODE_OPTIONS: ReadonlyArray<ModeOption> = [
  { mode: 'light', label: 'Light theme', Icon: Sun },
  { mode: 'dark', label: 'Dark theme', Icon: Moon },
  { mode: 'system', label: 'System theme', Icon: Monitor },
];

export function ThemeToggle(): ReactElement {
  const { mode, density, setMode, setDensity } = useTheme();

  const nextDensity = density === 'spacious' ? 'compact' : 'spacious';
  const DensityIcon = density === 'spacious' ? Rows3 : Rows2;

  return (
    <div className="flex items-center gap-2">
      <div
        role="group"
        aria-label="Theme mode"
        className="flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5"
      >
        {MODE_OPTIONS.map(({ mode: optionMode, label, Icon }) => {
          const active = mode === optionMode;
          return (
            <button
              key={optionMode}
              type="button"
              aria-label={label}
              aria-pressed={active}
              title={label}
              onClick={() => setMode(optionMode)}
              className={cn(
                'btn-press inline-flex h-8 w-8 items-center justify-center rounded',
                'text-[var(--text-secondary)] transition-colors',
                'hover:text-[var(--text-primary)]',
                active &&
                  'bg-[var(--bg-card)] text-[var(--accent-mint)] shadow-[inset_0_0_0_1px_rgba(70,230,200,0.35)]',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-label={
          density === 'spacious'
            ? 'Switch to compact density'
            : 'Switch to spacious density'
        }
        aria-pressed={density === 'compact'}
        title={
          density === 'spacious'
            ? 'Switch to compact density'
            : 'Switch to spacious density'
        }
        onClick={() => setDensity(nextDensity)}
        className={cn(
          'btn-press inline-flex h-9 w-9 items-center justify-center rounded-md',
          'border border-[var(--border)] bg-[var(--bg-elevated)]',
          'text-[var(--text-secondary)] transition-colors',
          'hover:text-[var(--text-primary)]',
        )}
      >
        <DensityIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
