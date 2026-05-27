/**
 * distributionFitting.ts
 *
 * Maximum Likelihood Estimation (MLE) for fitting parametric distributions
 * to trade PnL data. Supports Normal and Student-t distributions with
 * information-criterion-based model selection (AIC / BIC).
 *
 * This replaces the hardcoded Student-t(df=3) in simulationEngine.ts
 * with a data-driven fit.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type FittedDistribution = {
  type: 'normal' | 'student_t';
  mu: number;           // location (mean)
  sigma: number;        // scale (std dev)
  df?: number;          // degrees of freedom (Student-t only)
  logLikelihood: number;
  aic: number;          // Akaike Information Criterion
  bic: number;          // Bayesian Information Criterion
};

export type FitResult = {
  best: FittedDistribution;
  all: FittedDistribution[];
};

// ─── Constants ───────────────────────────────────────────────────────────────

const LOG_2PI = Math.log(2 * Math.PI);

/**
 * Lanczos approximation coefficients (g = 7, n = 7).
 * Provides ~15 digits of precision for Re(z) > 0.5, which is more than
 * sufficient for our Student-t log-PDF calculations.
 */
const LANCZOS_G = 7;
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Natural logarithm of the Gamma function, ln(Γ(x)), using the
 * Lanczos approximation with reflection formula for x < 0.5.
 *
 * Valid for all positive real x. Throws for x ≤ 0 integers (poles of Γ).
 *
 * Reference: Numerical Recipes §6.1; Lanczos, C. (1964).
 */
