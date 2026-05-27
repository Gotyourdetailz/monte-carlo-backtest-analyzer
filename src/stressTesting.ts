/**
 * Stress testing / scenario overlay analysis.
 * 
 * Applies synthetic stress scenarios to the strategy's PnL data to answer:
 * "What happens under adverse conditions that haven't occurred in the backtest?"
 */

import { calculateMaxDrawdown, meanAndStdDev } from './mathUtils';

export type StressScenario = {
  /** Human-readable scenario name */
  name: string;
  /** Brief description of what the scenario models */
  description: string;
  /** Projected terminal capital after the scenario */
  capitalAfter: number;
  /** Maximum drawdown (as fraction 0-1) during the scenario */
  maxDrawdown: number;
  /** Whether the strategy survives (capital stays above ruin threshold) */
  survives: boolean;
  /** Severity tag for UI coloring */
  severity: 'low' | 'medium' | 'high' | 'extreme';
};

export type StressTestResult = {
  scenarios: StressScenario[];
  /** The worst surviving scenario (most severe stress the strategy can withstand) */
  worstSurvivable: StressScenario | null;
};

/**
 * Run a suite of stress scenarios against the strategy's PnL data.
 */
export function computeStressScenarios(
  pnls: number[],
  startingCapital: number,
  ruinThreshold: number
): StressTestResult {
  const ruinLevel = startingCapital * (1 - ruinThreshold / 100);
  const { mean, std } = meanAndStdDev(pnls);
  const scenarios: StressScenario[] = [];

  // ─── Scenario 1: Worst 5-trade window ───
  scenarios.push(worstWindowScenario(pnls, 5, startingCapital, ruinLevel));

  // ─── Scenario 2: Worst 10-trade window ───
  scenarios.push(worstWindowScenario(pnls, 10, startingCapital, ruinLevel));

  // ─── Scenario 3: Worst 20-trade window ───
  scenarios.push(worstWindowScenario(pnls, 20, startingCapital, ruinLevel));

  // ─── Scenario 4: Volatility shock 1.5x ───
  scenarios.push(volShockScenario(pnls, mean, std, 1.5, startingCapital, ruinLevel));

  // ─── Scenario 5: Volatility shock 2x ───
  scenarios.push(volShockScenario(pnls, mean, std, 2.0, startingCapital, ruinLevel));

  // ─── Scenario 6: Win rate shock -10% ───
  scenarios.push(winRateShockScenario(pnls, 0.10, startingCapital, ruinLevel));

  // ─── Scenario 7: Win rate shock -20% ───
  scenarios.push(winRateShockScenario(pnls, 0.20, startingCapital, ruinLevel));

  // ─── Scenario 8: Tail amplification (losses doubled) ───
  scenarios.push(tailAmplificationScenario(pnls, 2.0, startingCapital, ruinLevel));

  // ─── Scenario 9: Black swan (5× worst single loss applied 3 times consecutively) ───
  scenarios.push(blackSwanScenario(pnls, startingCapital, ruinLevel));

  // ─── Scenario 10: Combined (vol 1.5x + WR -10%) ───
  scenarios.push(combinedScenario(pnls, mean, std, startingCapital, ruinLevel));

  // Find worst surviving scenario
  const surviving = scenarios.filter(s => s.survives);
  const worstSurvivable = surviving.length > 0
    ? surviving.reduce((worst, s) => s.maxDrawdown > worst.maxDrawdown ? s : worst)
    : null;

  return { scenarios, worstSurvivable };
}

// ═══════════════════════════════════════════════════════════
// Individual scenario implementations
// ═══════════════════════════════════════════════════════════

function worstWindowScenario(
  pnls: number[], windowSize: number, startCap: number, ruinLevel: number
): StressScenario {
  if (pnls.length < windowSize) {
    return {
      name: `Worst ${windowSize}-trade window`,
      description: `Insufficient data (need ${windowSize} trades)`,
      capitalAfter: startCap,
      maxDrawdown: 0,
      survives: true,
      severity: 'low',
    };
  }

  // Find contiguous window with lowest cumulative PnL
  let worstSum = Infinity;
  let worstStart = 0;
  for (let i = 0; i <= pnls.length - windowSize; i++) {
    let sum = 0;
    for (let j = i; j < i + windowSize; j++) sum += pnls[j];
    if (sum < worstSum) {
      worstSum = sum;
      worstStart = i;
    }
  }

  const worstWindow = pnls.slice(worstStart, worstStart + windowSize);
  const { capitalAfter, maxDrawdown } = simulateWindow(worstWindow, startCap);
  const survives = capitalAfter > ruinLevel;

  return {
    name: `Worst ${windowSize}-trade window`,
    description: `Trades ${worstStart + 1}–${worstStart + windowSize}: cumulative PnL $${worstSum.toFixed(0)}`,
    capitalAfter,
    maxDrawdown,
    survives,
    severity: maxDrawdown > 0.3 ? 'extreme' : maxDrawdown > 0.15 ? 'high' : 'medium',
  };
}

