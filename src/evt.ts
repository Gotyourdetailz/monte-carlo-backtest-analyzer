/**
 * evt.ts
 *
 * Extreme Value Theory utilities for tail risk.
 *   - Hill estimator for the tail index of a heavy-tailed loss distribution
 *   - Peaks-over-threshold (POT) Generalized Pareto fit via probability-
 *     weighted moments (PWM, Hosking 1985), which is more robust on small
 *     samples than MLE and needs no numerical optimisation.
 *   - EVT-based VaR and Expected Shortfall (Conditional VaR) at any
 *     confidence level higher than the threshold quantile.
 *
 * Pure TS, no external deps.
 *
 * Convention: we work on *losses* expressed as positive numbers. Pass in
 * the absolute value of negative PnLs. The library never silently flips
 * signs for you.
 */

// ─── Hill estimator ──────────────────────────────────────────────────────────

/**
 * Hill (1975) estimator of the tail index α for a Pareto-type tail.
 * α̂_k = 1 / ( (1/k) Σ_{i=1..k} ln(X_(n-i+1)) - ln(X_(n-k)) )
 *
 * - `losses` should be strictly positive losses.
 * - `k` is the number of upper-order statistics to use. A common
 *   default is min(n/10, 250). Lower k → more variance, less bias;
 *   higher k → more bias, less variance.
 *
 * Returns NaN if there are not enough positive losses or k is invalid.
 */
export function hillIndex(losses: number[], k?: number): { alpha: number; k: number } {
  const positive = losses.filter((v) => v > 0).sort((a, b) => a - b);
  const n = positive.length;
  if (n < 20) return { alpha: NaN, k: 0 };
  const kk = k ?? Math.max(20, Math.min(250, Math.floor(n / 10)));
  if (kk <= 1 || kk >= n) return { alpha: NaN, k: kk };

  const threshold = Math.log(positive[n - kk - 1]);
  let sum = 0;
  for (let i = 0; i < kk; i++) {
    sum += Math.log(positive[n - 1 - i]) - threshold;
  }
  const meanLog = sum / kk;
  if (meanLog <= 0) return { alpha: NaN, k: kk };
  return { alpha: 1 / meanLog, k: kk };
}

// ─── Generalized Pareto (POT) ────────────────────────────────────────────────

export type GPDFit = {
  /** Threshold u such that exceedances are X_i - u | X_i > u. */
  threshold: number;
  /** Shape parameter ξ (xi). ξ > 0 ⇒ heavy tail, ξ = 0 ⇒ exponential, ξ < 0 ⇒ bounded. */
  xi: number;
  /** Scale parameter β (beta). */
  beta: number;
  /** Number of exceedances used in the fit. */
  nu: number;
  /** Total sample size. */
  n: number;
  /** Quantile of the threshold u in the empirical CDF. */
  thresholdQuantile: number;
};

/**
 * Fit GPD parameters to peaks above a chosen threshold using the
 * probability-weighted moments estimator (Hosking & Wallis 1987).
 *
 *   ξ̂ = 2 - m / (m - 2 a₁)
 *   β̂ = 2 m a₁ / (m - 2 a₁)
 *
 * where m is the sample mean of exceedances and a₁ is the first PWM.
 * PWM fitting avoids the convergence issues MLE has when ξ < -0.5,
 * and is well-suited to financial loss tails.
 */
export function fitGPD(losses: number[], thresholdQuantile = 0.9): GPDFit | null {
  const sorted = losses.filter((v) => isFinite(v)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 50) return null;
  const idx = Math.min(n - 2, Math.max(1, Math.floor(n * thresholdQuantile)));
  const u = sorted[idx];
  const exceed: number[] = [];
  for (const v of sorted) if (v > u) exceed.push(v - u);
  const nu = exceed.length;
  if (nu < 25) return null;

  // Sample mean
  let m = 0;
  for (const e of exceed) m += e;
  m /= nu;

  // First probability-weighted moment a₁
  // a₁ = (1/nu) Σ (1 - F_emp(x_i)) x_i with F_emp using plotting positions p_i = (i - 0.35)/nu
  // Equivalently sort exceedances ascending; a₁ = (1/nu) Σ x_(i) · (1 - p_i).
  const eSorted = [...exceed].sort((a, b) => a - b);
  let a1 = 0;
  for (let i = 0; i < nu; i++) {
    const p = (i + 1 - 0.35) / nu;
    a1 += eSorted[i] * (1 - p);
  }
  a1 /= nu;

  const denom = m - 2 * a1;
  if (denom === 0) return null;
  const xi = 2 - m / denom;
  const beta = (2 * m * a1) / denom;
  if (!isFinite(xi) || !isFinite(beta) || beta <= 0) return null;

  return { threshold: u, xi, beta, nu, n, thresholdQuantile };
}

