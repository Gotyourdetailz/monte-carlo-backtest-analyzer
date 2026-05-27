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
    const dd = (peak - v) / peak;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}
