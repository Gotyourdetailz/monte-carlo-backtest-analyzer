import { randomNormal, randomChiSquare } from './mathUtils';
import { logGamma } from './distributionFitting';

/** Standard normal CDF (Abramowitz & Stegun approximation) */
export function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/** Shrink correlation matrix toward identity until Cholesky succeeds */
export function ensurePsdCorrelation(corr: number[][]): number[][] {
  const k = corr.length;
  const identity = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))
  );

  let blend = 0;
  let matrix = corr.map((row) => [...row]);

  for (let attempt = 0; attempt < 30; attempt++) {
    const L = choleskyLower(matrix);
    if (L) return matrix;
    blend = Math.min(0.5, blend + 0.02);
    matrix = matrix.map((row, i) =>
      row.map((v, j) => (1 - blend) * v + blend * identity[i][j])
    );
  }
  return identity;
}

/** Lower-triangular Cholesky factor L where Σ ≈ L·Lᵀ */
export function choleskyLower(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = matrix[i][j];
      for (let p = 0; p < j; p++) sum -= L[i][p] * L[j][p];
      if (i === j) {
        if (sum <= 1e-12) return null;
        L[i][j] = Math.sqrt(sum);
      } else {
        if (Math.abs(L[j][j]) < 1e-12) return null;
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/** Correlated standard normals z = L·ε */
export function drawCorrelatedNormals(
  choleskyL: number[][],
  rng: () => number
): number[] {
  const k = choleskyL.length;
  const eps = Array.from({ length: k }, () => randomNormal(rng));
  const z = Array(k).fill(0);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      z[i] += choleskyL[i][j] * eps[j];
    }
  }
  return z;
}

/**
 * Student-t CDF via the regularized incomplete beta function.
 *
 * For t ≥ 0:  F(t; ν) = 1 - 0.5·I(ν/(ν+t²); ν/2, 1/2)
 * For t < 0:  F(t; ν) = 1 - F(-t; ν)   (symmetry)
 *
 * The regularized incomplete beta `I(x; a, b)` is evaluated via the standard
 * Numerical Recipes continued-fraction expansion (modified Lentz method),
 * with `logGamma` from `distributionFitting.ts` for the normalization.
 *
 * Guards:
 *  - non-finite `x` returns `0.5`
 *  - `df ≤ 0` returns `0.5` (degenerate input)
 *  - the result is always finite and clamped to `[0, 1]` (no `NaN`)
 *
 * Reference values (within ~1e-4):
 *   studentTCdf(2.571, 5)  ≈ 0.975
 *   studentTCdf(2.228, 10) ≈ 0.975
 *   studentTCdf(3.078, 1)  ≈ 0.90
 */
export function studentTCdf(x: number, df: number): number {
  if (!Number.isFinite(x)) return 0.5;
  if (!Number.isFinite(df) || df <= 0) return 0.5;
  if (x === 0) return 0.5;

  // Symmetry: handle the negative tail via the positive one.
  if (x < 0) return 1 - studentTCdf(-x, df);

  // x > 0 from here.
  const t2 = x * x;
  const z = df / (df + t2);          // ∈ (0, 1)
  const ix = regularizedIncompleteBeta(z, df / 2, 0.5);
  const cdf = 1 - 0.5 * ix;
  // Defensive clamp: continued-fraction roundoff can land slightly outside [0,1].
  if (!Number.isFinite(cdf)) return 0.5;
  if (cdf < 0) return 0;
  if (cdf > 1) return 1;
  return cdf;
}

/**
 * Regularized incomplete beta function `I(x; a, b)`.
 *
 * Uses the continued-fraction representation
 *   I(x; a, b) = x^a (1-x)^b / (a · B(a,b)) · CF(x; a, b)
 * with the symmetry trick `I(x; a, b) = 1 - I(1-x; b, a)` applied when
 * `x > (a+1)/(a+b+2)` so the continued fraction always converges quickly.
 *
 * Reference: Numerical Recipes §6.4 (`betai` / `betacf`).
 */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (x >= 1) return 1;

  const lnBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta);

  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/**
 * Modified Lentz's method continued fraction for `I(x; a, b)`.
 * Returns the value of the continued fraction `CF(x; a, b)`.
 */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const MAX_ITER = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;

    // Even step
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;

    // Odd step
    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < EPS) return h;
  }
  return h;
}

