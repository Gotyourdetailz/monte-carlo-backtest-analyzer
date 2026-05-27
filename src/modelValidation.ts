/**
 * modelValidation.ts
 *
 * Model-risk diagnostics in the spirit of SR 11-7 / OCC 2011-12:
 *   1. Goodness-of-fit between simulated terminal-PnL distribution
 *      and the empirical bootstrap of historical PnL — Kolmogorov–Smirnov
 *      and Anderson–Darling tests.
 *   2. Serial-dependence preservation — does the resampler preserve
 *      autocorrelation structure of the historical series?  Ljung–Box
 *      Q statistic computed on both the empirical and a representative
 *      simulated path increment series.
 *   3. VaR backtests on the historical equity curve treated as a
 *      single realisation (Kupiec proportion-of-failures + Christoffersen
 *      independence test).
 *   4. PIT (probability-integral-transform) calibration: under a
 *      well-specified one-step model, U_t = F̂(x_t) ~ Uniform(0,1).
 *      Flags miscalibration via a chi-square binning test.
 *
 * All routines are pure-TS, no external stats packages required.
 * Critical values for the small handful of tests we need are computed
 * via well-known asymptotic distributions (chi-square, KS) implemented
 * locally so we don't pull in jstat just for tail areas.
 */

import { logGamma } from './distributionFitting';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TestVerdict = 'pass' | 'warn' | 'fail';

export type GoodnessOfFitResult = {
  /** Kolmogorov–Smirnov two-sample statistic D */
  ksStatistic: number;
  /** Asymptotic two-sided p-value (Kolmogorov distribution) */
  ksPValue: number;
  /** Anderson–Darling two-sample statistic A² */
  adStatistic: number;
  /** Approximate p-value via Marsaglia/Tsang surface */
  adPValue: number;
  verdict: TestVerdict;
  note: string;
};

export type SerialDependenceResult = {
  /** Ljung–Box Q on first `lags` autocorrelations of historical increments */
  empiricalQ: number;
  empiricalPValue: number;
  /** Same on a representative simulated path's first-difference series */
  simulatedQ: number;
  simulatedPValue: number;
  lags: number;
  verdict: TestVerdict;
  note: string;
};

export type VaRBacktestResult = {
  /** Number of historical observations used */
  observations: number;
  /** Number of breaches at the stated confidence */
  breaches: number;
  expectedBreaches: number;
  confidence: number;
  /** Kupiec proportion-of-failures LR statistic (chi² with 1 df) */
  kupiecStatistic: number;
  kupiecPValue: number;
  /** Christoffersen independence LR (chi² with 1 df). Tests whether breaches cluster. */
  christoffersenStatistic: number;
  christoffersenPValue: number;
  verdict: TestVerdict;
  note: string;
};

export type PITCalibrationResult = {
  /** Chi-square statistic on uniformity of PITs across `bins` bins */
  chiSqStatistic: number;
  /** p-value, chi² with (bins - 1) df */
  pValue: number;
  bins: number;
  verdict: TestVerdict;
  note: string;
};

export type ModelValidationReport = {
  goodnessOfFit?: GoodnessOfFitResult;
  serialDependence?: SerialDependenceResult;
  varBacktest?: VaRBacktestResult;
  pitCalibration?: PITCalibrationResult;
  /** Overall worst verdict across performed checks */
  overallVerdict: TestVerdict;
  /** Free-text summary suitable for the report header */
  headline: string;
};

// ─── Special-function helpers ────────────────────────────────────────────────

/**
 * Lower regularised incomplete gamma function P(a, x) via series + continued
 * fraction (Numerical Recipes 3rd ed, §6.2). Sufficient for chi-square tail
 * areas with df up to a few hundred.
 */
function gammaP(a: number, x: number): number {
  if (x < 0 || a <= 0) return 0;
  if (x === 0) return 0;
  const gln = logGamma(a);
  if (x < a + 1) {
    // Series representation
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n < 200; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gln);
  } else {
    // Continued fraction (Lentz's method) for the upper tail Q, then 1-Q
    const FPMIN = 1e-300;
    let b = x + 1 - a;
    let c = 1 / FPMIN;
    let d = 1 / b;
    let h = d;
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
    const q = Math.exp(-x + a * Math.log(x) - gln) * h;
    return 1 - q;
  }
}

