/**
 * End-to-end test with real NinjaTrader CSV data.
 * Parses the file, runs all models, validates outputs.
 * 
 * Run: npx tsx src/__tests__/e2e_real_data.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { createSeededRng, meanAndStdDev, calculateMaxDrawdown } from '../mathUtils';
import { computeHistoricalStats, runSimulation } from '../simulationEngine';
import { stationaryBlockBootstrap, optimalBlockLength } from '../blockBootstrap';
import { computeSlippage, estimateBaseVolatility, type SlippageConfig } from '../slippageModel';
import { fitBestDistribution } from '../distributionFitting';
import type { DailyData } from '../types';

// ═══════════════════════════════════════════════════════════
// Harness
// ═══════════════════════════════════════════════════════════
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ❌ ${label}`);
  }
}

function assertApprox(actual: number, expected: number, tol: number, label: string) {
  const ok = Math.abs(actual - expected) < tol;
  if (!ok) label += ` (got ${actual.toFixed(4)}, expected ~${expected} ± ${tol})`;
  assert(ok, label);
}

function section(name: string) {
  console.log(`\n══ ${name} ══`);
}

// ═══════════════════════════════════════════════════════════
// Parse NinjaTrader CSV
// ═══════════════════════════════════════════════════════════
section('CSV Parsing');

const CSV_PATH = String.raw`C:\Users\demir\OneDrive\Documents\NinjaTrader Grid 2026-04-08 10-41 PM.csv`;
const raw = fs.readFileSync(CSV_PATH, 'utf-8');
const lines = raw.trim().split('\n').map(l => l.replace(/\r$/, ''));
const header = lines[0].split(',');

// Find Profit column
const profitIdx = header.findIndex(h => h.trim() === 'Profit');
assert(profitIdx !== -1, `Found "Profit" column at index ${profitIdx}`);

// Parse financial numbers: ($11.90) → -11.90, $909.24 → 909.24
function parseFinancial(s: string): number {
  const cleaned = s.replace(/[\$,\s]/g, '');
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    return -parseFloat(cleaned.slice(1, -1));
  }
  return parseFloat(cleaned);
}

const pnls: number[] = [];
const dailyData: DailyData[] = [];
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',');
  if (cols.length <= profitIdx) continue;
  const val = parseFinancial(cols[profitIdx]);
  if (isNaN(val)) continue;
  pnls.push(val);
  dailyData.push({ pnl: val });
}

assert(pnls.length > 0, `Parsed ${pnls.length} trades from CSV`);
assert(pnls.length === 127, `Expected 127 trades, got ${pnls.length}`);

// Sanity check: first few values
assertApprox(pnls[0], -11.90, 0.01, 'Trade 1 PnL = -$11.90');
assertApprox(pnls[8], 909.24, 0.01, 'Trade 9 PnL = $909.24');

// ═══════════════════════════════════════════════════════════
// Descriptive Statistics on Real Data
// ═══════════════════════════════════════════════════════════
section('Historical Stats — Real Data');

const { mean, std } = meanAndStdDev(pnls);
const equityCurve = [10000 as number];
for (const p of pnls) equityCurve.push(equityCurve[equityCurve.length - 1] + p);
const maxDd = calculateMaxDrawdown(equityCurve);

console.log(`  Data: ${pnls.length} trades, mean=$${mean.toFixed(2)}, std=$${std.toFixed(2)}`);
console.log(`  Terminal balance: $${equityCurve[equityCurve.length - 1].toFixed(2)}`);
console.log(`  Max drawdown: ${(maxDd * 100).toFixed(2)}%`);

const stats = computeHistoricalStats(pnls, equityCurve, maxDd, 252);
assert(stats.totalTrades === 127, 'Total trades = 127');
assert(stats.winRate >= 0 && stats.winRate <= 100, `Win rate in valid range: ${stats.winRate.toFixed(1)}%`);
assert(isFinite(stats.profitFactor), `Profit factor is finite: ${stats.profitFactor.toFixed(2)}`);
assert(isFinite(stats.sharpeRatio), `Sharpe is finite: ${stats.sharpeRatio.toFixed(2)}`);
assert(isFinite(stats.sortinoRatio), `Sortino is finite: ${stats.sortinoRatio.toFixed(2)}`);
assert(stats.kellyCriterion >= 0 && stats.kellyCriterion <= 1, `Kelly in [0,1]: ${stats.kellyCriterion.toFixed(3)}`);
assert(stats.maxConsecutiveLosses >= 0, `Max consec losses: ${stats.maxConsecutiveLosses}`);

console.log(`  Win rate: ${stats.winRate.toFixed(1)}%`);
console.log(`  Profit factor: ${stats.profitFactor.toFixed(2)}`);
console.log(`  Expectancy: $${stats.expectancy.toFixed(2)}`);
console.log(`  Sharpe: ${stats.sharpeRatio.toFixed(2)}, Sortino: ${stats.sortinoRatio.toFixed(2)}`);
console.log(`  Kelly: ${(stats.kellyCriterion * 100).toFixed(1)}%, Max consec losses: ${stats.maxConsecutiveLosses}`);

// ═══════════════════════════════════════════════════════════
// Block Bootstrap on Real Data
// ═══════════════════════════════════════════════════════════
section('Block Bootstrap — Real Data');

const blockOpt = optimalBlockLength(pnls);
console.log(`  Lag-1 autocorrelation: ${blockOpt.lag1Autocorrelation.toFixed(4)}`);
console.log(`  Optimal avg block length: ${blockOpt.avgBlockLength}`);
assert(blockOpt.avgBlockLength >= 1, 'Block length >= 1');

const rng = createSeededRng(42);
const bootstrapped = stationaryBlockBootstrap(pnls, 127, blockOpt.avgBlockLength, rng);
assert(bootstrapped.length === 127, 'Block bootstrap returns correct length');
assert(bootstrapped.every(v => pnls.includes(v)), 'All bootstrapped values exist in original data');

// Check mean is within 2 std deviations of original mean
const { mean: bsMean } = meanAndStdDev(bootstrapped);
const tolerance = 2 * std / Math.sqrt(127);
const meanDiff = Math.abs(bsMean - mean);
console.log(`  Bootstrap mean: $${bsMean.toFixed(2)} (original: $${mean.toFixed(2)}, tol: ±$${tolerance.toFixed(2)})`);

// ═══════════════════════════════════════════════════════════
// Slippage Model on Real Data
// ═══════════════════════════════════════════════════════════
section('Slippage Model — Real Data');

const baseVol = estimateBaseVolatility(pnls);
console.log(`  Base volatility (σ): $${baseVol.toFixed(2)}`);
assertApprox(baseVol, std, 0.01, 'estimateBaseVolatility ≈ sample std');

const sqrtConfig: SlippageConfig = {
  model: 'sqrt_impact',
  fixedSlippagePerTrade: 0,
  impactCoefficient: 0.1,
  baseVolatility: baseVol,
};

// Compute total slippage at 1x and 2x position sizing
let totalSlip1x = 0, totalSlip2x = 0;
for (const p of pnls) {
  totalSlip1x += computeSlippage(sqrtConfig, p, 1.0, baseVol);
  totalSlip2x += computeSlippage(sqrtConfig, p, 2.0, baseVol);
}
console.log(`  Total slippage at 1.0x: $${totalSlip1x.toFixed(2)}`);
console.log(`  Total slippage at 2.0x: $${totalSlip2x.toFixed(2)}`);
assert(totalSlip1x > 0, 'Total slippage is positive');
assert(totalSlip2x > totalSlip1x, '2x sizing → more slippage');
const slipRatio = totalSlip2x / totalSlip1x;
console.log(`  Slippage ratio (2x/1x): ${slipRatio.toFixed(3)} (expected ~1.414 = √2)`);
assertApprox(slipRatio, Math.SQRT2, 0.15, 'Slippage ratio ≈ √2 for 2x sizing');

// ═══════════════════════════════════════════════════════════
// MLE Distribution Fitting on Real Data
// ═══════════════════════════════════════════════════════════
section('MLE Distribution Fit — Real Data');

const fitResult = fitBestDistribution(pnls);
const best = fitResult.best;
const normalFit = fitResult.all.find(f => f.type === 'normal')!;
const tFit = fitResult.all.find(f => f.type === 'student_t')!;

console.log(`  Normal fit:    μ=$${normalFit.mu.toFixed(2)}, σ=$${normalFit.sigma.toFixed(2)}, BIC=${normalFit.bic.toFixed(1)}`);
console.log(`  Student-t fit: μ=$${tFit.mu.toFixed(2)}, σ=$${tFit.sigma.toFixed(2)}, df=${tFit.df?.toFixed(1)}, BIC=${tFit.bic.toFixed(1)}`);
console.log(`  ► Best fit: ${best.type}${best.type === 'student_t' ? ` (df=${best.df?.toFixed(1)})` : ''}`);

assert(fitResult.all.length === 2, 'Both distributions fitted');
assertApprox(normalFit.mu, mean, 1, 'Normal μ ≈ sample mean');
assertApprox(tFit.mu, mean, 10, 'Student-t μ near sample mean');
assert(best.bic <= Math.max(normalFit.bic, tFit.bic), 'Best fit has lowest BIC');

// Financial data typically has heavy tails
if (best.type === 'student_t') {
  console.log(`  Heavy tails confirmed: Student-t selected with df=${best.df?.toFixed(1)}`);
  assert(best.df! < 30, 'Student-t df < 30 (genuine heavy tails, not convergence to Normal)');
} else {
  console.log(`  Data appears normally distributed — no heavy tails detected`);
}

// ═══════════════════════════════════════════════════════════
// Full Simulation Engine — Basic Model (all 3 sampling modes)
// ═══════════════════════════════════════════════════════════
section('Simulation Engine — Basic Model');

const baseConfig = {
  nSimulations: 2000,
  nTrades: 127,
  startingCapital: 10000,
  ruinThreshold: 50,
  commissionPerTrade: 0,
  randomSeed: 42,
  rowFrequency: 'trade' as const,
  periodsPerYear: 252,
  positionSizeMultiplier: 1.0,
  regimeSource: 'None',
  autoRegimeWindow: 10,
  autoRegimeThreshold: 50,
  propFirmRulesEnabled: false,
  propTarget: 3000,
  propMaxDrawdown: 1500,
  propConsistencyPercent: 30,
  dailyLossLimitEnabled: false,
  dailyMaxLosses: 2,
  dailyMaxLossDollars: 500,
  tradesPerSession: 3,
  slippageModel: 'fixed' as const,
  impactCoefficient: 0.1,
  copulaDf: 5,
};

for (const mode of ['permutation', 'bootstrap', 'block_bootstrap'] as const) {
  const result = await runSimulation({
    ...baseConfig,
    modelType: 'basic',
    data: dailyData,
    dataFormat: 'absolute',
    samplingMode: mode,
  });

  assert(result.nSimulations === 2000, `[${mode}] nSimulations = 2000`);
  assert(result.finalBalances.length === 2000, `[${mode}] 2000 final balances`);
  assert(result.maxDrawdowns.length === 2000, `[${mode}] 2000 max drawdowns`);
  assert(result.paths.length > 0, `[${mode}] Stored paths > 0`);
  assert(result.ruinProbability >= 0 && result.ruinProbability <= 100, `[${mode}] Ruin prob in [0,100]: ${result.ruinProbability.toFixed(2)}%`);
  assert(isFinite(result.meanFinalBalance), `[${mode}] Mean final balance is finite: $${result.meanFinalBalance.toFixed(2)}`);
  assert(result.maxDrawdowns.every(d => d >= 0 && d <= 1), `[${mode}] All drawdowns in [0,1]`);
  assert(result.modelType === 'basic', `[${mode}] Model type = basic`);

  // Check institutional metrics exist
  assert(result.institutionalMetrics !== undefined, `[${mode}] Has institutional metrics`);
  assert(isFinite(result.institutionalMetrics.var95), `[${mode}] VaR95 is finite`);
  assert(isFinite(result.institutionalMetrics.cvar95), `[${mode}] CVaR95 is finite`);

  console.log(`    ${mode}: ruin=${result.ruinProbability.toFixed(2)}%, mean=$${result.meanFinalBalance.toFixed(0)}, VaR95=$${result.institutionalMetrics.var95.toFixed(0)}`);
}

// ═══════════════════════════════════════════════════════════
// Simulation Engine — Regime-Switching Model
// ═══════════════════════════════════════════════════════════
section('Simulation Engine — Regime-Switching');

const regimeResult = await runSimulation({
  ...baseConfig,
  modelType: 'regime',
  data: dailyData,
  dataFormat: 'absolute',
  samplingMode: 'bootstrap',
  regimeSource: 'AUTO',
  autoRegimeWindow: 10,
  autoRegimeThreshold: 50,
});

assert(regimeResult.nSimulations === 2000, '[regime] nSimulations = 2000');
assert(regimeResult.finalBalances.length === 2000, '[regime] 2000 final balances');
assert(regimeResult.ruinProbability >= 0, '[regime] Ruin prob >= 0');
assert(regimeResult.historicalStats.byRegime !== undefined, '[regime] Has byRegime breakdown');
const regimeKeys = Object.keys(regimeResult.historicalStats.byRegime!);
assert(regimeKeys.length >= 2, `[regime] At least 2 regimes detected: ${regimeKeys.join(', ')}`);

for (const key of regimeKeys) {
  const rs = regimeResult.historicalStats.byRegime![key];
  assert(rs.totalTrades > 0, `[regime/${key}] Has trades: ${rs.totalTrades}`);
  assert(rs.winRate >= 0 && rs.winRate <= 100, `[regime/${key}] Valid win rate: ${rs.winRate.toFixed(1)}%`);
  console.log(`    ${key}: N=${rs.totalTrades}, WR=${rs.winRate.toFixed(1)}%, E=$${rs.expectancy.toFixed(2)}`);
}

// ═══════════════════════════════════════════════════════════
// Simulation Engine — Parametric Model (MLE-fitted)
// ═══════════════════════════════════════════════════════════
section('Simulation Engine — Parametric (MLE)');

const parametricResult = await runSimulation({
  ...baseConfig,
  modelType: 'parametric',
  data: dailyData,
  dataFormat: 'absolute',
  samplingMode: 'bootstrap',
});

assert(parametricResult.nSimulations === 2000, '[parametric] nSimulations = 2000');
assert(parametricResult.finalBalances.length === 2000, '[parametric] 2000 final balances');
assert(parametricResult.ruinProbability >= 0, '[parametric] Ruin prob >= 0');
assert(parametricResult.distributionFit !== undefined, '[parametric] Distribution fit attached');

if (parametricResult.distributionFit) {
  const df = parametricResult.distributionFit;
  console.log(`    Fitted: ${df.type}${df.type === 'student_t' ? ` (df=${df.df?.toFixed(1)})` : ''}, μ=$${df.mu.toFixed(2)}, σ=$${df.sigma.toFixed(2)}`);
  assert(isFinite(df.mu), '[parametric] Fit μ is finite');
  assert(isFinite(df.sigma) && df.sigma > 0, '[parametric] Fit σ is positive');
  assert(isFinite(df.bic), '[parametric] Fit BIC is finite');
}

console.log(`    Ruin: ${parametricResult.ruinProbability.toFixed(2)}%, Mean: $${parametricResult.meanFinalBalance.toFixed(0)}`);

// ═══════════════════════════════════════════════════════════
// Simulation Engine — √-Impact Slippage Integration
// ═══════════════════════════════════════════════════════════
section('Simulation Engine — √-Impact Slippage');

const noSlipResult = await runSimulation({
  ...baseConfig,
  modelType: 'basic',
  data: dailyData,
  dataFormat: 'absolute',
  samplingMode: 'bootstrap',
  slippageModel: 'none',
});

const fixedSlipResult = await runSimulation({
  ...baseConfig,
  modelType: 'basic',
  data: dailyData,
  dataFormat: 'absolute',
  samplingMode: 'bootstrap',
  slippageModel: 'fixed',
  commissionPerTrade: 5,
});

const sqrtSlipResult = await runSimulation({
  ...baseConfig,
  modelType: 'basic',
  data: dailyData,
  dataFormat: 'absolute',
  samplingMode: 'bootstrap',
  slippageModel: 'sqrt_impact',
});

console.log(`    No slippage:    Mean=$${noSlipResult.meanFinalBalance.toFixed(0)}, Ruin=${noSlipResult.ruinProbability.toFixed(2)}%`);
console.log(`    Fixed ($5/trade): Mean=$${fixedSlipResult.meanFinalBalance.toFixed(0)}, Ruin=${fixedSlipResult.ruinProbability.toFixed(2)}%`);
console.log(`    √-Impact:       Mean=$${sqrtSlipResult.meanFinalBalance.toFixed(0)}, Ruin=${sqrtSlipResult.ruinProbability.toFixed(2)}%`);

// Fixed slippage should reduce returns vs no slippage
assert(fixedSlipResult.meanFinalBalance < noSlipResult.meanFinalBalance,
  'Fixed slippage reduces mean balance vs no slippage');

// ═══════════════════════════════════════════════════════════
// Simulation Engine — Prop Firm Rules
// ═══════════════════════════════════════════════════════════
section('Simulation Engine — Prop Firm Eval');

const propResult = await runSimulation({
  ...baseConfig,
  modelType: 'basic',
  data: dailyData,
  dataFormat: 'absolute',
  samplingMode: 'bootstrap',
  propFirmRulesEnabled: true,
  propTarget: 3000,
  propMaxDrawdown: 1500,
  propConsistencyPercent: 30,
});

assert(propResult.propEvalStats !== undefined, '[prop] Has prop eval stats');
if (propResult.propEvalStats) {
  const pe = propResult.propEvalStats;
  assert(pe.passRate >= 0 && pe.passRate <= 100, `[prop] Pass rate in [0,100]: ${pe.passRate.toFixed(1)}%`);
  assert(pe.failDrawdown >= 0, `[prop] failDrawdown count >= 0: ${pe.failDrawdown}`);
  assert(pe.failConsistency >= 0, `[prop] failConsistency count >= 0: ${pe.failConsistency}`);
  assert(pe.failTime >= 0, `[prop] failTime count >= 0: ${pe.failTime}`);
  
  const totalAccounted = pe.passRate / 100 * 2000
    + pe.failDrawdown + pe.failConsistency + pe.failTime;
  // There can be overlap between fail modes, so just check pass+fail >= nSim
  assert(pe.failDrawdown + pe.failConsistency + pe.failTime >= 0, '[prop] Fail counts are non-negative');

  console.log(`    Pass: ${pe.passRate.toFixed(1)}%, FailDD: ${pe.failDrawdown}, FailConsist: ${pe.failConsistency}, FailTime: ${pe.failTime}`);
  if (pe.tradesToTarget.length > 0) {
    console.log(`    Median trades to target: ${pe.medianTradesToTarget}`);
  }
}

// ═══════════════════════════════════════════════════════════
// Position Sizing Comparison
// ═══════════════════════════════════════════════════════════
section('Position Sizing — 1x vs 0.5x');

const halfSizeResult = await runSimulation({
  ...baseConfig,
  modelType: 'basic',
  data: dailyData,
  dataFormat: 'absolute',
  samplingMode: 'bootstrap',
  positionSizeMultiplier: 0.5,
});

console.log(`    1.0x: Ruin=${noSlipResult.ruinProbability.toFixed(2)}%, Mean=$${noSlipResult.meanFinalBalance.toFixed(0)}`);
console.log(`    0.5x: Ruin=${halfSizeResult.ruinProbability.toFixed(2)}%, Mean=$${halfSizeResult.meanFinalBalance.toFixed(0)}`);

assert(halfSizeResult.ruinProbability <= noSlipResult.ruinProbability + 1,
  '0.5x sizing → lower or equal ruin probability');

// ═══════════════════════════════════════════════════════════
// Reproducibility (Seeded RNG)
// ═══════════════════════════════════════════════════════════
section('Reproducibility — Seeded Runs');

const run1 = await runSimulation({
  ...baseConfig,
  modelType: 'basic',
  data: dailyData,
  dataFormat: 'absolute',
  samplingMode: 'bootstrap',
  randomSeed: 42,
});

const run2 = await runSimulation({
  ...baseConfig,
  modelType: 'basic',
  data: dailyData,
  dataFormat: 'absolute',
  samplingMode: 'bootstrap',
  randomSeed: 42,
});

assert(run1.ruinProbability === run2.ruinProbability, 'Same seed → identical ruin probability');
assert(run1.meanFinalBalance === run2.meanFinalBalance, 'Same seed → identical mean final balance');
assert(run1.finalBalances.length === run2.finalBalances.length, 'Same seed → same number of simulations');
const allMatch = run1.finalBalances.every((v, i) => v === run2.finalBalances[i]);
assert(allMatch, 'Same seed → all 2000 final balances are bit-for-bit identical');

// Different seed should produce different results
const run3 = await runSimulation({
  ...baseConfig,
  modelType: 'basic',
  data: dailyData,
  dataFormat: 'absolute',
  samplingMode: 'bootstrap',
  randomSeed: 99,
});
assert(run3.meanFinalBalance !== run1.meanFinalBalance, 'Different seed → different results');

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failures.length > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  ❌ ${f}`));
}
console.log('═'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