/**
 * Correlated Student-t draws for tail-dependent copula.
 * Algorithm: Z = L·ε (correlated normals), then T = Z / sqrt(W/df)
 * where W ~ χ²(df) is a SHARED chi-squared draw across all dimensions.
 * This creates tail dependence: when W is small (rare event),
 * ALL dimensions are scaled up simultaneously → synchronized crashes.
 */
export function drawCorrelatedStudentT(
  choleskyL: number[][],
  df: number,
  rng: () => number
): number[] {
  const z = drawCorrelatedNormals(choleskyL, rng);
  // Shared chi-squared: the key to tail dependence
  const w = randomChiSquare(df, rng);
  const scale = Math.sqrt(w / df);
  // Each t_i = z_i / sqrt(W/df) → marginal Student-t(df)
  return z.map((zi) => zi / scale);
}


function computeRanks(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = Array(values.length).fill(0);
  indexed.forEach((item, rank) => {
    ranks[item.i] = rank;
  });
  return ranks;
}

/**
 * Iman–Conover: impose copula rank correlation on aligned historical windows.
 * Preserves each sleeve's empirical marginal distribution over the horizon.
 * @param copulaType 'gaussian' (default) or 'student_t' for tail dependence
 * @param copulaDf degrees of freedom for Student-t copula (default 5)
 */
export function imanConoverCorrelatedReturns(
  alignedReturns: number[][],
  choleskyL: number[][],
  rng: () => number,
  copulaType: 'gaussian' | 'student_t' = 'gaussian',
  copulaDf: number = 5
): number[][] {
  const horizon = alignedReturns[0].length;

  const correlatedScores: number[][] = Array.from({ length: horizon }, () =>
    copulaType === 'student_t'
      ? drawCorrelatedStudentT(choleskyL, copulaDf, rng)
      : drawCorrelatedNormals(choleskyL, rng)
  );

  return alignedReturns.map((series, j) => {
    const sortedHist = [...series].sort((a, b) => a - b);
    const scores = correlatedScores.map((row) => row[j]);
    const ranks = computeRanks(scores);
    return ranks.map((r) => sortedHist[r]);
  });
}

/**
 * Draw one joint historical scenario: same time index across sleeves (aligned rows).
 * With replacement — terminal portfolio PnL varies across simulations.
 */
export function drawJointHistoricalRow(
  returnPools: number[][],
  alignedHorizon: number,
  choleskyL: number[][],
  rng: () => number
): number[] {
  const z = drawCorrelatedNormals(choleskyL, rng);
  const u = normalCdf(z[0]);
  const idx = Math.min(alignedHorizon - 1, Math.max(0, Math.floor(u * alignedHorizon)));
  return returnPools.map((pool) => pool[idx]);
}

/**
 * Correlated bootstrap: with replacement per sleeve.
 * When pools share alignedHorizon, uses joint row draws (cross-sectional correlation).
 * @param copulaType 'gaussian' (default) or 'student_t' for tail dependence
 * @param copulaDf degrees of freedom for Student-t copula (default 5)
 */
export function drawCorrelatedReturnStep(
  returnPools: number[][],
  choleskyL: number[][],
  rng: () => number,
  alignedHorizon?: number,
  copulaType: 'gaussian' | 'student_t' = 'gaussian',
  copulaDf: number = 5
): number[] {
  if (
    alignedHorizon &&
    alignedHorizon > 0 &&
    returnPools.every((p) => p.length >= alignedHorizon)
  ) {
    return drawJointHistoricalRow(returnPools, alignedHorizon, choleskyL, rng);
  }
  const z = copulaType === 'student_t'
    ? drawCorrelatedStudentT(choleskyL, copulaDf, rng)
    : drawCorrelatedNormals(choleskyL, rng);

  const cdfFn = copulaType === 'student_t'
    ? (x: number) => studentTCdf(x, copulaDf)
    : normalCdf;

  return z.map((zi, j) => {
    const u = cdfFn(zi);
    const n = returnPools[j].length;
    const idx = Math.min(n - 1, Math.max(0, Math.floor(u * n)));
    return returnPools[j][idx];
  });
}
