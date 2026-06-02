import type { ReactElement } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
} from 'lucide-react';
import type { SimulationResults } from '../types';
import { EARLY_ACCESS_URL, isEarlyAccessEnabled, trackEvent } from '../config';
import { cn } from '../lib/utils';

/**
 * src/components/ChallengeVerdict.tsx — the hero result surface.
 *
 * Two honest questions, side by side: "Will you pass the challenge?" (modeled
 * pass odds from Monte Carlo resampling) and "Is your edge real?" (the
 * out-of-sample walk-forward verdict). Everything is READ off `results` — this
 * component computes no statistics of its own. When the underlying analysis is
 * absent (prop rules off, or fewer than 50 trades for OOS), we say so plainly
 * rather than fabricating a verdict.
 */

type ChallengeVerdictProps = {
  results: SimulationResults;
};

type Verdict = 'pass' | 'warn' | 'fail';

const VERDICT_STYLE: Record<
  Verdict,
  { word: string; tint: string; text: string; icon: ReactElement }
> = {
  pass: {
    word: 'PASS',
    tint: 'bg-[var(--accent-green)]/10',
    text: 'text-[var(--accent-green)]',
    icon: <CheckCircle2 className="w-4 h-4" aria-hidden="true" />,
  },
  warn: {
    word: 'WARN',
    tint: 'bg-[var(--accent-amber)]/10',
    text: 'text-[var(--accent-amber)]',
    icon: <AlertTriangle className="w-4 h-4" aria-hidden="true" />,
  },
  fail: {
    word: 'FAIL',
    tint: 'bg-[var(--accent-red)]/10',
    text: 'text-[var(--accent-red)]',
    icon: <XCircle className="w-4 h-4" aria-hidden="true" />,
  },
};

/** Clamp a value into the inclusive [0, 100] percent range. */
function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** Threshold colour for the pass-odds number (mirrors the app convention). */
function passColor(passRate: number): string {
  if (passRate >= 80) return 'text-[var(--accent-green)]';
  if (passRate >= 50) return 'text-[var(--accent-amber)]';
  return 'text-[var(--accent-red)]';
}

/**
 * Signed dollar formatter with a real minus sign for negatives. Uses cents
 * below $100, whole dollars above (the per-trade edge is small).
 */
function fmtSignedDollars(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  const digits = Math.abs(safe) < 100 ? 2 : 0;
  const magnitude = Math.abs(safe).toFixed(digits);
  const sign = safe < 0 ? '−' : '+';
  return `${sign}$${magnitude}`;
}

/** Label of the largest failure bucket, so colour is never the only signal. */
function bindingFailureLabel(stats: {
  failDrawdown: number;
  failConsistency: number;
  failTime: number;
}): string {
  const buckets: ReadonlyArray<{ label: string; value: number }> = [
    { label: 'drawdown', value: stats.failDrawdown },
    { label: 'consistency', value: stats.failConsistency },
    { label: 'time / no target', value: stats.failTime },
  ];
  return buckets.reduce((top, b) => (b.value > top.value ? b : top)).label;
}

/** Left tile — modeled pass probability with an always-visible bullet gauge. */
function PassProbabilityTile({
  stats,
  nSimulations,
}: {
  stats: NonNullable<SimulationResults['propEvalStats']>;
  nSimulations: number;
}): ReactElement {
  const passRate = clampPct(stats.passRate);
  const markerLeft = `${passRate}%`;
  const binding = bindingFailureLabel(stats);

  return (
    <div className="p-5 md:p-6 flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span
          aria-live="polite"
          className={cn('metric-value tabular text-5xl font-bold leading-none', passColor(passRate))}
        >
          {passRate.toFixed(0)}%
        </span>
        <span className="text-sm text-[var(--text-secondary)] font-medium">pass odds</span>
      </div>

      <div
        role="img"
        aria-label={`${passRate.toFixed(0)}% of simulated challenges passed`}
        className="relative h-2.5 rounded-full overflow-hidden"
        style={{
          background:
            'linear-gradient(90deg, var(--accent-red) 0%, var(--accent-red) 50%, var(--accent-amber) 50%, var(--accent-amber) 80%, var(--accent-green) 80%)',
        }}
      >
        <span
          aria-hidden="true"
          className="absolute top-[-2px] bottom-[-2px] w-0.5 rounded-full bg-[var(--text-primary)] shadow"
          style={{ left: markerLeft, transform: 'translateX(-1px)' }}
        />
      </div>

      <p className="text-xs text-[var(--text-secondary)]">
        of {nSimulations.toLocaleString()} simulated challenges passed · most failures:{' '}
        <span className="font-medium">{binding}</span>
      </p>

      <p className="text-[10px] text-[var(--text-secondary)] leading-snug">
        Modeled from Monte Carlo resampling of your own past trades. Not a prediction of future
        results and not financial advice.
      </p>
    </div>
  );
}

