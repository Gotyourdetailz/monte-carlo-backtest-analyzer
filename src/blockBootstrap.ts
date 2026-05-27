/**
 * Stationary Block Bootstrap for time-series PnL data.
 *
 * Unlike iid bootstrap or permutation, block bootstrap preserves the
 * temporal dependence structure (volatility clustering, mean-reversion)
 * by resampling contiguous blocks whose lengths follow a Geometric
 * distribution (Politis & Romano, 1994).
 *
 * @module blockBootstrap
 */

/**
 * Draw a single variate from a Geometric(p) distribution.
 *
 * The result is the number of trials until (and including) the first
 * success: minimum value is 1, expected value is 1/p.
 *
 * @param p   - Success probability, must be in (0, 1]
 * @param rng - Uniform [0,1) random number generator
 * @returns A positive integer ≥ 1
 */
function geometricRandom(p: number, rng: () => number): number {
  // Inverse-CDF method: ⌈ ln(U) / ln(1-p) ⌉
  // Guard: if p ≈ 1 every block has length 1 (iid bootstrap)
  if (p >= 1) return 1;
  return Math.ceil(Math.log(rng() || 1e-15) / Math.log(1 - p));
}

/**
 * Stationary Block Bootstrap resampling.
 *
 * Produces a new series of length `nDraws` by concatenating randomly
 * positioned, geometrically-lengthed blocks from `data`. The source
 * series is treated as circular so blocks that run past the end wrap
 * back to the beginning, ensuring every observation has equal marginal
 * probability of inclusion.
 *
 * @param data           - Source PnL values (the historical trade series)
 * @param nDraws         - Number of values to emit (may differ from data.length)
 * @param avgBlockLength - Expected block length; controls how much
 *                         temporal structure is preserved. Larger values
 *                         keep longer runs intact.  Must be ≥ 1.
 * @param rng            - Uniform [0,1) random number generator
 * @returns An array of `nDraws` resampled PnL values
 *
 * @example
 * ```ts
 * const rng = createSeededRng(42);
 * const resampled = stationaryBlockBootstrap(pnl, pnl.length, 5, rng);
 * ```
 */
export function stationaryBlockBootstrap(
  data: number[],
  nDraws: number,
  avgBlockLength: number,
  rng: () => number,
): number[] {
  const n = data.length;
  if (n === 0) return [];
  if (nDraws <= 0) return [];

  // p = 1 / E[block length]  — parameter of the geometric distribution
  const p = 1 / Math.max(1, avgBlockLength);

  const result: number[] = new Array(nDraws);
  let filled = 0;

  while (filled < nDraws) {
    // Random block length (geometric) and random start position (uniform)
    const blockLen = geometricRandom(p, rng);
    const start = Math.floor(rng() * n);

    // Copy up to `remaining` values from the circular source
    const remaining = nDraws - filled;
    const toCopy = Math.min(blockLen, remaining);

    for (let j = 0; j < toCopy; j++) {
      result[filled++] = data[(start + j) % n];
    }
  }

  return result;
}

/**
 * Result of the optimal block length estimator.
 */
export interface OptimalBlockLengthResult {
  /** Recommended average block length for the stationary bootstrap */
  avgBlockLength: number;
  /** Lag-1 sample autocorrelation of the input series */
  lag1Autocorrelation: number;
}

/**
 * Estimate the optimal average block length for the stationary bootstrap.
 *
 * Uses a simple lag-1 autocorrelation heuristic:
 * - If |ρ₁| < 0.05 the series looks iid → block length = 1 (plain bootstrap).
 * - Otherwise use the classical n^(1/3) rule-of-thumb, capped at n/4
 *   to avoid blocks that span most of the series.
 *
 * This is intentionally conservative and fast.  For production-grade
 * estimation consider Politis & White (2004) / Patton, Politis &
 * White (2009) plug-in selectors.
 *
 * @param data - Array of PnL values (at least 2 elements for a
 *               meaningful autocorrelation)
 * @returns Recommended block length and the estimated lag-1 autocorrelation
 *
 * @example
 * ```ts
 * const { avgBlockLength } = optimalBlockLength(pnl);
 * const resampled = stationaryBlockBootstrap(pnl, pnl.length, avgBlockLength, rng);
 * ```
 */
export function optimalBlockLength(data: number[]): OptimalBlockLengthResult {
  const n = data.length;

  // Not enough data — fall back to iid
  if (n < 2) {
    return { avgBlockLength: 1, lag1Autocorrelation: 0 };
  }

  // Compute sample mean
  let sum = 0;
  for (let i = 0; i < n; i++) sum += data[i];
  const mean = sum / n;

  // Compute lag-0 and lag-1 autocovariance
  let gamma0 = 0; // Var(X)
  let gamma1 = 0; // Cov(X_t, X_{t+1})
  for (let i = 0; i < n; i++) {
    const d = data[i] - mean;
    gamma0 += d * d;
    if (i < n - 1) {
      gamma1 += d * (data[i + 1] - mean);
    }
  }
  gamma0 /= n;
  gamma1 /= n; // biased estimator, consistent for stationary series

  const rho = gamma0 > 0 ? gamma1 / gamma0 : 0;

  // Decision rule
  if (Math.abs(rho) < 0.05) {
    return { avgBlockLength: 1, lag1Autocorrelation: rho };
  }

  // n^(1/3) heuristic, capped at n/4
  const candidate = Math.ceil(Math.pow(n, 1 / 3));
  const maxBlock = Math.max(1, Math.floor(n / 4));
  const avgBlockLength = Math.min(candidate, maxBlock);

  return { avgBlockLength, lag1Autocorrelation: rho };
}
