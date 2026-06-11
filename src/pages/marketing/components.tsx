/**
 * src/pages/marketing/components.tsx — small, typed presentational pieces for
 * the public marketing landing. Styled entirely with shared design tokens so
 * they adapt to light/dark automatically.
 */
import type { PointerEvent, ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CircleHelp, Play } from 'lucide-react';
import { cn } from '../../lib/utils';
import { EARLY_ACCESS_URL, isEarlyAccessEnabled, trackEvent } from '../../config';
import { MARQUEE_TERMS, STATS, type Faq } from './content';

/**
 * Cursor-spotlight feed for `.spotlight-card` surfaces: writes the pointer
 * position into CSS vars consumed by the card's ::after radial highlight.
 * Pure presentational micro-interaction — hover-only, so touch devices and
 * reduced-motion users simply never see it.
 */
export function trackSpotlight(e: PointerEvent<HTMLElement>): void {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--spot-x', `${e.clientX - r.left}px`);
  el.style.setProperty('--spot-y', `${e.clientY - r.top}px`);
}

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

/** Consistent section heading: numbered mono eyebrow + editorial title. */
export function SectionHeading({
  eyebrow,
  title,
  align = 'center',
}: {
  eyebrow?: string;
  title: string;
  align?: 'left' | 'center';
}): ReactElement {
  return (
    <div className={cn('mb-12', align === 'center' ? 'text-center' : 'text-left')}>
      {eyebrow ? (
        <div
          className={cn(
            't-eyebrow mb-4 flex items-center gap-3 text-[var(--accent-mint)]',
            align === 'center' && 'justify-center',
          )}
        >
          <span aria-hidden="true" className="h-px w-8 bg-[var(--accent-mint)] opacity-50" />
          {eyebrow}
          {align === 'center' ? (
            <span aria-hidden="true" className="h-px w-8 bg-[var(--accent-mint)] opacity-50" />
          ) : null}
        </div>
      ) : null}
      <h2 className="font-display text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
        {title}
      </h2>
    </div>
  );
}

/** Demo deep-link: launches the analyzer pre-armed with the sample tape. */
export function DemoCta({ className }: { className?: string }): ReactElement {
  return (
    <Link
      to="/app?demo=1"
      onClick={() => trackEvent('demo_tape_click', { source: 'marketing' })}
      className={cn(
        'btn-press inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-5 py-3 text-sm font-semibold',
        'border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent-mint)]',
        className,
      )}
    >
      <Play className="h-4 w-4 text-[var(--accent-mint)]" />
      Watch it run a sample tape
    </Link>
  );
}

/** Honest numbers strip — engine properties, never usage/vanity stats. */
export function StatsStrip(): ReactElement {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
      {STATS.map((s) => (
        <div key={s.label} className="text-center lg:text-left">
          <dt className="sr-only">{s.label}</dt>
          <dd className="metric-value text-3xl font-semibold text-[var(--text-primary)] sm:text-4xl">
            {s.value}
          </dd>
          <dd className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{s.label}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Slow methodology ticker — duplicated track for a seamless CSS loop. */
export function MethodologyMarquee(): ReactElement {
  return (
    <div className="marquee py-6" aria-hidden="true">
      <div className="marquee-track">
        {[0, 1].map((copy) => (
          <span key={copy} className="flex items-center gap-14">
            {MARQUEE_TERMS.map((term) => (
              <span key={term} className="t-eyebrow flex items-center gap-14 whitespace-nowrap">
                {term}
                <span className="text-[var(--accent-mint)]">✦</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