/** Right-tail probability for chi² with df degrees of freedom. */
function chiSquareUpperTail(stat: number, df: number): number {
  if (stat <= 0) return 1;
  return 1 - gammaP(df / 2, stat / 2);
}

/**
 * Two-sided Kolmogorov distribution Q(λ) = 2·Σ (-1)^(k-1) exp(-2k²λ²).
 * Asymptotic for the KS two-sample test, valid when n·m/(n+m) is moderately large.
 */
function kolmogorovQ(lambda: number): number {
  if (lambda <= 0) return 1;
  let sum = 0;
  for (let k = 1; k < 200; k++) {
    const term = 2 * Math.pow(-1, k - 1) * Math.exp(-2 * k * k * lambda * lambda);
    sum += term;
    if (Math.abs(term) < 1e-12) break;
  }
  return Math.max(0, Math.min(1, sum));
}

// ─── 1. Goodness-of-fit (KS + AD two-sample) ─────────────────────────────────

/**
 * Two-sample Kolmogorov–Smirnov.
 * Returns D = sup|F_n(x) - G_m(x)| and an asymptotic two-sided p-value.
 */
export function ksTwoSample(a: number[], b: number[]): { D: number; p: number } {
  if (a.length === 0 || b.length === 0) return { D: 1, p: 0 };
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  let i = 0, j = 0, D = 0;
  const n = x.length, m = y.length;
  while (i < n && j < m) {
    if (x[i] <= y[j]) i++;
    else j++;
    const fn = i / n;
    const gm = j / m;
    const d = Math.abs(fn - gm);
    if (d > D) D = d;
  }
  const en = Math.sqrt((n * m) / (n + m));
  const lambda = (en + 0.12 + 0.11 / en) * D;
  return { D, p: kolmogorovQ(lambda) };
}

/**
 * Two-sample Anderson–Darling (Pettitt 1976).
 * Under H0 the statistic has mean ≈ 1; critical values for the 10%, 5%,
 * 2.5%, 1% levels are 1.933, 2.492, 3.070, 3.878 respectively.
 *
 * Formula:
 *   A² = (1 / nm) · Σ_{k=1..N-1} ( (M_k · N - n · k)² / ( k · (N-k) ) )
 *
 * where M_k is the number of sample-1 observations in the first k order
 * statistics of the pooled sample. Implemented as a single pass with two
 * pointers over the sorted samples — O((n+m)·log) including the sort.
 */
export function adTwoSample(a: number[], b: number[]): { A2: number; p: number } {
  const n = a.length, m = b.length;
  if (n < 2 || m < 2) return { A2: NaN, p: 1 };
  const N = n + m;
  const xs = [...a].sort((p, q) => p - q);
  const ys = [...b].sort((p, q) => p - q);

  let i = 0, j = 0; // pointers in xs, ys
  let A2 = 0;
  for (let k = 1; k <= N - 1; k++) {
    // Advance the side with the smaller next value
    if (i < n && (j >= m || xs[i] <= ys[j])) i++;
    else j++;
    const Mk = i;
    const denom = k * (N - k);
    if (denom === 0) continue;
    const num = Mk * N - n * k;
    A2 += (num * num) / denom;
  }
  A2 = A2 / (n * m);

  return { A2, p: adApproxPValue(A2) };
}

/**
 * Approximate p-value for the Pettitt two-sample AD statistic.
 * Uses linear interpolation between Pettitt 1976 critical values.
 */
function adApproxPValue(A2: number): number {
  if (!isFinite(A2) || A2 <= 0) return 1;
  // Critical values: (A², p)
  const table: Array<[number, number]> = [
    [0.0, 1.0],
    [1.933, 0.10],
    [2.492, 0.05],
    [3.070, 0.025],
    [3.878, 0.01],
    [10.0, 0.001],
  ];
  if (A2 >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 1; i < table.length; i++) {
    if (A2 < table[i][0]) {
      const [x0, p0] = table[i - 1];
      const [x1, p1] = table[i];
      const t = (A2 - x0) / (x1 - x0);
      return p0 + t * (p1 - p0);
    }
  }
  return 0.001;
}

/**
 * Compare the simulator's terminal-PnL distribution against an empirical
 * bootstrap of historical PnL summed to the same horizon. This is the
 * "does the engine produce the right population?" check.
 */