/** A single labeled mean bar in the train-vs-OOS comparison sparkline. */
function MeanBar({
  label,
  value,
  scale,
}: {
  label: string;
  value: number;
  scale: number;
}): ReactElement {
  const safe = Number.isFinite(value) ? value : 0;
  const width = scale > 0 ? clampPct((Math.abs(safe) / scale) * 100) : 0;
  const positive = safe >= 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-[var(--border)]/40 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full',
            positive ? 'bg-[var(--accent-green)]' : 'bg-[var(--accent-red)]',
          )}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="metric-value tabular w-16 shrink-0 text-right text-[11px] text-[var(--text-secondary)]">
        {fmtSignedDollars(safe)}
      </span>
    </div>
  );
}

/** Right tile when the walk-forward (out-of-sample) edge test is available. */
function EdgeVerdictTile({
  wf,
}: {
  wf: NonNullable<SimulationResults['walkForward']>;
}): ReactElement {
  const style = VERDICT_STYLE[wf.verdict];
  const scale = Math.max(Math.abs(wf.trainMean), Math.abs(wf.oosMean));

  return (
    <div className="p-5 md:p-6 flex flex-col gap-3">
      <div
        className={cn(
          'inline-flex w-fit items-center gap-2 rounded-lg px-3 py-1.5 font-bold',
          style.tint,
          style.text,
        )}
      >
        {style.icon}
        <span className="text-sm tracking-wide">{style.word}</span>
      </div>

      <div className="metric-value tabular text-base text-[var(--text-primary)]">
        {fmtSignedDollars(wf.trainMean)} <span className="text-[var(--text-secondary)]">&rarr;</span>{' '}
        {fmtSignedDollars(wf.oosMean)}{' '}
        <span className="text-xs text-[var(--text-secondary)]">/ trade</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <MeanBar label="In-sample" value={wf.trainMean} scale={scale} />
        <MeanBar label="Out-of-sample" value={wf.oosMean} scale={scale} />
      </div>

      <p className="text-[11px] text-[var(--text-secondary)] leading-snug">{wf.note}</p>
    </div>
  );
}

/** Right tile when there are too few trades to run an honest OOS test. */
function EdgeUnavailableTile({ nTrades }: { nTrades: number }): ReactElement {
  return (
    <div className="p-5 md:p-6 flex flex-col gap-2">
      <div className="inline-flex w-fit items-center gap-2 text-[var(--text-secondary)]">
        <Info className="w-4 h-4" aria-hidden="true" />
        <span className="text-sm font-semibold">Edge test unavailable</span>
      </div>
      <p className="text-xs text-[var(--text-secondary)] leading-snug">
        Not enough trades for an out-of-sample test (need &ge;50; you have {nTrades}).
      </p>
    </div>
  );
}

/** Founding-price CTA. Renders nothing when early access is not configured. */
function ReserveCta(): ReactElement | null {
  if (!isEarlyAccessEnabled) return null;
  return (
    <div className="px-5 md:px-6 pb-5 md:pb-6">
      <a
        href={EARLY_ACCESS_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent('reserve_click', { source: 'verdict' })}
        className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--accent-mint)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-primary)] transition-colors hover:bg-[var(--accent-mint-bright)]"
      >
        Lock in founding price &rarr;
      </a>
    </div>
  );
}

export function ChallengeVerdict({ results }: ChallengeVerdictProps): ReactElement | null {
  const { propEvalStats, walkForward, runMeta } = results;

  // Nothing meaningful to show if neither analysis ran.
  if (!propEvalStats && !walkForward) return null;

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl overflow-hidden animate-fade-in-up">
      <div className="px-5 md:px-6 py-4 border-b border-[var(--border)]/60 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent-magenta)]" aria-hidden="true" />
          <span className="text-[10px] text-[var(--accent-magenta)] uppercase font-bold tracking-wider">
            Challenge Verdict
          </span>
        </div>
        <span className="text-xs text-[var(--text-secondary)]">
          Will you pass — and is your edge real?
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border)]/60">
        {propEvalStats ? (
          <PassProbabilityTile stats={propEvalStats} nSimulations={results.nSimulations} />
        ) : (
          <div className="p-5 md:p-6 text-xs text-[var(--text-secondary)]">
            Prop-firm pass rules were not applied to this run.
          </div>
        )}

        {walkForward ? (
          <EdgeVerdictTile wf={walkForward} />
        ) : (
          <EdgeUnavailableTile nTrades={runMeta.nTrades} />
        )}
      </div>

      <ReserveCta />
    </div>
  );
}
