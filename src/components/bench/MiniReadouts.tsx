/*
 * src/components/bench/MiniReadouts.tsx
 *
 * Small instrument readouts for the marketing "Three answers" section — each
 * answer carries its own data visualisation instead of a generic icon, so the
 * section reads as bench telemetry, not three identical AI feature cards.
 *
 * These are DATA-VIZ (the brand's whole language), not decorative illustration.
 * Pure presentational SVG/markup, theme-token driven (work in light + dark),
 * static (no motion) — the parent tiles handle entrance via `.panel-enter`.
 */
import type { ReactElement } from 'react';

/* ── PassGauge: modeled pass-odds meter with a pass-line tick ── */
export function PassGauge({ pct = 86, threshold = 65 }: { pct?: number; threshold?: number }): ReactElement {
  return (
    <div className="w-full">
      <div className="flex items-baseline gap-2">
        <span className="mono text-3xl font-semibold leading-none text-[var(--accent-mint)]">{pct}%</span>
        <span className="t-label text-[var(--text-secondary)]">modeled pass odds</span>
      </div>
      <div className="relative mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: 'var(--accent-mint)' }}
        />
        {/* pass-line threshold tick */}
        <div
          className="absolute inset-y-0 w-px"
          style={{ left: `${threshold}%`, background: 'var(--text-primary)', opacity: 0.5 }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="t-label text-[var(--text-secondary)]">0</span>
        <span className="t-label text-[var(--text-secondary)]">pass line</span>
        <span className="t-label text-[var(--text-secondary)]">100</span>
      </div>
    </div>
  );
}

/* ── EdgeTrace: in-sample (mint, up) → out-of-sample (red, diverging down) ── */
const TW = 320;
const TH = 116;
const TBASE = 64;
const TBOUND = 0.58;
const TN = 40;

function tracePoints(peak: number, oosEnd: number): ReadonlyArray<readonly [number, number]> {
  const pts: Array<readonly [number, number]> = [];
  for (let i = 0; i <= TN; i++) {
    const t = i / TN;
    const x = t * TW;
    let y: number;
    if (t < TBOUND) {
      const p = t / TBOUND;
      y = TBASE - (TBASE - peak) * (1 - Math.pow(1 - p, 1.8));
    } else {
      const p = (t - TBOUND) / (1 - TBOUND);
      y = peak + (oosEnd - peak) * Math.pow(p, 1.35);
    }
    pts.push([x, Math.max(6, Math.min(TH - 6, y))]);
  }
  return pts;
}
function traceLine(pts: ReadonlyArray<readonly [number, number]>): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
}

export function EdgeTrace(): ReactElement {
  const all = tracePoints(16, 100);
  const bIdx = Math.round(TBOUND * TN);
  const inPts = all.slice(0, bIdx + 1);
  const oosPts = all.slice(bIdx);
  const bx = (TBOUND * TW).toFixed(1);
  const peak = inPts[inPts.length - 1];
  const end = all[all.length - 1];
  return (
    <svg viewBox={`0 0 ${TW} ${TH}`} className="h-auto w-full" role="img" aria-label="In-sample edge rising, then decaying out-of-sample.">
      <line x1="0" y1={TBASE} x2={TW} y2={TBASE} stroke="var(--text-secondary)" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="2 5" />
      <line x1={bx} y1="0" x2={bx} y2={TH} stroke="var(--text-secondary)" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="3 4" />
      <path
        d={traceLine(inPts)}
        fill="none"
        stroke="var(--accent-mint)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 0 5px rgba(70,230,200,0.55))' }}
      />
      <path
        d={traceLine(oosPts)}
        fill="none"
        stroke="var(--trace-fail)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 0 6px rgba(255,90,77,0.5))' }}
      />
      <circle cx={peak[0]} cy={peak[1]} r="3" fill="var(--accent-mint-bright)" />
      <circle cx={end[0]} cy={end[1]} r="3.5" fill="var(--trace-fail)" />
    </svg>
  );
}

/* ── TailSpark: loss distribution with the left tail flagged red ── */
const TAIL_BARS = [6, 9, 13, 19, 27, 38, 52, 66, 78, 86, 84, 72, 56, 40, 26, 15] as const;
const TAIL_COUNT = 4; // leftmost bars = the loss tail

export function TailSpark(): ReactElement {
  const max = Math.max(...TAIL_BARS);
  return (
    <div className="w-full">
      <div className="flex h-20 items-end gap-[3px]" aria-hidden="true">
        {TAIL_BARS.map((h, i) => {
          const isTail = i < TAIL_COUNT;
          return (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: `${(h / max) * 100}%`,
                background: isTail ? 'var(--trace-fail)' : 'var(--text-secondary)',
                opacity: isTail ? 0.9 : 0.32,
              }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="t-label" style={{ color: 'var(--trace-fail)' }}>loss tail</span>
        <span className="t-label text-[var(--text-secondary)]">simulated outcomes</span>
      </div>
    </div>
  );
}