export function goodnessOfFit(
  simulatedTerminalPnL: number[],
  historicalPerStepPnL: number[],
  horizon: number,
  bootstrapSamples = 2000,
  rng: () => number = Math.random
): GoodnessOfFitResult {
  const empirical: number[] = new Array(bootstrapSamples);
  const k = historicalPerStepPnL.length;
  for (let s = 0; s < bootstrapSamples; s++) {
    let sum = 0;
    for (let t = 0; t < horizon; t++) {
      sum += historicalPerStepPnL[(rng() * k) | 0];
    }
    empirical[s] = sum;
  }
  const ks = ksTwoSample(simulatedTerminalPnL, empirical);
  const ad = adTwoSample(simulatedTerminalPnL, empirical);

  let verdict: TestVerdict = 'pass';
  if (ks.p < 0.01 || ad.p <= 0.01) verdict = 'fail';
  else if (ks.p < 0.05 || ad.p <= 0.05) verdict = 'warn';

  const note =
    verdict === 'pass'
      ? 'Simulated terminal-PnL is statistically indistinguishable from an iid bootstrap of historical PnL at the same horizon.'
      : verdict === 'warn'
      ? 'Borderline distributional match between simulator and historical bootstrap. Investigate model assumptions.'
      : 'Simulator output deviates significantly from empirical bootstrap. Review resampling mode and parametric assumptions.';

  return {
    ksStatistic: ks.D,
    ksPValue: ks.p,
    adStatistic: ad.A2,
    adPValue: ad.p,
    verdict,
    note,
  };
}

// ─── 2. Serial dependence (Ljung–Box) ────────────────────────────────────────

/** Sample autocorrelation at lag k of x (mean-corrected). */
export function autocorr(x: number[], k: number): number {
  const n = x.length;
  if (n <= k) return 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  let num = 0, den = 0;
  for (let i = 0; i < n - k; i++) num += (x[i] - mean) * (x[i + k] - mean);
  for (let i = 0; i < n; i++) den += (x[i] - mean) ** 2;
  return den > 0 ? num / den : 0;
}

/** Ljung–Box Q statistic on first `h` autocorrelations. Approx chi²(h). */
export function ljungBox(x: number[], h: number): { Q: number; p: number } {
  const n = x.length;
  if (n <= h + 1) return { Q: 0, p: 1 };
  let Q = 0;
  for (let k = 1; k <= h; k++) {
    const r = autocorr(x, k);
    Q += (r * r) / (n - k);
  }
  Q *= n * (n + 2);
  const p = chiSquareUpperTail(Q, h);
  return { Q, p };
}

export function serialDependence(
  empiricalIncrements: number[],
  simulatedIncrements: number[],
  lags = 10
): SerialDependenceResult {
  const emp = ljungBox(empiricalIncrements, lags);
  const sim = ljungBox(simulatedIncrements, lags);

  // We expect the resampler to reproduce the empirical p-value qualitatively.
  // If the empirical series is iid (high p) and the simulator output also is, we pass.
  // If the empirical has structure (low p) but the simulator doesn't preserve it (high p),
  // that is the textbook block-vs-iid mismatch.
  let verdict: TestVerdict = 'pass';
  let note =
    'Resampler preserves the autocorrelation profile of the empirical PnL series.';
  const empHasStructure = emp.p < 0.05;
  const simHasStructure = sim.p < 0.05;
  if (empHasStructure && !simHasStructure) {
    verdict = 'warn';
    note =
      'Empirical PnL exhibits serial correlation but simulated paths do not. Consider block_bootstrap or GARCH.';
  } else if (!empHasStructure && simHasStructure) {
    verdict = 'warn';
    note =
      'Simulated paths show serial structure that is not present in the empirical data. Check block-length tuning.';
  }

  return {
    empiricalQ: emp.Q,
    empiricalPValue: emp.p,
    simulatedQ: sim.Q,
    simulatedPValue: sim.p,
    lags,
    verdict,
    note,
  };
}

// ─── 3. VaR backtests (Kupiec POF + Christoffersen independence) ─────────────

/**
 * Apply a one-step VaR forecast across a historical PnL series and count
 * breaches. Forecast at time t uses a rolling window of length `window`
 * preceding observations and the empirical (1-c) quantile.
 *
 * Returns a per-time indicator series I_t ∈ {0,1}.
 */
