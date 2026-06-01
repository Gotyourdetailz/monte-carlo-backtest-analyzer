/*
 * src/components/bench/ChallengeVerdictBench.tsx
 *
 * PROTOTYPE — the Challenge Verdict surface rebuilt in the "Bench Instrument"
 * design direction (Premium Quant Terminal). Self-contained and non-destructive:
 * it imports ONLY scoped tokens (bench.css) and a minimal local prop shape, so
 * it does not touch the live ChallengeVerdict.tsx or the global theme engine.
 *
 * Design intent: the verdict reads like a labeled readout on a precision bench
 * instrument, not a SaaS card. Mono part-codes + tabular numbers, hairline
 * bezels (no floating rounded cards), one scarce ion accent on the active gauge
 * needle + primary action. Honest null states are preserved (C7 honesty gate),
 * semantic colour is always paired with a word/icon (C3), motion is fast and
 * reduced-motion-gated (C6). Presentation only — no statistics computed here.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, ArrowRight } from 'lucide-react';
import './bench.css';

type Verdict = 'pass' | 'warn' | 'fail';

/** Minimal data shape — mirrors the fields the live verdict reads off results. */
export interface BenchVerdictData {
  /** Modeled pass probability 0–100, or null when prop rules weren't applied. */
  passRate: number | null;
  nSimulations: number;
  /** Largest failure bucket, so colour is never the only signal. */
  binding: string;
  /** Out-of-sample walk-forward result, or null when too few trades for honesty. */
  walkForward: {
    verdict: Verdict;
    trainMean: number;
    oosMean: number;
    note: string;
  } | null;
  nTrades: number;
  meta?: { seed?: number; ts?: string };
}

const VERDICT: Record<Verdict, { word: string; color: string; icon: ReactElement }> = {
  pass: { word: 'PASS', color: 'var(--bench-up)', icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> },
  warn: { word: 'WARN', color: 'var(--bench-warn)', icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> },
  fail: { word: 'FAIL', color: 'var(--bench-down)', icon: <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> },
};

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function passColor(p: number): string {
  if (p >= 80) return 'var(--bench-up)';
  if (p >= 50) return 'var(--bench-warn)';
  return 'var(--bench-down)';
}

/** Signed dollars with a real minus sign; cents under $100, whole above. */
function fmtSigned(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  const digits = Math.abs(safe) < 100 ? 2 : 0;
  return `${safe < 0 ? '−' : '+'}$${Math.abs(safe).toFixed(digits)}`;
}

/** A mono "documented-part" label: CODE / sublabel. */
function PartLabel({ code, sub }: { code: string; sub: string }): ReactElement {
  return (
    <div className="flex items-baseline gap-2">
      <span className="bench-label" style={{ color: 'var(--bench-text)' }}>
        {code}
      </span>
      <span className="bench-label" style={{ letterSpacing: '0.08em' }}>
        / {sub}
      </span>
    </div>
  );
}

