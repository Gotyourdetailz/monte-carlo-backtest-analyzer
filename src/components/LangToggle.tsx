/**
 * LangToggle — two-way segmented control flipping result labels between
 * plain English ("Odds of blowing up") and pro terms ("Prob. of Ruin").
 * Sits beside ThemeToggle in the analyzer header. Text labels rather than
 * icons: the whole point is legibility for non-quants.
 */
import type { ReactElement } from 'react';
import { useLangMode } from '../lang/LanguageProvider';
import type { LangMode } from '../lang/terms';
import { cn } from '../lib/utils';

const OPTIONS: ReadonlyArray<{ mode: LangMode; label: string; title: string }> = [
  { mode: 'plain', label: 'Plain', title: 'Plain English labels' },
  { mode: 'pro', label: 'Pro', title: 'Institutional / quant terms' },
];

export function LangToggle(): ReactElement {
  const { mode, setMode } = useLangMode();
  return (
    <div
      role="group"
      aria-label="Terminology mode"
      className="flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = mode === opt.mode;
        return (
          <button
            key={opt.mode}
            type="button"
            aria-pressed={active}
            title={opt.title}
            onClick={() => setMode(opt.mode)}
            className={cn(
              'btn-press inline-flex h-8 items-center justify-center rounded px-2.5 text-xs font-semibold',
              'text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]',
              active &&
                'bg-[var(--bg-card)] text-[var(--accent-mint)] shadow-[inset_0_0_0_1px_rgba(70,230,200,0.35)]',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
