/**
 * GARCH(1,1) volatility model — time-varying variance for financial returns.
 *
 * σ²_t = ω + α·ε²_{t-1} + β·σ²_{t-1}
 *
 * Fitted via MLE with grid search + Nelder-Mead refinement.
 * Stationarity constraint: α + β < 1.
 */

import { meanAndStdDev } from './mathUtils';

export type GarchParams = {
  omega: number;    // Baseline variance constant
  alpha: number;    // ARCH coefficient (shock sensitivity)
  beta: number;     // GARCH coefficient (persistence)
  mu: number;       // Mean return
  unconditionalVar: number;  // ω / (1 - α - β)
  persistence: number;       // α + β (volatility half-life indicator)
  logLikelihood: number;
  aic: number;
  bic: number;
};

export type GarchFitResult = {
  params: GarchParams;
  /** Conditional variances at each time step (same length as input) */
  conditionalVars: number[];
  /** Standardized residuals: ε_t / σ_t */
  standardizedResiduals: number[];
};

/**
 * Fit GARCH(1,1) to a return series via MLE.
 * Uses grid search over (α, β) followed by coordinate descent refinement.
 */
export function fitGarch11(returns: number[]): GarchFitResult {
  const n = returns.length;
  if (n < 20) {
    // Not enough data for meaningful GARCH fit
    const { mean, std } = meanAndStdDev(returns);
    const variance = std * std;
    return {
      params: {
        omega: variance,
        alpha: 0,
        beta: 0,
        mu: mean,
        unconditionalVar: variance,
        persistence: 0,
        logLikelihood: -Infinity,
        aic: Infinity,
        bic: Infinity,
      },
      conditionalVars: new Array(n).fill(variance),
      standardizedResiduals: returns.map(r => (r - mean) / std),
    };
  }

  const { mean: mu } = meanAndStdDev(returns);
  const residuals = returns.map(r => r - mu);
  const sampleVar = residuals.reduce((s, r) => s + r * r, 0) / n;

  // ─── Grid search ───
  let bestLL = -Infinity;
  let bestAlpha = 0.05;
  let bestBeta = 0.85;

  const alphaGrid = [0.01, 0.03, 0.05, 0.08, 0.10, 0.15, 0.20, 0.25, 0.30];
  const betaGrid = [0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.88, 0.90, 0.92, 0.94];

  for (const a of alphaGrid) {
    for (const b of betaGrid) {
      if (a + b >= 0.999) continue; // stationarity constraint
      const omega = sampleVar * (1 - a - b);
      if (omega <= 0) continue;

      const ll = garchLogLikelihood(residuals, omega, a, b, sampleVar);
      if (ll > bestLL) {
        bestLL = ll;
        bestAlpha = a;
        bestBeta = b;
      }
    }
  }

  // ─── Coordinate descent refinement ───
  const step = 0.005;
  for (let iter = 0; iter < 50; iter++) {
    let improved = false;

    for (const da of [-step, 0, step]) {
      for (const db of [-step, 0, step]) {
        if (da === 0 && db === 0) continue;
        const a2 = bestAlpha + da;
        const b2 = bestBeta + db;
        if (a2 <= 0.001 || b2 <= 0.001 || a2 + b2 >= 0.999) continue;
        const omega2 = sampleVar * (1 - a2 - b2);
        if (omega2 <= 0) continue;

        const ll = garchLogLikelihood(residuals, omega2, a2, b2, sampleVar);
        if (ll > bestLL) {
          bestLL = ll;
          bestAlpha = a2;
          bestBeta = b2;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  const bestOmega = sampleVar * (1 - bestAlpha - bestBeta);
  const persistence = bestAlpha + bestBeta;
  const unconditionalVar = persistence < 1 ? bestOmega / (1 - persistence) : sampleVar;

  // Compute conditional variances
  const conditionalVars = computeConditionalVars(residuals, bestOmega, bestAlpha, bestBeta, sampleVar);
  const standardizedResiduals = residuals.map((r, i) => r / Math.sqrt(conditionalVars[i]));

  // AIC/BIC (3 params: omega, alpha, beta)
  const k = 3;
  const aic = -2 * bestLL + 2 * k;
  const bic = -2 * bestLL + k * Math.log(n);

  return {
    params: {
      omega: bestOmega,
      alpha: bestAlpha,
      beta: bestBeta,
      mu,
      unconditionalVar,
      persistence,
      logLikelihood: bestLL,
      aic,
      bic,
    },
    conditionalVars,
    standardizedResiduals,
  };
}

/**
 * Compute log-likelihood for GARCH(1,1) under Gaussian innovations.
 */
function garchLogLikelihood(
  residuals: number[], omega: number, alpha: number, beta: number, initVar: number
): number {
  const n = residuals.length;
  let ll = 0;
  let h = initVar; // initial conditional variance

  for (let t = 0; t < n; t++) {
    if (h <= 0) return -Infinity;
    ll += -0.5 * (Math.log(2 * Math.PI) + Math.log(h) + (residuals[t] * residuals[t]) / h);

    // Update variance for next step
    h = omega + alpha * residuals[t] * residuals[t] + beta * h;
  }

  return ll;
}

/**
 * Compute conditional variance series.
 */
function computeConditionalVars(
  residuals: number[], omega: number, alpha: number, beta: number, initVar: number
): number[] {
  const n = residuals.length;
  const vars: number[] = new Array(n);
  let h = initVar;

  for (let t = 0; t < n; t++) {
    vars[t] = h;
    h = omega + alpha * residuals[t] * residuals[t] + beta * h;
  }

  return vars;
}

/**
 * Simulate a PnL path using the fitted GARCH(1,1) model.
 * Innovation z_t can be Gaussian or Student-t.
 */
export function simulateGarchPath(
  params: GarchParams,
  nSteps: number,
  rng: () => number,
  innovationDf?: number // if provided, use Student-t innovations
): number[] {
  const { omega, alpha, beta, mu, unconditionalVar } = params;
  const path: number[] = new Array(nSteps);
  let h = unconditionalVar; // start from unconditional variance
  let prevEps = 0;

  for (let t = 0; t < nSteps; t++) {
    // Update conditional variance
    h = omega + alpha * prevEps * prevEps + beta * h;
    if (h < 1e-12) h = 1e-12; // floor to avoid numerical issues

    // Draw innovation
    const z = innovationDf != null && innovationDf > 2
      ? sampleStudentT(innovationDf, rng)
      : boxMullerNormal(rng);

    const eps = Math.sqrt(h) * z;
    path[t] = mu + eps;
    prevEps = eps;
  }

  return path;
}

/**
 * Multi-step ahead volatility forecast.
 * σ²_{t+k} = σ²_∞ + (α + β)^k · (σ²_t - σ²_∞)
 */
export function garchVolatilityForecast(
  params: GarchParams,
  currentVar: number,
  horizon: number
): number[] {
  const forecasts: number[] = new Array(horizon);
  const { unconditionalVar, persistence } = params;

  for (let k = 0; k < horizon; k++) {
    forecasts[k] = unconditionalVar + Math.pow(persistence, k + 1) * (currentVar - unconditionalVar);
  }

  return forecasts;
}

// ─── Helper: Box-Muller normal ───
function boxMullerNormal(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-15))) * Math.cos(2 * Math.PI * u2);
}

// ─── Helper: Student-t via Gaussian/Chi-sq ratio ───
function sampleStudentT(df: number, rng: () => number): number {
  const z = boxMullerNormal(rng);
  // Chi-squared(df) = sum of df standard normals squared
  let chi2 = 0;
  for (let i = 0; i < Math.round(df); i++) {
    const n = boxMullerNormal(rng);
    chi2 += n * n;
  }
  return z / Math.sqrt(chi2 / df);
}
