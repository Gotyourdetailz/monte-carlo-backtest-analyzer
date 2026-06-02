/**
 * Hero_Sim_Paths — pure, React/DOM-free, seeded-PRNG path-generation module for
 * the WebGL marketing hero (feature: webgl-hero).
 *
 * This module mirrors the engine's reproducibility ethos: given the same seed
 * and parameters it produces byte-identical output, so the decorative 3D hero
 * animation is deterministic and the path-generation math is unit- and
 * property-testable (Requirements 13.1, 13.4, 13.5, 14.6).
 *
 * It is a leaf module by design: it imports only the seeded PRNG helpers from
 * `./mathUtils` and references NO React API and NO DOM API (`document`/`window`),
 * per the repo's "one pure concern per file, React/DOM-free at boundaries"
 * convention.
 */

// Only the seeded PRNG primitives are imported from mathUtils. `generateHeroPaths`
// (task 2.2) consumes these to produce deterministic per-step increments; this
// task (2.1) establishes the data-model contract and the total `resolveHeroParams`.
import { createSeededRng, randomNormal } from './mathUtils';

/** Parameters controlling deterministic hero path generation. */
export interface HeroSimParams {
  /** Explicit numeric seed for the Seeded_PRNG (Req 13.1). */
  seed: number;
  /** Number of equity paths to generate (N). Caller clamps to render budget. */
  pathCount: number;
  /** Number of time steps (T); each path has T+1 points (origin + per step). */
  steps: number;
  /** Common starting value shared by every path (Req 14.2). Default 0. */
  origin?: number;
  /** Per-step drift (mean log-return-ish increment). */
  drift?: number;
  /** Per-step volatility (std-dev of the increment). */
  volatility?: number;
  /** Number of outcome buckets (rows) in the density grid. */
  densityBuckets?: number;
  /** Lower/upper tail probabilities for the VaR/CVaR band, e.g. 0.05. */
  tailProbability?: number;
}

/** One generated equity path: T+1 finite points starting at `origin`. */
export type HeroPath = number[];

/** Per-time-step summary series emphasised on the ribbons. */
export interface HeroSummary {
  /** Median outcome at each of the T+1 steps. */
  median: number[];
  /** VaR (quantile) boundary of the tail band at each step. */
  varBand: number[];
  /** CVaR (mean-beyond-VaR) boundary of the tail band at each step. */
  cvarBand: number[];
}

/**
 * Outcome-density grid for the surface. `counts[t][b]` is the number of paths
 * whose value at step `t` falls in bucket `b`; `density[t][b]` is the
 * normalised, non-negative density of that cell.
 */
export interface HeroDensityGrid {
  steps: number;        // T+1 columns
  buckets: number;      // density bucket rows
  min: number;          // grid value floor
  max: number;          // grid value ceiling
  counts: number[][];   // [steps][buckets], integer counts
  density: number[][];  // [steps][buckets], normalised >= 0
}

/** Complete, deterministic hero simulation result. */
export interface HeroSimResult {
  params: Required<HeroSimParams>;
  paths: HeroPath[];          // exactly N paths, each T+1 points
  summary: HeroSummary;
  density: HeroDensityGrid;
}

/**
 * Documented default values applied by {@link resolveHeroParams} when a
 * parameter is omitted or invalid. Exported (frozen) so tests and the render
 * component can reference the contract without duplicating literals.
 */
export const HERO_SIM_DEFAULTS: Readonly<Required<HeroSimParams>> = Object.freeze({
  seed: 1,
  pathCount: 64,
  steps: 64,
  origin: 0,
  drift: 0.02,
  volatility: 1,
  densityBuckets: 24,
  tailProbability: 0.05,
});

/** Smallest permitted tail probability (keeps the VaR/CVaR band well-defined). */
const MIN_TAIL_PROBABILITY = 1e-4;
/** Largest permitted tail probability (strictly below the median split at 0.5). */
const MAX_TAIL_PROBABILITY = 0.5 - 1e-4;

/** Return `value` when it is a finite number, otherwise `fallback`. */
function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Resolve a count-like parameter to a finite integer that is at least `min`.
 * Non-finite inputs fall back to `fallback`; fractional inputs are floored.
 */
function resolveCount(value: number | undefined, min: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.floor(value));
}

