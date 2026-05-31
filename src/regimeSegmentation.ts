import { pearsonCorrelation } from './correlation';

export type RegimeSegmentId = 'in_regime' | 'out_regime' | 'clustered' | 'dispersed';

/**
 * Rolling-window length (in trades) used by the auto-segment classifier
 * when no explicit `in_regime` column is provided. Twenty trades is the
 * smallest window where the lag-1 Pearson autocorrelation has 19 paired
 * observations to estimate from — shorter windows produce noisy
 * correlations that flip-flop between adjacent rows; longer windows blur
 * regime transitions and lag the boundary by half the window length.
 *
 * NOTE: this is the autoregressive autocorrelation window for the
 * Portfolio segment classifier, distinct from the user-facing
 * `autoRegimeWindow` setting on the Regime-Switching tab (which controls
 * the rolling-win-rate classifier in `simulationEngine.ts`).
 *
 * Validates: Requirement 25.7.
 */
const WINDOW = 20;

/**
 * Threshold on |lag-1 Pearson autocorrelation| above which a row is
 * tagged `clustered`. 0.35 is the empirical mid-point between
 * white-noise PnL series (|ρ_1| typically below 0.15) and visibly
 * trending / streak-prone series (|ρ_1| above 0.5 in the reviewed
 * NinjaTrader logs). Rows with |ρ_1| ≥ 0.35 carry persistence; the rest
 * are treated as `dispersed`.
 *
 * Validates: Requirement 25.7.
 */
const AUTOCORR_THRESHOLD = 0.35;

export function findInRegimeColumn(fields: string[]): string | null {
  const lower = fields.map((f) => f.trim().toLowerCase());
  const idx = lower.findIndex((f) => f === 'in_regime' || f === 'in regime');
  if (idx >= 0) return fields[idx];
  return null;
}

function parseBooleanish(val: unknown): boolean | null {
  if (val === true || val === 1) return true;
  if (val === false || val === 0) return false;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(s)) return true;
    if (['0', 'false', 'no', 'n'].includes(s)) return false;
  }
  return null;
}

/**
 * Label each CSV row for portfolio regime breakdown.
 *
 * Returns a sidecar `Map<rowIndex, RegimeSegmentId>` keyed by the row's
 * original 0-based index in `rows`. Callers MUST consume the map via
 * `.get(i)` and route it through `ParseDailyDataInput.segments` rather than
 * mutating the user CSV row with a `__segment` property — see Requirement
 * 11.3 (and the F-SEC-05 / F-SD-16 findings the requirement traces to).
 *
 * Validates: Requirement 11.3.
 */
export function assignPortfolioRegimeSegments(
  rows: Record<string, unknown>[],
  profitCol: string,
  parseProfit: (v: unknown) => number,
  inRegimeCol: string | null
): Map<number, RegimeSegmentId> {
  const out = new Map<number, RegimeSegmentId>();

  if (inRegimeCol) {
    for (let i = 0; i < rows.length; i++) {
      const b = parseBooleanish(rows[i][inRegimeCol]);
      out.set(i, b ? 'in_regime' : 'out_regime');
    }
    return out;
  }

  const pnls = rows.map((r) => parseProfit(r[profitCol]));
  for (let i = 0; i < pnls.length; i++) {
    if (i < WINDOW - 1) {
      out.set(i, 'dispersed');
      continue;
    }
    const w = pnls.slice(i - WINDOW + 1, i + 1);
    const lagA = w.slice(0, -1);
    const lagB = w.slice(1);
    const ac = Math.abs(pearsonCorrelation(lagA, lagB));
    out.set(i, ac >= AUTOCORR_THRESHOLD ? 'clustered' : 'dispersed');
  }
  return out;
}

export function regimeSegmentLabel(id: RegimeSegmentId | string): string {
  switch (id) {
    case 'in_regime':
      return 'In regime (column)';
    case 'out_regime':
      return 'Out of regime (column)';
    case 'clustered':
      return 'Clustered (high rolling autocorrelation)';
    case 'dispersed':
      return 'Dispersed (low rolling autocorrelation)';
    default:
      return String(id);
  }
}
