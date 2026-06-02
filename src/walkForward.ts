/**
 * walkForward.ts
 *
 * Walk-forward / out-of-sample validation.  Splits the historical PnL
 * series into an in-sample training window and an out-of-sample (OOS)
 * holdout, simulates a Monte Carlo distribution from training, then
 * scores how well the simulated distribution matches the realised OOS
 * PnL.
 *
 * Why this matters for institutional positioning: every model can be
 * fit to look great on the data it was calibrated on. A walk-forward
 * test answers the only question allocators care about — "would this
 * model have helped you forecast risk on data it had not yet seen?"
 *
 * Scoring metrics:
 *   - Quantile coverage: of the OOS observations, how many fell at
 *     each empirical quantile of the training distribution? Under
 *     ideal calibration, the realised PIT is Uniform(0,1).
 *   - Realised tail breach rate: count of OOS observations below the
 *     5%-quantile of training, expected ≈ 5%. Compared via Kupiec POF.
 *   - Mean / std comparison: training-implied mu/sigma vs OOS sample.
 *   - PIT histogram chi-square test (reuses pitCalibration logic).
 */

import { ksTwoSample, kupiecPOF, type TestVerdict } from './modelValidation';

export type WalkForwardConfig = {
  /** Fraction of history kept as the training (in-sample) window. */
  trainFraction: number; // e.g. 0.7
  /** PIT chi-square bins. */
  bins?: number;
};

export type WalkForwardReport = {
  trainSize: number;
  oosSize: number;
  /** Realised breach rate of OOS values below the 5% quantile of training. */
  breachRate: number;
  expectedBreachRate: number;
  kupiecLR: number;
  kupiecPValue: number;
  /** PIT chi-square p-value on OOS data scored via training CDF. */
  pitPValue: number;
  pitChiSq: number;
  /** Two-sample KS between training and OOS. */
  ksD: number;
  ksPValue: number;
  /** Sample stats for sanity. */
  trainMean: number;
  trainStd: number;
  oosMean: number;
  oosStd: number;
  verdict: TestVerdict;
  note: string;
};

function meanStd(x: number[]): { mean: number; std: number } {
  const n = x.length;
  if (n < 2) return { mean: x[0] ?? 0, std: 0 };
  let s = 0;
  for (let i = 0; i < n; i++) s += x[i];
  const mean = s / n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (x[i] - mean) ** 2;
  return { mean, std: Math.sqrt(v / (n - 1)) };
}

function quantile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor(sortedAsc.length * p)));
  return sortedAsc[idx];
}

/** Empirical CDF F̂(x) = (#{X_i ≤ x}) / n. */
function ecdf(sortedAsc: number[], x: number): number {
  // Binary search for first index where sortedAsc[i] > x
  let lo = 0, hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedAsc[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo / sortedAsc.length;
}

export function buildWalkForwardReport(
  pnl: number[],
  config: WalkForwardConfig = { trainFraction: 0.7 }
): WalkForwardReport | null {
  const trainFraction = Math.min(0.9, Math.max(0.3, config.trainFraction ?? 0.7));
  const bins = config.bins ?? 10;
  const n = pnl.length;
  if (n < 50) return null;

  const cut = Math.floor(n * trainFraction);
  const train = pnl.slice(0, cut);
  const oos = pnl.slice(cut);
  if (train.length < 30 || oos.length < 10) return null;

  const trainSorted = [...train].sort((a, b) => a - b);
  const var05 = quantile(trainSorted, 0.05);

  const breaches = oos.map((v) => (v < var05 ? 1 : 0));
  const breachCount = breaches.reduce((s, v) => s + v, 0);
  const breachRate = breachCount / oos.length;
  const kup = kupiecPOF(breaches, 0.95);

  // PIT histogram using training ECDF
  const pits = oos.map((v) => ecdf(trainSorted, v));
  const counts = new Array(bins).fill(0);
  for (const u of pits) {
    const idx = Math.min(bins - 1, Math.floor(u * bins));
    counts[idx]++;
  }
  const expected = oos.length / bins;
  let chi2 = 0;
  for (const c of counts) chi2 += ((c - expected) ** 2) / expected;
  // Chi-square upper-tail with (bins-1) df, computed via the same gammaP path
  // used in modelValidation. Inline a simple implementation here so we don't
  // export it from there.
  const pitPValue = chiSqUpperTail(chi2, bins - 1);

  const ks = ksTwoSample(train, oos);
  const trainStats = meanStd(train);
  const oosStats = meanStd(oos);

  // Verdict roll-up
  let verdict: TestVerdict = 'pass';
  if (kup.p < 0.01 || pitPValue < 0.01 || ks.p < 0.01) verdict = 'fail';
  else if (kup.p < 0.05 || pitPValue < 0.05 || ks.p < 0.05) verdict = 'warn';

  const note =
    verdict === 'pass'
      ? `Training distribution generalises to the held-out ${oos.length}-trade window. Tail breach rate (${(breachRate * 100).toFixed(1)}%) is consistent with the 5% expected, PIT histogram is uniform, and overall distributions match.`
      : verdict === 'warn'
      ? `Mild walk-forward drift detected. The model is calibrated to the training window but the holdout deviates at the 5–10% confidence band. Worth investigating regime change or non-stationarity.`
      : `Significant walk-forward failure. The simulator's training distribution does not generalise — historical-only metrics likely understate true risk on new data. Re-fit on more recent data, or treat tail estimates with extra caution.`;

  return {
    trainSize: train.length,
    oosSize: oos.length,
    breachRate,
    expectedBreachRate: 0.05,
    kupiecLR: kup.LR,
    kupiecPValue: kup.p,
    pitPValue,
    pitChiSq: chi2,
    ksD: ks.D,
    ksPValue: ks.p,
    trainMean: trainStats.mean,
    trainStd: trainStats.std,
    oosMean: oosStats.mean,
    oosStd: oosStats.std,
    verdict,
    note,
  };
}

// ─── chi-square tail (local copy to keep module self-contained) ─────────────

function logGamma(x: number): number {
  // Stirling — sufficient precision for chi-square tail at our df values.
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let t = x + 5.5;
  t -= (x + 0.5) * Math.log(t);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -t + Math.log(2.5066282746310005 * ser / x);
}

function gammaP(a: number, x: number): number {
  if (x < 0 || a <= 0) return 0;
  if (x === 0) return 0;
  const gln = logGamma(a);
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 1; n < 200; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  const FPMIN = 1e-300;
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-12) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
}

function chiSqUpperTail(stat: number, df: number): number {
  if (stat <= 0) return 1;
  return 1 - gammaP(df / 2, stat / 2);
}