/** Clamp `value` into the inclusive `[min, max]` interval. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Resolve effective generation parameters with documented defaults (Error
 * Handling: this module is total). The result is fully populated and entirely
 * finite, so downstream generation cannot produce `NaN`/`Infinity` (Req 14.6):
 *
 * - `seed`        — passed through when finite, else {@link HERO_SIM_DEFAULTS}.
 * - `pathCount`   — finite integer, clamped to be non-negative.
 * - `steps`       — finite integer, clamped to be `>= 1`.
 * - `densityBuckets` — finite integer, clamped to be `>= 1`.
 * - `origin`      — finite, default `0` (the common path origin, Req 14.2).
 * - `drift`       — finite, default {@link HERO_SIM_DEFAULTS}.
 * - `volatility`  — finite and non-negative (it is a std-dev), default applied.
 * - `tailProbability` — finite, clamped into `(0, 0.5)`.
 *
 * Pure and total: never throws for any input and performs no I/O.
 */
export function resolveHeroParams(params: HeroSimParams): Required<HeroSimParams> {
  const seed = finiteOr(params.seed, HERO_SIM_DEFAULTS.seed);
  const pathCount = resolveCount(params.pathCount, 0, HERO_SIM_DEFAULTS.pathCount);
  const steps = resolveCount(params.steps, 1, HERO_SIM_DEFAULTS.steps);
  const densityBuckets = resolveCount(params.densityBuckets, 1, HERO_SIM_DEFAULTS.densityBuckets);

  const origin = finiteOr(params.origin, HERO_SIM_DEFAULTS.origin);
  const drift = finiteOr(params.drift, HERO_SIM_DEFAULTS.drift);
  const volatility = Math.max(0, finiteOr(params.volatility, HERO_SIM_DEFAULTS.volatility));
  const tailProbability = clamp(
    finiteOr(params.tailProbability, HERO_SIM_DEFAULTS.tailProbability),
    MIN_TAIL_PROBABILITY,
    MAX_TAIL_PROBABILITY,
  );

  return { seed, pathCount, steps, origin, drift, volatility, densityBuckets, tailProbability };
}

/**
 * Linear-interpolated quantile (type-7) of an ascending-sorted array.
 *
 * `p` is clamped into `[0, 1]`. The returned value is interpolated between two
 * adjacent order statistics and then clamped to `[sorted[0], sorted[n-1]]`, so
 * it always lies within the data range (absorbing floating-point drift). This
 * is what keeps the summary series inside the per-step path bounds (Req 14.3 /
 * Property 4). Returns `0` for an empty array.
 */
function sortedQuantile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const pos = clamp(p, 0, 1) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const value = sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
  return clamp(value, sorted[0], sorted[n - 1]);
}

/**
 * Resolve the density-grid bucket index for `value` within the global grid
 * range `[min, min + width * buckets]`. A non-positive `width` (degenerate
 * grid where every value is equal) maps everything to bucket `0`; otherwise the
 * index is floored and clamped into `[0, buckets - 1]`. Because every generated
 * value lies within the global `[min, max]` range, every path contributes
 * exactly one count per step, so per-step counts sum to `N` (Req 14.4 /
 * Property 5).
 */
function bucketIndex(value: number, min: number, width: number, buckets: number): number {
  if (width <= 0) return 0;
  const idx = Math.floor((value - min) / width);
  if (idx < 0) return 0;
  if (idx >= buckets) return buckets - 1;
  return idx;
}

/**
 * Generate the full hero simulation deterministically from `params`
 * (Requirements 1.3, 1.4, 13.1, 13.2, 13.3, 14.1, 14.2, 14.3, 14.4, 14.6).
 *
 * Steps:
 *  1. Resolve params with documented defaults so every value is finite and the
 *     function is total ({@link resolveHeroParams}).
 *  2. Re-seed a fresh mulberry32 PRNG with `seed` so the same `(seed, params)`
 *     yields byte-identical output (Property 1) and distinct seeds diverge
 *     (Property 2).
 *  3. Build exactly `N = pathCount` paths, each with `T+1 = steps + 1` points,
 *     every path starting at the common `origin` (Properties 3). Each step adds
 *     a `drift + volatility * N(0,1)` increment.
 *  4. Derive the per-step `median`, lower-tail `varBand` (quantile), and
 *     `cvarBand` (mean at or beyond VaR), each clamped to the step's path range
 *     so they stay within `[min_i, max_i]` (Property 4).
 *  5. Build the density grid over the global value range; per-step counts sum
 *     to `N` and every density cell is a non-negative, finite fraction
 *     (Property 5).
 *
 * The `N = 0` edge case is handled explicitly: paths is empty, summary series
 * fall back to the finite `origin`, counts are all zero (summing to 0), and
 * densities are all zero — every emitted value stays finite (Req 14.6).
 *
 * Pure and React/DOM-free: depends only on the seeded PRNG primitives.
 */
