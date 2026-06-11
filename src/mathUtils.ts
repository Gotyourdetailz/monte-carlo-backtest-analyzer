/** Mulberry32 — fast seeded PRNG for reproducible institutional runs */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleInPlace<T>(arr: T[], random: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Standard Normal Random Generator (Box-Muller transform)
 * Returns a number from N(0, 1)
 */
export function randomNormal(rng: () => number = Math.random): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Chi-Square Random Generator
 * @param k - degrees of freedom
 */
export function randomChiSquare(k: number, rng: () => number = Math.random): number {
  let sum = 0;
  for (let i = 0; i < k; i++) {
    const z = randomNormal(rng);
    sum += z * z;
  }
  return sum;
}

/**
 * Student-t Random Generator
 * @param v - degrees of freedom
 */
export function randomStudentT(v: number, rng: () => number = Math.random): number {
  const z = randomNormal(rng);
  const chi = randomChiSquare(v, rng);
  return z / Math.sqrt(chi / v);
}

/**
 * Calculates mean and standard deviation of an array
 */
export function meanAndStdDev(data: number[]): { mean: number; std: number } {
  const n = data.length;
  if (n === 0) return { mean: 0, std: 0 };
  
  const mean = data.reduce((sum, val) => sum + val, 0) / n;
  
  if (n === 1) return { mean, std: 0 };
  
  const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Calculate Max Drawdown of an equity curve
 */
export function calculateMaxDrawdown(equity: number[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    // A non-positive peak means the account is already wiped out — relative
    // drawdown is undefined there, so cap at 100% instead of emitting
    // Infinity/NaN that would poison downstream percentile metrics.
    const dd = peak > 0 ? (peak - v) / peak : v < peak ? 1 : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

/**
 * Generate a collision-resistant run identifier.
 *
 * Replaces the previous `Date.now()`-based scheme that could collide for
 * sub-runs dispatched within the same millisecond (Requirement 9.9).
 * Uses `crypto.randomUUID()` when available (browsers, Node 19+) and
 * falls back to a `Math.random()`-derived suffix for hosts without the
 * Web Crypto API (e.g. older test environments). The fallback is not
 * cryptographically strong but is sufficient for run-id uniqueness within
 * a single audit session.
 */
export function generateRunId(prefix: 'run' | 'portfolio'): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'mc-' + Math.random().toString(36).slice(2, 14);
  return `${prefix}_${uuid}`;
}

/**
 * Derive a session-stable 32-bit unsigned seed for engine runs when the
 * caller has not supplied a fixed seed (`useFixedSeed=false`).
 *
 * Requirement 9.3 (F-SD-10): when fixed-seed mode is off, the engine must
 * still persist the *exact* seed it used on `runMeta.randomSeed` so the
 * audit log records `null` only in pre-run config — never in a completed
 * run. This helper produces that seed at run start.
 *
 * Uses `crypto.getRandomValues` when available (browsers, Web Workers,
 * Node 19+) and falls back to a `Math.random()`-derived value for hosts
 * without the Web Crypto API. The fallback is not cryptographically
 * strong, but the only consumer is `mulberry32` (TS-side) and Rust's
 * `StdRng::seed_from_u64` (WASM kernel) — neither requires a CSPRNG seed.
 *
 * Returned value is a uint32 in the range `[0, 2^32 - 1]`.
 */
export function deriveSessionSeed(): number {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/**
 * 32-bit FNV-1a hash of a UTF-16 code-unit sequence.
 *
 * Used to derive deterministic, segment-distinct sub-seeds in
 * `portfolioEngine.buildPortfolioRegimeBreakdown` so per-regime sub-runs
 * are reproducible *and* avoid sharing the parent run's PRNG sequence
 * (Requirement 9.6). FNV-1a is chosen over a cryptographic hash because:
 *   1. We only need a fast, well-mixed 32-bit avalanche, not collision
 *      resistance against an adversary.
 *   2. It is dependency-free and fully synchronous (unlike
 *      `crypto.subtle.digest`, which is async and overkill here).
 *
 * Polynomial constants (per the FNV-1a specification, 32-bit variant):
 *   - `offset` = `0x811c9dc5` — the FNV offset basis.
 *   - `prime`  = `0x01000193` — the FNV prime (`2^24 + 2^8 + 0x93`).
 *
 * Multiplication uses `Math.imul` to keep the product 32-bit, and every
 * step is forced unsigned via `>>> 0`. The hash iterates over
 * `charCodeAt(i)` (UTF-16 code units), which is sufficient for the
 * ASCII-dominated `RegimeSegmentId` strings used by the engine; callers
 * that need full Unicode normalization should preprocess accordingly.
 *
 * Returned value is a uint32 in the range `[0, 2^32 - 1]`.
 */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
