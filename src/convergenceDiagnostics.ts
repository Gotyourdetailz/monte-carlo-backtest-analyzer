/**
 * Monte Carlo convergence diagnostics.
 * 
 * Answers "Are N simulations enough?" by computing key metrics at increasing
 * sample sizes and checking whether they've stabilized.
 */

import { percentile, valueAtRisk, expectedShortfall } from './riskMetrics';

export type ConvergenceCheckpoint = {
  n: number;
  var95: number;
  cvar95: number;
  ruinProb: number;
  meanBalance: number;
  /** Standard error of the mean balance estimate at this N */
  seMean: number;
};

export type ConvergenceResult = {
  checkpoints: ConvergenceCheckpoint[];
  /** Whether key metrics have converged (last 3 checkpoints within 2% of each other) */
  converged: boolean;
  /** 'converged' | 'marginal' | 'not_converged' */
  status: 'converged' | 'marginal' | 'not_converged';
};

/**
 * Compute convergence diagnostics by evaluating metrics at increasing sample sizes.
 * Uses the SAME array (not re-simulating), subsampling at geometric intervals.
 */
export function computeConvergence(
  finalBalances: number[],
  maxDrawdowns: number[],
  startingCapital: number,
  ruinThreshold: number
): ConvergenceResult {
  const totalN = finalBalances.length;
  if (totalN < 100) {
    return {
      checkpoints: [],
      converged: false,
      status: 'not_converged',
    };
  }

  // Generate checkpoint sizes: 100, 200, 500, 1000, 2000, 5000, 10000, 20000, ...
  const checkpointSizes: number[] = [];
  const basePoints = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  for (const bp of basePoints) {
    if (bp <= totalN) checkpointSizes.push(bp);
  }
  if (checkpointSizes[checkpointSizes.length - 1] !== totalN) {
    checkpointSizes.push(totalN);
  }

  const ruinLevel = startingCapital * (1 - ruinThreshold / 100);
  const checkpoints: ConvergenceCheckpoint[] = [];

  for (const n of checkpointSizes) {
    const subset = finalBalances.slice(0, n);
    const sortedPnl = subset.map(b => b - startingCapital).sort((a, b) => a - b);

    const var95 = valueAtRisk(sortedPnl, 0.95);
    const cvar95 = expectedShortfall(sortedPnl, 0.95);
    const ruinCount = subset.filter(b => b <= ruinLevel).length;
    const ruinProb = (ruinCount / n) * 100;
    const meanBalance = subset.reduce((s, v) => s + v, 0) / n;

    // Standard error of the mean
    const variance = subset.reduce((s, v) => s + (v - meanBalance) ** 2, 0) / (n - 1);
    const seMean = Math.sqrt(variance / n);

    checkpoints.push({ n, var95, cvar95, ruinProb, meanBalance, seMean });
  }

  // Assess convergence: check if last 3 checkpoints are within 2% of each other
  const status = assessConvergence(checkpoints);

  return {
    checkpoints,
    converged: status === 'converged',
    status,
  };
}

function assessConvergence(checkpoints: ConvergenceCheckpoint[]): 'converged' | 'marginal' | 'not_converged' {
  if (checkpoints.length < 3) return 'not_converged';

  const last3 = checkpoints.slice(-3);

  // Check VaR95 stability
  const var95Values = last3.map(c => c.var95);
  const var95Range = Math.max(...var95Values) - Math.min(...var95Values);
  const var95Baseline = Math.abs(last3[last3.length - 1].var95) || 1;
  const var95Stable = var95Range / var95Baseline < 0.02;

  // Check Ruin Prob stability
  const ruinValues = last3.map(c => c.ruinProb);
  const ruinRange = Math.max(...ruinValues) - Math.min(...ruinValues);
  const ruinStable = ruinRange < 0.5; // within 0.5 percentage points

  // Check Mean Balance stability
  const meanValues = last3.map(c => c.meanBalance);
  const meanRange = Math.max(...meanValues) - Math.min(...meanValues);
  const meanBaseline = Math.abs(last3[last3.length - 1].meanBalance) || 1;
  const meanStable = meanRange / meanBaseline < 0.01;

  const stableCount = [var95Stable, ruinStable, meanStable].filter(Boolean).length;

  if (stableCount === 3) return 'converged';
  if (stableCount >= 2) return 'marginal';
  return 'not_converged';
}