export function rollingVaRBreaches(
  pnl: number[],
  window: number,
  confidence: number
): number[] {
  const breaches: number[] = [];
  for (let t = window; t < pnl.length; t++) {
    const slice = pnl.slice(t - window, t).sort((a, b) => a - b);
    const idx = Math.max(0, Math.floor(slice.length * (1 - confidence)));
    const var_t = slice[idx];
    breaches.push(pnl[t] < var_t ? 1 : 0);
  }
  return breaches;
}

/** Kupiec proportion-of-failures LR statistic. */
export function kupiecPOF(breaches: number[], confidence: number): { LR: number; p: number } {
  const n = breaches.length;
  if (n === 0) return { LR: 0, p: 1 };
  const x = breaches.reduce((s, v) => s + v, 0);
  const p0 = 1 - confidence;
  const piHat = x / n;
  if (piHat === 0 || piHat === 1) {
    // Likelihood under null
    const lnL0 = x * Math.log(p0) + (n - x) * Math.log(1 - p0);
    const LR = -2 * lnL0; // alt LL is 0
    return { LR, p: chiSquareUpperTail(LR, 1) };
  }
  const lnL0 = x * Math.log(p0) + (n - x) * Math.log(1 - p0);
  const lnL1 = x * Math.log(piHat) + (n - x) * Math.log(1 - piHat);
  const LR = -2 * (lnL0 - lnL1);
  return { LR, p: chiSquareUpperTail(LR, 1) };
}

/** Christoffersen Markov-1 independence test on the breach sequence. */
export function christoffersenIndependence(breaches: number[]): { LR: number; p: number } {
  const n = breaches.length;
  if (n < 2) return { LR: 0, p: 1 };
  let n00 = 0, n01 = 0, n10 = 0, n11 = 0;
  for (let i = 1; i < n; i++) {
    const a = breaches[i - 1], b = breaches[i];
    if (a === 0 && b === 0) n00++;
    else if (a === 0 && b === 1) n01++;
    else if (a === 1 && b === 0) n10++;
    else n11++;
  }
  const n0 = n00 + n01;
  const n1 = n10 + n11;
  const total = n0 + n1;
  const pi = (n01 + n11) / total;
  const pi01 = n0 > 0 ? n01 / n0 : 0;
  const pi11 = n1 > 0 ? n11 / n1 : 0;
  // Degenerate: no breaches at all
  if (pi === 0 || pi === 1) return { LR: 0, p: 1 };
  // Log-likelihoods, guarding zeroes
  const safeLog = (p: number) => (p > 0 ? Math.log(p) : 0);
  const lnL0 =
    (n00 + n10) * safeLog(1 - pi) + (n01 + n11) * safeLog(pi);
  const lnL1 =
    n00 * safeLog(1 - pi01) +
    n01 * safeLog(pi01) +
    n10 * safeLog(1 - pi11) +
    n11 * safeLog(pi11);
  const LR = -2 * (lnL0 - lnL1);
  return { LR, p: chiSquareUpperTail(LR, 1) };
}

export function varBacktest(
  pnl: number[],
  confidence = 0.95,
  window = 100
): VaRBacktestResult | null {
  if (pnl.length < window + 30) return null;
  const breaches = rollingVaRBreaches(pnl, window, confidence);
  const x = breaches.reduce((s, v) => s + v, 0);
  const expected = breaches.length * (1 - confidence);
  const kup = kupiecPOF(breaches, confidence);
  const chr = christoffersenIndependence(breaches);

  let verdict: TestVerdict = 'pass';
  if (kup.p < 0.01 || chr.p < 0.01) verdict = 'fail';
  else if (kup.p < 0.05 || chr.p < 0.05) verdict = 'warn';

  const note =
    verdict === 'pass'
      ? 'Empirical VaR breaches occur at the expected rate and are independently distributed.'
      : verdict === 'warn'
      ? 'Borderline VaR backtest. Check breach clustering and recalibrate window length.'
      : 'VaR forecasts fail Kupiec and/or Christoffersen tests on the historical series — model is biased or breaches cluster.';

  return {
    observations: breaches.length,
    breaches: x,
    expectedBreaches: expected,
    confidence,
    kupiecStatistic: kup.LR,
    kupiecPValue: kup.p,
    christoffersenStatistic: chr.LR,
    christoffersenPValue: chr.p,
    verdict,
    note,
  };
}