/**
 * EVT-based VaR at confidence level p > thresholdQuantile.
 * Inverts the GPD survival function:
 *
 *   VaR_p = u + (β/ξ) · ((n/nu · (1 - p))^(-ξ) - 1)   if ξ ≠ 0
 *   VaR_p = u - β · ln( n/nu · (1 - p) )              if ξ = 0
 */
export function evtVaR(fit: GPDFit, p: number): number {
  if (p <= fit.thresholdQuantile) return NaN;
  const ratio = (fit.n / fit.nu) * (1 - p);
  if (Math.abs(fit.xi) < 1e-6) {
    return fit.threshold - fit.beta * Math.log(ratio);
  }
  return fit.threshold + (fit.beta / fit.xi) * (Math.pow(ratio, -fit.xi) - 1);
}

/**
 * EVT-based Expected Shortfall (mean excess beyond VaR_p).
 * For ξ < 1 (so the mean exists):
 *   ES_p = (VaR_p + β - ξ u) / (1 - ξ)
 */
export function evtCVaR(fit: GPDFit, p: number): number {
  if (fit.xi >= 1) return NaN; // mean does not exist
  const v = evtVaR(fit, p);
  return (v + fit.beta - fit.xi * fit.threshold) / (1 - fit.xi);
}

// ─── Convenience roll-up for the report ──────────────────────────────────────

export type EVTReport = {
  hill: { alpha: number; k: number };
  gpd: GPDFit | null;
  /** EVT-VaR at 95% and 99%, expressed as positive losses. */
  varEvt95: number;
  varEvt99: number;
  cvarEvt95: number;
  cvarEvt99: number;
  /** Empirical (historical) reference values at the same confidence. */
  varEmpirical95: number;
  varEmpirical99: number;
  cvarEmpirical95: number;
  cvarEmpirical99: number;
  /** Heavy-tail flag: ξ > 0.1 or α < 4 ⇒ caution. */
  heavyTail: boolean;
  note: string;
};

function empiricalVaR(losses: number[], p: number): number {
  const sorted = [...losses].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[idx];
}

function empiricalCVaR(losses: number[], p: number): number {
  const sorted = [...losses].sort((a, b) => a - b);
  const idx = Math.max(1, Math.floor(sorted.length * p));
  const tail = sorted.slice(idx);
  if (tail.length === 0) return sorted[sorted.length - 1] ?? 0;
  return tail.reduce((s, v) => s + v, 0) / tail.length;
}

/**
 * Build an EVT report from raw PnL data.
 * Internally converts negative PnLs to positive losses.
 */
export function buildEVTReport(pnl: number[], thresholdQuantile = 0.9): EVTReport {
  const losses = pnl.filter((v) => v < 0).map((v) => -v);

  const hill = hillIndex(losses);
  const gpd = fitGPD(losses, thresholdQuantile);

  let varEvt95 = NaN, varEvt99 = NaN, cvarEvt95 = NaN, cvarEvt99 = NaN;
  if (gpd) {
    if (gpd.thresholdQuantile <= 0.95) varEvt95 = evtVaR(gpd, 0.95);
    varEvt99 = evtVaR(gpd, 0.99);
    if (gpd.thresholdQuantile <= 0.95) cvarEvt95 = evtCVaR(gpd, 0.95);
    cvarEvt99 = evtCVaR(gpd, 0.99);
  }

  const varEmpirical95 = empiricalVaR(losses, 0.95);
  const varEmpirical99 = empiricalVaR(losses, 0.99);
  const cvarEmpirical95 = empiricalCVaR(losses, 0.95);
  const cvarEmpirical99 = empiricalCVaR(losses, 0.99);

  const heavyTail =
    (isFinite(hill.alpha) && hill.alpha < 4) ||
    (gpd ? gpd.xi > 0.1 : false);

  const note = !gpd
    ? 'Insufficient losses for GPD fit. EVT estimates suppressed; using empirical values only.'
    : heavyTail
    ? `Heavy-tailed loss distribution (ξ = ${gpd.xi.toFixed(2)}, Hill α = ${hill.alpha.toFixed(2)}). EVT-CVaR materially exceeds empirical CVaR — historical extremes likely understate true tail risk.`
    : `Loss tail is well-behaved (ξ = ${gpd.xi.toFixed(2)}). EVT and empirical tail estimates agree within sampling error.`;

  return {
    hill,
    gpd,
    varEvt95,
    varEvt99,
    cvarEvt95,
    cvarEvt99,
    varEmpirical95,
    varEmpirical99,
    cvarEmpirical95,
    cvarEmpirical99,
    heavyTail,
    note,
  };
}