export function generateHeroPaths(params: HeroSimParams): HeroSimResult {
  const resolved = resolveHeroParams(params);
  const { seed, pathCount, steps, origin, drift, volatility, densityBuckets, tailProbability } =
    resolved;

  // Each path has T+1 points: the shared origin (t = 0) plus one point per step.
  const pointCount = steps + 1;

  // Re-seed at the start of generation so identical params reproduce identical
  // output (Req 13.1/13.2, Property 1).
  const rng = createSeededRng(seed);

  // --- 1. Paths -------------------------------------------------------------
  const paths: HeroPath[] = [];
  for (let i = 0; i < pathCount; i++) {
    const path: number[] = new Array<number>(pointCount);
    path[0] = origin;
    let value = origin;
    for (let t = 1; t < pointCount; t++) {
      value += drift + volatility * randomNormal(rng);
      path[t] = value;
    }
    paths.push(path);
  }

  // --- 2. Global grid bounds (over every emitted path point) ----------------
  let gridMin = origin;
  let gridMax = origin;
  if (pathCount > 0) {
    gridMin = Infinity;
    gridMax = -Infinity;
    for (const path of paths) {
      for (const v of path) {
        if (v < gridMin) gridMin = v;
        if (v > gridMax) gridMax = v;
      }
    }
  }
  const width = gridMax > gridMin ? (gridMax - gridMin) / densityBuckets : 0;

  // --- 3. Per-step summary series + density grid ----------------------------
  const median: number[] = new Array<number>(pointCount);
  const varBand: number[] = new Array<number>(pointCount);
  const cvarBand: number[] = new Array<number>(pointCount);
  const counts: number[][] = new Array<number[]>(pointCount);
  const density: number[][] = new Array<number[]>(pointCount);

  for (let t = 0; t < pointCount; t++) {
    // Density bucket counts for this step.
    const rowCounts: number[] = new Array<number>(densityBuckets).fill(0);
    for (let i = 0; i < pathCount; i++) {
      rowCounts[bucketIndex(paths[i][t], gridMin, width, densityBuckets)] += 1;
    }
    counts[t] = rowCounts;
    density[t] =
      pathCount > 0 ? rowCounts.map((c) => c / pathCount) : rowCounts.map(() => 0);

    // Summary series for this step.
    if (pathCount === 0) {
      median[t] = origin;
      varBand[t] = origin;
      cvarBand[t] = origin;
      continue;
    }

    const column: number[] = new Array<number>(pathCount);
    for (let i = 0; i < pathCount; i++) column[i] = paths[i][t];
    column.sort((a, b) => a - b);

    const lo = column[0];
    const hi = column[column.length - 1];

    const med = sortedQuantile(column, 0.5);
    const varValue = sortedQuantile(column, tailProbability);

    // CVaR: mean of outcomes at or beyond (≤) the lower-tail VaR threshold. At
    // least the minimum qualifies, so the divisor is never zero.
    let tailSum = 0;
    let tailCount = 0;
    for (const v of column) {
      if (v <= varValue) {
        tailSum += v;
        tailCount += 1;
      }
    }
    const cvarValue = tailCount > 0 ? tailSum / tailCount : varValue;

    median[t] = clamp(med, lo, hi);
    varBand[t] = clamp(varValue, lo, hi);
    cvarBand[t] = clamp(cvarValue, lo, hi);
  }

  const summary: HeroSummary = { median, varBand, cvarBand };
  const grid: HeroDensityGrid = {
    steps: pointCount,
    buckets: densityBuckets,
    min: gridMin,
    max: gridMax,
    counts,
    density,
  };

  return { params: resolved, paths, summary, density: grid };
}