// ─── 4. PIT calibration ──────────────────────────────────────────────────────

/**
 * For each historical realisation, compute U_t = F̂(x_t) where F̂ is the
 * empirical CDF estimated from the preceding `window` observations.
 * Under a well-specified one-step model, {U_t} is iid Uniform(0,1).
 *
 * We bin into `bins` equal-width buckets and apply a chi-square uniformity test.
 */
export function pitCalibration(
  pnl: number[],
  window = 100,
  bins = 10
): PITCalibrationResult | null {
  if (pnl.length < window + 30) return null;
  const u: number[] = [];
  for (let t = window; t < pnl.length; t++) {
    const slice = pnl.slice(t - window, t).sort((a, b) => a - b);
    // Empirical CDF with mid-rank to avoid ties at 0/1 boundaries
    let count = 0;
    for (const v of slice) if (v <= pnl[t]) count++;
    const Ut = (count - 0.5) / slice.length;
    u.push(Math.max(0, Math.min(1, Ut)));
  }
  const counts = new Array(bins).fill(0);
  for (const v of u) {
    const idx = Math.min(bins - 1, Math.floor(v * bins));
    counts[idx]++;
  }
  const expected = u.length / bins;
  let chi2 = 0;
  for (const c of counts) chi2 += ((c - expected) ** 2) / expected;
  const p = chiSquareUpperTail(chi2, bins - 1);

  let verdict: TestVerdict = 'pass';
  if (p < 0.01) verdict = 'fail';
  else if (p < 0.05) verdict = 'warn';

  const note =
    verdict === 'pass'
      ? 'PIT histogram is consistent with Uniform(0,1). One-step distributional forecasts are well-calibrated.'
      : verdict === 'warn'
      ? 'PIT histogram shows mild deviation from uniformity. Possible miscalibration in the tails.'
      : 'PIT histogram rejects uniformity. The empirical distribution is poorly calibrated — investigate window length and data stationarity.';

  return { chiSqStatistic: chi2, pValue: p, bins, verdict, note };
}

// ─── Roll-up ─────────────────────────────────────────────────────────────────

function worst(...vs: TestVerdict[]): TestVerdict {
  if (vs.includes('fail')) return 'fail';
  if (vs.includes('warn')) return 'warn';
  return 'pass';
}

export type ValidationInputs = {
  /** Historical per-step PnL (absolute $). */
  historicalPnL: number[];
  /** Simulator's terminal-PnL distribution (one number per simulated path). */
  simulatedTerminalPnL: number[];
  /** A representative simulated path's first-difference series, for serial-dep test. */
  simulatedIncrements?: number[];
  /** Horizon used by the simulator (number of trades). */
  horizon: number;
  /** Optional reproducible RNG. */
  rng?: () => number;
};

export function buildValidationReport(input: ValidationInputs): ModelValidationReport {
  const gof =
    input.historicalPnL.length >= 10 && input.simulatedTerminalPnL.length >= 100
      ? goodnessOfFit(
          input.simulatedTerminalPnL,
          input.historicalPnL,
          input.horizon,
          Math.min(2000, input.simulatedTerminalPnL.length),
          input.rng
        )
      : undefined;

  const sd =
    input.simulatedIncrements && input.historicalPnL.length >= 30
      ? serialDependence(input.historicalPnL, input.simulatedIncrements, 10)
      : undefined;

  const vbt = varBacktest(input.historicalPnL, 0.95, 100) ?? undefined;
  const pit = pitCalibration(input.historicalPnL, 100, 10) ?? undefined;

  const verdicts: TestVerdict[] = [];
  if (gof) verdicts.push(gof.verdict);
  if (sd) verdicts.push(sd.verdict);
  if (vbt) verdicts.push(vbt.verdict);
  if (pit) verdicts.push(pit.verdict);
  const overall = verdicts.length ? worst(...verdicts) : 'pass';

  const headline =
    overall === 'pass'
      ? 'Model validation: all checks within tolerance.'
      : overall === 'warn'
      ? 'Model validation: at least one diagnostic borderline. Review notes before external use.'
      : 'Model validation: at least one diagnostic failed. Engine output should not be used for production risk reporting without remediation.';

  return {
    goodnessOfFit: gof,
    serialDependence: sd,
    varBacktest: vbt,
    pitCalibration: pit,
    overallVerdict: overall,
    headline,
  };
}
