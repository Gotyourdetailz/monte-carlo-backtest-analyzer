/**
 * Drawdown duration analysis — time-under-water metrics.
 * 
 * Institutional risk desks report not just drawdown depth but also duration.
 * A 20% DD recovering in 3 trades is categorically different from one lasting 60 trades.
 */

export type DrawdownPeriod = {
  /** Index where equity dropped below its peak */
  startIdx: number;
  /** Index where equity returned to or exceeded the prior peak (-1 if unrecovered) */
  endIdx: number;
  /** Max depth (as a fraction, e.g. 0.15 = 15%) during this drawdown period */
  depth: number;
  /** Number of steps (trades/days) from start to recovery (or end of data if unrecovered) */
  duration: number;
  /** Whether the drawdown was recovered before the end of data */
  recovered: boolean;
};

export type TimeUnderWaterStats = {
  /** Longest single drawdown period (in trades/days) */
  maxDuration: number;
  /** Average duration of completed drawdown periods */
  avgDuration: number;
  /** Current (ongoing) drawdown duration at end of data; 0 if at peak */
  currentDuration: number;
  /** Fraction of total timeline spent below a previous peak (0-1) */
  percentTimeUnderWater: number;
  /** All individual drawdown periods */
  periods: DrawdownPeriod[];
};

/**
 * Identify all drawdown periods from an equity curve.
 * A drawdown period starts when equity drops below its running peak
 * and ends when it recovers to or exceeds that peak.
 */
export function computeDrawdownDurations(equityCurve: number[]): DrawdownPeriod[] {
  if (equityCurve.length < 2) return [];

  const periods: DrawdownPeriod[] = [];
  let peak = equityCurve[0];
  let inDrawdown = false;
  let ddStart = 0;
  let ddMaxDepth = 0;

  for (let i = 1; i < equityCurve.length; i++) {
    const val = equityCurve[i];

    if (val >= peak) {
      // At or above previous peak
      if (inDrawdown) {
        // Close the drawdown period
        periods.push({
          startIdx: ddStart,
          endIdx: i,
          depth: ddMaxDepth,
          duration: i - ddStart,
          recovered: true,
        });
        inDrawdown = false;
        ddMaxDepth = 0;
      }
      peak = val;
    } else {
      // Below peak — in drawdown
      const currentDepth = (peak - val) / peak;
      if (!inDrawdown) {
        ddStart = i;
        inDrawdown = true;
        ddMaxDepth = currentDepth;
      } else {
        ddMaxDepth = Math.max(ddMaxDepth, currentDepth);
      }
    }
  }

  // Handle unrecovered drawdown at end of data
  if (inDrawdown) {
    periods.push({
      startIdx: ddStart,
      endIdx: equityCurve.length - 1,
      depth: ddMaxDepth,
      duration: equityCurve.length - 1 - ddStart,
      recovered: false,
    });
  }

  return periods;
}

/**
 * Compute aggregate time-under-water statistics from an equity curve.
 */
export function computeTimeUnderWater(equityCurve: number[]): TimeUnderWaterStats {
  const periods = computeDrawdownDurations(equityCurve);

  if (periods.length === 0) {
    return {
      maxDuration: 0,
      avgDuration: 0,
      currentDuration: 0,
      percentTimeUnderWater: 0,
      periods: [],
    };
  }

  const maxDuration = Math.max(...periods.map(p => p.duration));
  const completedPeriods = periods.filter(p => p.recovered);
  const avgDuration = completedPeriods.length > 0
    ? completedPeriods.reduce((s, p) => s + p.duration, 0) / completedPeriods.length
    : 0;

  // Current drawdown: check if last period is unrecovered
  const lastPeriod = periods[periods.length - 1];
  const currentDuration = lastPeriod.recovered ? 0 : lastPeriod.duration;

  // Total time underwater
  const totalTimeUW = periods.reduce((s, p) => s + p.duration, 0);
  const totalTimeline = Math.max(1, equityCurve.length - 1);
  const percentTimeUnderWater = totalTimeUW / totalTimeline;

  return {
    maxDuration,
    avgDuration,
    currentDuration,
    percentTimeUnderWater,
    periods,
  };
}

/**
 * Compute drawdown duration percentiles across multiple simulated paths.
 * Used to generate median/p95 duration from MC simulations.
 */
export function computeSimulatedDDDurations(
  paths: number[][]
): { medianMaxDuration: number; p95MaxDuration: number; avgPctUnderwater: number } {
  if (paths.length === 0) {
    return { medianMaxDuration: 0, p95MaxDuration: 0, avgPctUnderwater: 0 };
  }

  const maxDurations: number[] = [];
  let totalPctUW = 0;

  for (const path of paths) {
    const stats = computeTimeUnderWater(path);
    maxDurations.push(stats.maxDuration);
    totalPctUW += stats.percentTimeUnderWater;
  }

  maxDurations.sort((a, b) => a - b);
  const n = maxDurations.length;

  return {
    medianMaxDuration: maxDurations[Math.floor(n * 0.5)],
    p95MaxDuration: maxDurations[Math.floor(n * 0.95)],
    avgPctUnderwater: totalPctUW / n,
  };
}
