import { randomNormal, randomChiSquare } from './mathUtils';

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
 * Student-t CDF approximation (Hill 1970 / regularized beta).
 * Sufficient precision for copula rank mapping.
 */
export function studentTCdf(x: number, df: number): number {
  if (df <= 0) return 0.5;
  const t2 = x * x;
  const y = t2 / df;
  // Use relationship to regularized incomplete beta function
  // P(X <= x) = 0.5 + 0.5 * sign(x) * I(df/(df+t²), df/2, 1/2)
  // For a fast approximation, use the normal approximation corrected for df:
  const g1 = 1 / df;
  const g3 = g1 * g1 * g1;
  // Cornish-Fisher expansion for t → z
  const z =
    x *
    (1 -
      g1 / 4 +
      ((7 * g1 * g1) / 32 - g3 * 3) / 8 +
      (x * x * g1 * (-1 / 4 + g1 * 11 / 32)) / (1 + y));
  // Fallback: simple normal CDF of adjusted z
  const adjusted = x * Math.sqrt((df - 2) / df) * (1 + 1 / (4 * df));
  return normalCdf(adjusted);
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