/** Left readout — modeled pass probability on an instrument scale. */
function PassReadout({
  passRate,
  nSimulations,
  binding,
}: {
  passRate: number;
  nSimulations: number;
  binding: string;
}): ReactElement {
  const pct = clampPct(passRate);
  // Needle sweeps from 0 to the value on mount (phosphor power-on). The CSS
  // transition is reduced-motion-gated, so reduced-motion users just see it land.
  const [swept, setSwept] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setSwept(true));
    return () => cancelAnimationFrame(r);
  }, []);
  return (
    <div className="flex flex-col gap-4 p-6" data-bench-enter="2">
      <PartLabel code="PASS·ODDS" sub="monte-carlo" />

      <div className="flex items-baseline gap-2.5">
        <span
          className="bench-value text-[2.9rem] font-semibold leading-none"
          style={{ color: passColor(pct) }}
          aria-live="polite"
        >
          {pct.toFixed(0)}
          <span className="text-2xl align-top" style={{ color: 'var(--bench-text-dim)' }}>
            %
          </span>
        </span>
        <span className="bench-label pb-1">pass odds</span>
      </div>

      {/* instrument scale: muted zone bands + fine ticks + ion needle */}
      <div
        role="img"
        aria-label={`${pct.toFixed(0)} percent of simulated challenges passed`}
        className="relative h-2.5 w-full overflow-hidden rounded-[2px]"
        style={{
          background:
            'linear-gradient(90deg,' +
            ' color-mix(in srgb, var(--bench-down) 26%, transparent) 0 50%,' +
            ' color-mix(in srgb, var(--bench-warn) 26%, transparent) 50% 80%,' +
            ' color-mix(in srgb, var(--bench-up) 30%, transparent) 80% 100%)',
        }}
      >
        <span className="bench-ticks absolute inset-0 opacity-50" aria-hidden="true" />
        <span
          className="bench-needle absolute top-0 bottom-0"
          style={{ left: swept ? `${pct}%` : '0%', transform: 'translateX(-50%)' }}
          aria-hidden="true"
        >
          <span className="bench-pointer absolute -top-[6px] left-1/2 -translate-x-1/2" />
          <span
            className="absolute top-[-3px] bottom-[-3px] left-1/2 w-[2px] -translate-x-1/2 rounded-full"
            style={{ background: 'var(--bench-ion)', boxShadow: '0 0 0 1.5px var(--bench-panel), 0 0 8px var(--bench-ion)' }}
          />
        </span>
      </div>
      <div className="flex justify-between">
        {['0', '50', '80', '100'].map((t) => (
          <span key={t} className="bench-value text-[9px]" style={{ color: 'var(--bench-text-faint)' }}>
            {t}
          </span>
        ))}
      </div>

      <p className="bench-value text-[11px] leading-relaxed" style={{ color: 'var(--bench-text-dim)' }}>
        {nSimulations.toLocaleString()} simulated challenges · binding constraint:{' '}
        <span style={{ color: 'var(--bench-text)' }}>{binding}</span>
      </p>

      <p className="text-[10px] leading-snug" style={{ color: 'var(--bench-text-faint)' }}>
        Modeled from Monte Carlo resampling of your own past trades. Not a prediction of future
        results and not financial advice.
      </p>
    </div>
  );
}

