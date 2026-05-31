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
import { BRAND_GRADIENT, type Faq, type IconType } from './content';

/** The primary call-to-action: launch the analyzer at /app. */
export function PrimaryCta({ label }: { label: string }): ReactElement {
  return (
    <Link
      to="/app"
      className="btn-press inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-sm"
      style={BRAND_GRADIENT}
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

/** A single before/after card for the in-sample vs out-of-sample hook. */
export function BeforeAfterCard({
  label,
  value,
  caption,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  caption: string;
  tone: 'green' | 'red';
  icon: IconType;
}): ReactElement {
  const accentText = tone === 'green' ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]';
  const accentLeft = tone === 'green' ? 'accent-left-green' : 'accent-left-red';
  return (
    <div className={cn('glass-card p-5 text-left', accentLeft)}>
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        <Icon className={cn('h-4 w-4', accentText)} />
        {label}
      </div>
      <div className={cn('metric-value text-3xl font-semibold', accentText)}>{value}</div>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">{caption}</p>
    </div>
  );
}

/** Generic icon + title + body card used by the trio and the steps. */
export function InfoCard({
  icon: Icon,
  title,
  body,
  accentText,
  accentBorder,
  eyebrow,
  delayClass,
}: {
  icon: IconType;
  title: string;
  body: string;
  accentText: string;
  accentBorder?: string;
  eyebrow?: string;
  delayClass?: string;
}): ReactElement {
  return (
    <div
      className={cn(
        'glass-card lift-on-hover panel-enter border p-6 text-left',
        accentBorder ?? 'border-[var(--border)]',
        delayClass,
      )}
    >
      <Icon className={cn('mb-3 h-6 w-6', accentText)} />
      {eyebrow ? (
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {eyebrow}
        </div>
      ) : null}
      <h3 className="mb-2 text-base font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{body}</p>
    </div>
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
  eyebrow: string;
  title: string;
}): ReactElement {
  return (
    <div className="mb-10 text-center">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--accent-blue)]">
        {eyebrow}
      </div>
      <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}