function volShockScenario(
  pnls: number[], mean: number, std: number, multiplier: number, startCap: number, ruinLevel: number
): StressScenario {
  // Scale deviations from mean by multiplier (preserves mean, increases volatility)
  const shocked = pnls.map(p => mean + (p - mean) * multiplier);
  const { capitalAfter, maxDrawdown } = simulateWindow(shocked, startCap);
  const survives = capitalAfter > ruinLevel;

  return {
    name: `Volatility ×${multiplier}`,
    description: `All trade deviations scaled by ${multiplier}× (σ: $${std.toFixed(0)} → $${(std * multiplier).toFixed(0)})`,
    capitalAfter,
    maxDrawdown,
    survives,
    severity: multiplier >= 2 ? 'extreme' : 'high',
  };
}

function winRateShockScenario(
  pnls: number[], reduction: number, startCap: number, ruinLevel: number
): StressScenario {
  // Flip a fraction of wins to losses (use the average loss magnitude)
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p < 0);
  const avgLoss = losses.length > 0
    ? losses.reduce((s, v) => s + v, 0) / losses.length
    : -Math.abs(meanAndStdDev(pnls).std);

  const nToFlip = Math.floor(wins.length * reduction);
  const shocked = [...pnls];

  // Flip the smallest wins first (most likely to flip in reality)
  const winIndices = pnls
    .map((p, i) => ({ p, i }))
    .filter(x => x.p > 0)
    .sort((a, b) => a.p - b.p)
    .slice(0, nToFlip)
    .map(x => x.i);

  for (const idx of winIndices) {
    shocked[idx] = avgLoss;
  }

  const { capitalAfter, maxDrawdown } = simulateWindow(shocked, startCap);
  const survives = capitalAfter > ruinLevel;
  const originalWR = (wins.length / pnls.length * 100).toFixed(0);
  const newWR = ((wins.length - nToFlip) / pnls.length * 100).toFixed(0);

  return {
    name: `Win rate −${(reduction * 100).toFixed(0)}%`,
    description: `${nToFlip} smallest wins flipped to losses (WR: ${originalWR}% → ${newWR}%)`,
    capitalAfter,
    maxDrawdown,
    survives,
    severity: reduction >= 0.2 ? 'high' : 'medium',
  };
}

function tailAmplificationScenario(
  pnls: number[], lossMultiplier: number, startCap: number, ruinLevel: number
): StressScenario {
  // Double all losses, keep wins unchanged
  const shocked = pnls.map(p => p < 0 ? p * lossMultiplier : p);
  const { capitalAfter, maxDrawdown } = simulateWindow(shocked, startCap);
  const survives = capitalAfter > ruinLevel;

  return {
    name: `Losses ×${lossMultiplier}`,
    description: `All losing trades amplified by ${lossMultiplier}×, winners unchanged`,
    capitalAfter,
    maxDrawdown,
    survives,
    severity: 'extreme',
  };
}

function blackSwanScenario(
  pnls: number[], startCap: number, ruinLevel: number
): StressScenario {
  const worstLoss = Math.min(...pnls);
  // Insert 3 consecutive worst losses at the beginning
  const shocked = [worstLoss * 5, worstLoss * 5, worstLoss * 5, ...pnls];
  const { capitalAfter, maxDrawdown } = simulateWindow(shocked, startCap);
  const survives = capitalAfter > ruinLevel;

  return {
    name: 'Black Swan (3× 5σ loss)',
    description: `Three consecutive 5× worst-loss events ($${(worstLoss * 5).toFixed(0)} each) prepended to trade history`,
    capitalAfter,
    maxDrawdown,
    survives,
    severity: 'extreme',
  };
}

function combinedScenario(
  pnls: number[], mean: number, std: number, startCap: number, ruinLevel: number
): StressScenario {
  // Vol 1.5x + flip 10% of wins
  const volShocked = pnls.map(p => mean + (p - mean) * 1.5);
  const wins = volShocked.filter(p => p > 0);
  const losses = volShocked.filter(p => p < 0);
  const avgLoss = losses.length > 0
    ? losses.reduce((s, v) => s + v, 0) / losses.length
    : -std;

  const nToFlip = Math.floor(wins.length * 0.1);
  const shocked = [...volShocked];
  const winIndices = volShocked
    .map((p, i) => ({ p, i }))
    .filter(x => x.p > 0)
    .sort((a, b) => a.p - b.p)
    .slice(0, nToFlip)
    .map(x => x.i);

  for (const idx of winIndices) {
    shocked[idx] = avgLoss;
  }

  const { capitalAfter, maxDrawdown } = simulateWindow(shocked, startCap);
  const survives = capitalAfter > ruinLevel;

  return {
    name: 'Combined stress',
    description: 'Volatility ×1.5 + Win rate −10% applied simultaneously',
    capitalAfter,
    maxDrawdown,
    survives,
    severity: 'extreme',
  };
}

// ═══════════════════════════════════════════════════════════
// Helper: simulate a PnL sequence and return terminal capital + max DD
// ═══════════════════════════════════════════════════════════

function simulateWindow(pnls: number[], startCap: number): { capitalAfter: number; maxDrawdown: number } {
  const path = [startCap];
  for (const p of pnls) {
    path.push(path[path.length - 1] + p);
  }
  const maxDrawdown = calculateMaxDrawdown(path);
  const capitalAfter = path[path.length - 1];
  return { capitalAfter, maxDrawdown };
}
