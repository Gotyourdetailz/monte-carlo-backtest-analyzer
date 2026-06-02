/**
 * src/pages/marketing/components.tsx — small, typed presentational pieces for
 * the public marketing landing. Styled entirely with shared design tokens so
 * they adapt to light/dark automatically.
 */
import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CircleHelp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { EARLY_ACCESS_URL, isEarlyAccessEnabled, trackEvent } from '../../config';
import { type Faq } from './content';

/** The primary call-to-action: launch the analyzer at /app.
 *  Solid ion-mint with dark navy label — high contrast, no white-on-bright. */
export function PrimaryCta({ label }: { label: string }): ReactElement {
  return (
    <Link
      to="/app"
      className="btn-press inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[var(--accent-mint)] px-5 py-3 text-sm font-semibold text-[var(--bg-primary)] shadow-sm transition-colors hover:bg-[var(--accent-mint-bright)]"
    >
      {label}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

/**
 * The secondary "Reserve early access" CTA. Renders only when a valid
 * early-access URL is configured; opens in a new tab and fires telemetry.
 */
export function ReserveCta({ className }: { className?: string }): ReactElement | null {
  if (!isEarlyAccessEnabled) return null;
  return (
    <a
      href={EARLY_ACCESS_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackEvent('reserve_click', { source: 'marketing' })}
      className={cn(
        'btn-press inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-5 py-3 text-sm font-semibold',
        'border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent-blue)]',
        className,
      )}
    >
      Reserve early access
      <ArrowRight className="h-4 w-4" />
    </a>
  );
}

/** A single FAQ entry as an accessible native disclosure. */
export function FaqItem({ q, a }: Faq): ReactElement {
  return (
    <details className="glass-card group p-5 text-left">
      <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-[var(--text-primary)] marker:content-['']">
        {q}
        <CircleHelp className="h-4 w-4 shrink-0 text-[var(--accent-blue)]" />
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{a}</p>
    </details>
  );
}

/** Consistent section heading with eyebrow + title. */
export function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow?: string;
  title: string;
}): ReactElement {
  return (
    <div className="mb-10 text-center">
      {eyebrow ? <div className="t-eyebrow mb-3 text-[var(--accent-mint)]">{eyebrow}</div> : null}
      <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}