export function logGamma(x: number): number {
  if (x <= 0 && Number.isInteger(x)) {
    throw new Error(`logGamma: pole at non-positive integer x = ${x}`);
  }

  // Reflection formula: Γ(x)·Γ(1-x) = π / sin(πx)
  if (x < 0.5) {
    // ln(Γ(x)) = ln(π) - ln(sin(πx)) - ln(Γ(1-x))
    return Math.log(Math.PI) - Math.log(Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  }

  const z = x - 1;
  let ag = LANCZOS_COEFFICIENTS[0];
  for (let i = 1; i < LANCZOS_COEFFICIENTS.length; i++) {
    ag += LANCZOS_COEFFICIENTS[i] / (z + i);
  }

  const t = z + LANCZOS_G + 0.5;
  // ln(Γ(z+1)) = 0.5·ln(2π) + (z+0.5)·ln(t) - t + ln(ag)
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(ag);
}

/**
 * Log-PDF of the Normal distribution.
 *
 *   log f(x; μ, σ) = -0.5·ln(2π) - ln(σ) - (x-μ)²/(2σ²)
 */
function normalLogPdf(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / sigma;
  return -0.5 * LOG_2PI - Math.log(sigma) - 0.5 * z * z;
}

/**
 * Log-PDF of the (location-scale) Student-t distribution.
 *
 *   log f(x; μ, σ, ν) = logΓ((ν+1)/2) - logΓ(ν/2) - 0.5·ln(νπσ²)
 *                        - ((ν+1)/2)·ln(1 + ((x-μ)/σ)²/ν)
 *
 * where ν = degrees of freedom (df).
 */
function studentTLogPdf(x: number, mu: number, sigma: number, df: number): number {
  const z = (x - mu) / sigma;
  return (
    logGamma((df + 1) / 2) -
    logGamma(df / 2) -
    0.5 * Math.log(df * Math.PI * sigma * sigma) -
    ((df + 1) / 2) * Math.log(1 + (z * z) / df)
  );
}

/**
 * Compute the total log-likelihood for a dataset under a given log-PDF.
 * Returns -Infinity if any individual term is NaN (safeguard against
 * degenerate parameter combos).
 */
function totalLogLikelihood(
  data: number[],
  logPdfFn: (x: number) => number
): number {
  let ll = 0;
  for (let i = 0; i < data.length; i++) {
    const term = logPdfFn(data[i]);
    if (!isFinite(term)) return -Infinity;
    ll += term;
  }
  return ll;
}

// ─── Fitting Functions ───────────────────────────────────────────────────────

/**
 * Fit a Normal distribution to `data` via Maximum Likelihood Estimation.
 *
 * MLE estimators for the Normal are the well-known closed-form solutions:
 *   μ̂ = sample mean
 *   σ̂ = sample standard deviation (using N denominator for MLE, not N-1)
 *
 * We use the population (N) denominator because that is the true MLE
 * estimator. The Bessel-corrected (N-1) version is unbiased but not MLE.
 */
export function fitNormal(data: number[]): FittedDistribution {
  const n = data.length;
  if (n < 2) {
    throw new Error('fitNormal: need at least 2 data points');
  }

  // MLE mean
  let sum = 0;
  for (let i = 0; i < n; i++) sum += data[i];
  const mu = sum / n;

  // MLE variance (population, N denominator)
  let ssq = 0;
  for (let i = 0; i < n; i++) {
    const d = data[i] - mu;
    ssq += d * d;
  }
  const sigma = Math.sqrt(ssq / n);

  // Guard against zero variance (all identical values)
  const safeSigma = sigma > 0 ? sigma : 1e-10;

  const ll = totalLogLikelihood(data, (x) => normalLogPdf(x, mu, safeSigma));

  const k = 2; // parameters: mu, sigma
  const aic = -2 * ll + 2 * k;
  const bic = -2 * ll + k * Math.log(n);

  return { type: 'normal', mu, sigma: safeSigma, logLikelihood: ll, aic, bic };
}

/**
 * Fit a Student-t (location-scale) distribution to `data` via MLE.
 *
 * Strategy: grid search over df ∈ [1, 30] with step 0.5. For each
 * candidate df, estimate:
 *   μ̂  = sample mean
 *   σ̂  = MLE scale = √((df-2)/df · s²) when df > 2, else sample std
 *
 * The scale adjustment converts from the sample variance (which estimates
 * the Student-t variance = σ²·df/(df-2)) back to the scale parameter σ.
 *
 * Select the df that maximises the log-likelihood. A half-step grid is
 * more than adequate for financial data; the likelihood surface is smooth.
 */
export function fitStudentT(data: number[]): FittedDistribution {
  const n = data.length;
  if (n < 3) {
    throw new Error('fitStudentT: need at least 3 data points');
  }

  // Sample statistics (used as initial estimates for each df candidate)
  let sum = 0;
  for (let i = 0; i < n; i++) sum += data[i];
  const mu = sum / n;

  let ssq = 0;
  for (let i = 0; i < n; i++) {
    const d = data[i] - mu;
    ssq += d * d;
  }
  const sampleVar = ssq / n; // population variance (MLE)
  const sampleStd = Math.sqrt(sampleVar);

  // Guard against zero variance
  const safeSampleStd = sampleStd > 0 ? sampleStd : 1e-10;

  let bestDf = 3;
  let bestSigma = safeSampleStd;
  let bestLL = -Infinity;

  // Grid search: df from 1.0 to 30.0 in steps of 0.5
  for (let df = 1.0; df <= 30.0; df += 0.5) {
    // Estimate scale parameter for this df
    let sigma: number;
    if (df > 2) {
      // Var(t_ν) = σ² · ν/(ν-2), so σ = sampleStd · √((ν-2)/ν)
      sigma = safeSampleStd * Math.sqrt((df - 2) / df);
    } else {
      // Variance is infinite or undefined for df ≤ 2; use sample std as-is
      sigma = safeSampleStd;
    }

    // Ensure sigma stays positive
    if (sigma <= 0) sigma = 1e-10;

    const ll = totalLogLikelihood(data, (x) => studentTLogPdf(x, mu, sigma, df));

    if (ll > bestLL) {
      bestLL = ll;
      bestDf = df;
      bestSigma = sigma;
    }
  }

  const k = 3; // parameters: mu, sigma, df
  const aic = -2 * bestLL + 2 * k;
  const bic = -2 * bestLL + k * Math.log(n);

  return {
    type: 'student_t',
    mu,
    sigma: bestSigma,
    df: bestDf,
    logLikelihood: bestLL,
    aic,
    bic,
  };
}

// ─── Model Selection ─────────────────────────────────────────────────────────

/**
 * Fit both Normal and Student-t distributions to `data` and select the
 * best model according to the Bayesian Information Criterion (BIC).
 *
 * BIC is preferred over AIC here because it penalises model complexity
 * more heavily (k·ln(n) vs 2k), which is appropriate when we want to
 * avoid overfitting a heavy-tailed model to data that is actually Normal.
 *
 * Returns the best fit plus all candidates for UI display / diagnostics.
 */
export function fitBestDistribution(data: number[]): FitResult {
  const normalFit = fitNormal(data);
  const studentTFit = fitStudentT(data);

  const all = [normalFit, studentTFit];

  // Select by lowest BIC (lower = better)
  const best = normalFit.bic <= studentTFit.bic ? normalFit : studentTFit;

  return { best, all };
}