/** A single in-sample / out-of-sample trace line. */
function TraceBar({
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
  return (
    <div className="flex items-center gap-2.5">
      <span className="bench-label w-[5.5rem] shrink-0">{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-[1px]" style={{ background: 'var(--bench-bezel)' }}>
        <div
          className="h-full rounded-[1px]"
          style={{ width: `${width}%`, background: safe >= 0 ? 'var(--bench-up)' : 'var(--bench-down)' }}
        />
      </div>
      <span
        className="bench-value w-16 shrink-0 text-right text-[11px]"
        style={{ color: 'var(--bench-text)' }}
      >
        {fmtSigned(safe)}
      </span>
    </div>
  );
}

/** Right readout — the walk-forward out-of-sample edge verdict. */
function EdgeReadout({
  wf,
}: {
  wf: NonNullable<BenchVerdictData['walkForward']>;
}): ReactElement {
  const v = VERDICT[wf.verdict];
  const scale = Math.max(Math.abs(wf.trainMean), Math.abs(wf.oosMean));
  return (
    <div className="flex flex-col gap-4 p-6" data-bench-enter="3">
      <div className="flex items-center justify-between">
        <PartLabel code="WF·OOS" sub="walk-forward" />
        {/* verdict — semantic colour + WORD + icon, never colour alone, no tinted pill */}
        <span className="inline-flex items-center gap-1.5" style={{ color: v.color }}>
          {v.icon}
          <span className="bench-value text-[11px] font-semibold tracking-wider">{v.word}</span>
        </span>
      </div>

      <div className="bench-value text-2xl leading-none" style={{ color: 'var(--bench-text)' }}>
        {fmtSigned(wf.trainMean)}
        <span className="px-1.5 text-base" style={{ color: 'var(--bench-text-faint)' }}>
          →
        </span>
        <span style={{ color: wf.oosMean >= 0 ? 'var(--bench-up)' : 'var(--bench-down)' }}>
          {fmtSigned(wf.oosMean)}
        </span>
        <span className="bench-label pl-2">/ trade</span>
      </div>

      <div className="flex flex-col gap-2">
        <TraceBar label="in-sample" value={wf.trainMean} scale={scale} />
        <TraceBar label="out-of-sample" value={wf.oosMean} scale={scale} />
      </div>

      <p className="text-[11px] leading-snug" style={{ color: 'var(--bench-text-dim)' }}>
        {wf.note}
      </p>
    </div>
  );
}

/** Right readout when there are too few trades to run an honest OOS test. */
function EdgeUnavailable({ nTrades }: { nTrades: number }): ReactElement {
  return (
    <div className="flex flex-col gap-2 p-6" data-bench-enter="3">
      <PartLabel code="WF·OOS" sub="walk-forward" />
      <div className="mt-1 inline-flex w-fit items-center gap-2" style={{ color: 'var(--bench-text-dim)' }}>
        <Info className="h-4 w-4" aria-hidden="true" />
        <span className="text-sm font-semibold" style={{ color: 'var(--bench-text)' }}>
          Edge test unavailable
        </span>
      </div>
      <p className="bench-value text-[11px] leading-snug" style={{ color: 'var(--bench-text-dim)' }}>
        Not enough trades for an out-of-sample test (need ≥50; you have {nTrades}).
      </p>
    </div>
  );
}

export function ChallengeVerdictBench({ data }: { data: BenchVerdictData }): ReactElement {
  const { passRate, nSimulations, binding, walkForward, nTrades, meta } = data;
  const seed = meta?.seed ?? 1337;
  const ts = meta?.ts ?? '2026-04-08 14:21 UTC';

  return (
    <div
      className="overflow-hidden rounded-[var(--bench-radius)]"
      style={{
        background: 'var(--bench-panel)',
        border: '1px solid var(--bench-bezel)',
        boxShadow: 'var(--bench-shadow)',
      }}
    >
      {/* bezel header — the documented unit */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-6 py-3.5"
        style={{ borderBottom: '1px solid var(--bench-bezel)' }}
        data-bench-enter="1"
      >
        <div className="flex items-center gap-2.5">
          <span className="bench-label" style={{ color: 'var(--bench-text)', letterSpacing: '0.16em' }}>
            CHALLENGE VERDICT
          </span>
          <span className="bench-value text-[9px]" style={{ color: 'var(--bench-text-faint)' }}>
            [ CV-01 ]
          </span>
        </div>
        <span className="bench-label" style={{ letterSpacing: '0.06em' }}>
          will you pass — and is your edge real?
        </span>
      </div>

      {/* the two readouts, divided by a hairline */}
      <div className="grid grid-cols-1 md:grid-cols-2">
        <div style={{ borderBottom: '1px solid var(--bench-bezel)' }} className="md:border-b-0 md:[border-right:1px_solid_var(--bench-bezel)]">
          {passRate !== null ? (
            <PassReadout passRate={passRate} nSimulations={nSimulations} binding={binding} />
          ) : (
            <div className="p-6 text-[11px]" style={{ color: 'var(--bench-text-dim)' }} data-bench-enter="2">
              <PartLabel code="PASS·ODDS" sub="monte-carlo" />
              <p className="mt-3">Prop-firm pass rules were not applied to this run.</p>
            </div>
          )}
        </div>
        <div>
          {walkForward ? <EdgeReadout wf={walkForward} /> : <EdgeUnavailable nTrades={nTrades} />}
        </div>
      </div>

      {/* spec footer (documented readout) + primary action */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-6 py-3"
        style={{ borderTop: '1px solid var(--bench-bezel)' }}
      >
        <span className="bench-value text-[10px]" style={{ color: 'var(--bench-text-faint)' }}>
          N={nTrades} · SIMS={nSimulations.toLocaleString()} · SEED={seed} · {ts}
        </span>
        <a
          href="#reserve"
          className="bench-cta group inline-flex min-h-[36px] items-center gap-1.5 rounded-[3px] px-3 py-1.5"
        >
          <span className="bench-value text-[11px] font-semibold tracking-wider">LOCK FOUNDING PRICE</span>
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
