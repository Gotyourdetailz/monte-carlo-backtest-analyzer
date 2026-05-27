/**
 * Comprehensive test suite for the Monte Carlo Backtest Analyzer.
 * Tests all new institutional modules + core engine integration.
 * 
 * Run with: npx tsx src/__tests__/institutional.test.ts
 */

import { stationaryBlockBootstrap, optimalBlockLength } from '../blockBootstrap';
import { computeSlippage, estimateBaseVolatility, DEFAULT_SLIPPAGE_CONFIG, type SlippageConfig } from '../slippageModel';
import { fitNormal, fitStudentT, fitBestDistribution, logGamma } from '../distributionFitting';
import { drawCorrelatedStudentT, studentTCdf, normalCdf, choleskyLower, ensurePsdCorrelation } from '../correlatedResampling';
import { createSeededRng, meanAndStdDev, randomNormal, randomStudentT, calculateMaxDrawdown } from '../mathUtils';
import { computeHistoricalStats } from '../simulationEngine';
import { fitGarch11, simulateGarchPath } from '../garch';
import { computeConvergence } from '../convergenceDiagnostics';
import { computeDrawdownDurations, computeTimeUnderWater } from '../drawdownDuration';
import { computeStressScenarios } from '../stressTesting';
import { buildDynamicCopulaModel, sampleNextRegime } from '../dynamicCopula';

// ═══════════════════════════════════════════════════════════
// Test Harness
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
  if (!ok) {
    label += ` (got ${actual}, expected ${expected} ± ${tol})`;
  }
  assert(ok, label);
}

function section(name: string) {
  console.log(`\n══ ${name} ══`);
}

// ═══════════════════════════════════════════════════════════
// 1. BLOCK BOOTSTRAP
// ═══════════════════════════════════════════════════════════
section('Block Bootstrap');

(() => {
  const rng = createSeededRng(42);
  const data = Array.from({ length: 100 }, (_, i) => i);

  // Basic functionality
  const result = stationaryBlockBootstrap(data, 100, 5, rng);
  assert(result.length === 100, 'Returns correct number of draws');
  assert(result.every(v => v >= 0 && v < 100), 'All values within original data range');

  // Block structure: consecutive values should appear in runs
  let hasBlock = false;
  for (let i = 1; i < result.length; i++) {
    // Check if consecutive elements are also consecutive in original data (mod wrap)
    if (result[i] === (result[i-1] + 1) % 100) {
      hasBlock = true;
      break;
    }
  }
  assert(hasBlock, 'Contains at least one contiguous block (temporal structure preserved)');

  // Edge case: block length 1 = iid bootstrap
  const iid = stationaryBlockBootstrap(data, 50, 1, rng);
  assert(iid.length === 50, 'Block length 1 produces correct size output');

  // Edge case: very large block length
  const bigBlock = stationaryBlockBootstrap(data, 100, 100, rng);
  assert(bigBlock.length === 100, 'Very large block length still works');

  // Optimal block length estimation
  // Create autocorrelated data
  const autocorrelated: number[] = [0];
  const rng2 = createSeededRng(123);
  for (let i = 1; i < 200; i++) {
    autocorrelated.push(0.7 * autocorrelated[i-1] + randomNormal(rng2) * 0.3);
  }
  const opt = optimalBlockLength(autocorrelated);
  assert(opt.avgBlockLength >= 1, 'Optimal block length >= 1');
  assert(Math.abs(opt.lag1Autocorrelation) > 0.05, 'Detects significant autocorrelation in AR(1) data');

  // IID data should have block length ~ 1
  const iidData = Array.from({ length: 200 }, () => randomNormal(rng2));
  const optIid = optimalBlockLength(iidData);
  // With truly iid data, lag1 should be near zero
  assert(Math.abs(optIid.lag1Autocorrelation) < 0.3, 'Low autocorrelation in iid data');

  // Edge: tiny dataset
  const tiny = optimalBlockLength([1, 2, 3]);
  assert(tiny.avgBlockLength >= 1, 'Handles tiny datasets gracefully');
})();

// ═══════════════════════════════════════════════════════════
// 2. SLIPPAGE MODEL
// ═══════════════════════════════════════════════════════════
section('Slippage Model');

(() => {
  // 'none' model
  const noneConfig: SlippageConfig = { model: 'none', fixedSlippagePerTrade: 10, impactCoefficient: 0.1, baseVolatility: 100 };
  assertApprox(computeSlippage(noneConfig, 500, 1.0, 100), 0, 0.001, "'none' model returns 0");

  // 'fixed' model
  const fixedConfig: SlippageConfig = { model: 'fixed', fixedSlippagePerTrade: 5.25, impactCoefficient: 0.1, baseVolatility: 100 };
  assertApprox(computeSlippage(fixedConfig, 500, 1.0, 100), 5.25, 0.001, "'fixed' model returns fixedSlippagePerTrade");
  assertApprox(computeSlippage(fixedConfig, -200, 2.0, 100), 5.25, 0.001, "'fixed' model ignores trade size and multiplier");

  // 'sqrt_impact' model
  const sqrtConfig: SlippageConfig = { model: 'sqrt_impact', fixedSlippagePerTrade: 0, impactCoefficient: 0.1, baseVolatility: 100 };
  const slip1 = computeSlippage(sqrtConfig, 500, 1.0, 100);
  const slip2 = computeSlippage(sqrtConfig, 500, 4.0, 100);
  assert(slip1 > 0, 'sqrt_impact produces positive slippage');
  assert(slip2 > slip1, 'Larger position size → more slippage');
  // sqrt(4) = 2, so slip2 should be ~2x slip1
  assertApprox(slip2 / slip1, 2.0, 0.1, 'Slippage scales with sqrt(size)');

  // Slippage is bounded (never exceeds trade PnL)
  const slipSmall = computeSlippage(sqrtConfig, 1, 1.0, 100);
  assert(slipSmall >= 0, 'Slippage non-negative for small trades');

  // Zero trade PnL
  const slipZero = computeSlippage(sqrtConfig, 0, 1.0, 100);
  assert(slipZero >= 0, 'Handles zero PnL trade');

  // Default config
  assert(DEFAULT_SLIPPAGE_CONFIG.model === 'fixed', 'Default config is fixed model');
  assert(DEFAULT_SLIPPAGE_CONFIG.fixedSlippagePerTrade === 0, 'Default fixed slippage is 0');

  // estimateBaseVolatility
  const volatility = estimateBaseVolatility([10, 20, 30, 40, 50]);
  assert(volatility > 0, 'estimateBaseVolatility returns positive value');
  assertApprox(volatility, 15.81, 0.1, 'estimateBaseVolatility matches expected std dev');
})();

// ═══════════════════════════════════════════════════════════
// 3. DISTRIBUTION FITTING (MLE)
// ═══════════════════════════════════════════════════════════
section('Distribution Fitting — MLE');

(() => {
  const rng = createSeededRng(42);

  // logGamma basic checks
  // Γ(1) = 1 → ln(1) = 0
  assertApprox(logGamma(1), 0, 0.001, 'logGamma(1) ≈ 0');
  // Γ(5) = 24 → ln(24) ≈ 3.178
  assertApprox(logGamma(5), Math.log(24), 0.01, 'logGamma(5) ≈ ln(24)');
  // Γ(0.5) = √π → ln(√π) ≈ 0.5724
  assertApprox(logGamma(0.5), 0.5 * Math.log(Math.PI), 0.01, 'logGamma(0.5) ≈ ln(√π)');

  // Fit Normal to Normal data
  const normalData: number[] = [];
  for (let i = 0; i < 500; i++) normalData.push(100 + randomNormal(rng) * 20);
  const normalFit = fitNormal(normalData);
  assert(normalFit.type === 'normal', 'fitNormal returns type=normal');
  assertApprox(normalFit.mu, 100, 5, 'Normal fit μ near true mean');
  assertApprox(normalFit.sigma, 20, 5, 'Normal fit σ near true std');
  assert(normalFit.logLikelihood < 0, 'Log-likelihood is negative');
  assert(normalFit.aic > 0, 'AIC is positive');
  assert(normalFit.bic > 0, 'BIC is positive');

  // Fit Student-t to heavy-tailed data
  const heavyData: number[] = [];
  for (let i = 0; i < 500; i++) heavyData.push(50 + randomStudentT(4, rng) * 15);
  const tFit = fitStudentT(heavyData);
  assert(tFit.type === 'student_t', 'fitStudentT returns type=student_t');
  assert(tFit.df !== undefined && tFit.df > 0, 'Student-t fit has positive df');
  assert(tFit.df! < 15, 'Student-t fit df < 15 for heavy-tailed data');
  assertApprox(tFit.mu, 50, 10, 'Student-t fit μ near true location');

  // fitBestDistribution should pick Student-t for heavy-tailed data
  const bestHeavy = fitBestDistribution(heavyData);
  assert(bestHeavy.all.length === 2, 'fitBestDistribution returns 2 candidates');
  assert(bestHeavy.best.type === 'student_t', 'Best fit for heavy-tailed data is Student-t');

  // fitBestDistribution should pick Normal for Gaussian data
  const bestNormal = fitBestDistribution(normalData);
  // Note: with finite samples, t might still win — check that at least both are fit
  assert(bestNormal.all.length === 2, 'Both distributions fitted for normal data');
  // The key check: BIC of best <= BIC of alternative
  const altBic = bestNormal.all.find(f => f.type !== bestNormal.best.type)?.bic ?? Infinity;
  assert(bestNormal.best.bic <= altBic, 'Best distribution has lowest BIC');

  // Edge: constant data
  const constData = Array(50).fill(42);
  const constFit = fitNormal(constData);
  assertApprox(constFit.mu, 42, 0.001, 'Constant data: mu = constant value');
  // sigma should be 0 or near 0
  assert(constFit.sigma >= 0, 'Constant data: sigma >= 0');

  // Edge: two values
  const twoFit = fitNormal([10, 20]);
  assert(twoFit.mu === 15, 'Two values: mu = average');
})();

// ═══════════════════════════════════════════════════════════
// 4. STUDENT-T COPULA
// ═══════════════════════════════════════════════════════════
section('Student-t Copula & Correlated Resampling');

(() => {
  const rng = createSeededRng(42);

  // Normal CDF checks
  assertApprox(normalCdf(0), 0.5, 0.01, 'Φ(0) ≈ 0.5');
  assert(normalCdf(3) > 0.99, 'Φ(3) > 0.99');
  assert(normalCdf(-3) < 0.01, 'Φ(-3) < 0.01');

  // Student-t CDF checks
  assertApprox(studentTCdf(0, 5), 0.5, 0.05, 't-CDF(0, df=5) ≈ 0.5');
  assert(studentTCdf(5, 5) > 0.9, 't-CDF(5, df=5) > 0.9');
  assert(studentTCdf(-5, 5) < 0.1, 't-CDF(-5, df=5) < 0.1');

  // Cholesky decomposition
  const corrMatrix = [
    [1.0, 0.8],
    [0.8, 1.0]
  ];
  const L = choleskyLower(corrMatrix);
  assert(L !== null, 'Cholesky succeeds on valid correlation matrix');
  if (L) {
    // Verify L * L^T ≈ original
    const reconstructed00 = L[0][0] * L[0][0] + L[0][1] * L[0][1];
    assertApprox(reconstructed00, 1.0, 0.001, 'Cholesky reconstruction [0,0] = 1');
    const reconstructed01 = L[1][0] * L[0][0] + L[1][1] * L[0][1];
    assertApprox(reconstructed01, 0.8, 0.001, 'Cholesky reconstruction [1,0] = 0.8');
  }

  // Non-PSD matrix gets shrunk
  const badMatrix = [
    [1.0, 1.5],
    [1.5, 1.0]
  ];
  const fixed = ensurePsdCorrelation(badMatrix);
  const Lfixed = choleskyLower(fixed);
  assert(Lfixed !== null, 'ensurePsdCorrelation fixes non-PSD matrix');

  // drawCorrelatedStudentT produces correct dimension
  if (L) {
    const draws = drawCorrelatedStudentT(L, 5, rng);
    assert(draws.length === 2, 'Student-t copula produces correct dimensionality');
    assert(draws.every(d => isFinite(d)), 'All draws are finite');

    // Statistical test: run many draws and check correlation is positive
    const n = 5000;
    const x: number[] = [], y: number[] = [];
    for (let i = 0; i < n; i++) {
      const d = drawCorrelatedStudentT(L, 5, rng);
      x.push(d[0]);
      y.push(d[1]);
    }
    const { mean: mx } = meanAndStdDev(x);
    const { mean: my } = meanAndStdDev(y);
    let cov = 0;
    for (let i = 0; i < n; i++) cov += (x[i] - mx) * (y[i] - my);
    cov /= n;
    const { std: sx } = meanAndStdDev(x);
    const { std: sy } = meanAndStdDev(y);
    const corr = cov / (sx * sy);
    assert(corr > 0.3, `Student-t copula draws are positively correlated (ρ=${corr.toFixed(3)})`);

    // Tail dependence test: check that extreme events co-occur
    // Count how often both are in the bottom 5%
    const xSorted = [...x].sort((a, b) => a - b);
    const ySorted = [...y].sort((a, b) => a - b);
    const xThresh = xSorted[Math.floor(n * 0.05)];
    const yThresh = ySorted[Math.floor(n * 0.05)];
    let jointTail = 0;
    for (let i = 0; i < n; i++) {
      if (x[i] <= xThresh && y[i] <= yThresh) jointTail++;
    }
    const jointTailRate = jointTail / n;
    // Under independence, this would be 0.05 * 0.05 = 0.0025
    // Under Gaussian copula with ρ=0.8, it's higher
    // Under Student-t copula, it should be even higher
    assert(jointTailRate > 0.003, `Joint tail rate ${(jointTailRate * 100).toFixed(2)}% > independence baseline 0.25%`);
  }
})();

// ═══════════════════════════════════════════════════════════
// 5. HISTORICAL STATS COMPUTATION
// ═══════════════════════════════════════════════════════════
section('Historical Stats Computation');

(() => {
  // Known data
  const pnls = [100, -50, 200, -30, 150, -80, 50, -20, 300, -100];
  const path = [10000];
  for (const p of pnls) path.push(path[path.length - 1] + p);
  const maxDd = calculateMaxDrawdown(path);

  const stats = computeHistoricalStats(pnls, path, maxDd, 252);

  assert(stats.totalTrades === 10, 'Total trades correct');
  
  // Win rate: 5 wins out of 10
  assertApprox(stats.winRate, 50, 0.1, 'Win rate = 50%');
  
  // Profit factor: gross profit / gross loss = 800 / 280
  assertApprox(stats.profitFactor, 800 / 280, 0.01, 'Profit factor correct');
  
  // Expectancy = mean PnL = 520 / 10 = 52
  assertApprox(stats.expectancy, 52, 0.1, 'Expectancy correct');

  // Max consecutive losses
  // Sequence: W L W L W L W L W L → max consec losses = 1
  assert(stats.maxConsecutiveLosses === 1, 'Max consecutive losses = 1');

  // Sharpe and Sortino should be positive for net-positive PnL
  assert(stats.sharpeRatio > 0, 'Sharpe ratio > 0 for profitable data');
  assert(stats.sortinoRatio > 0, 'Sortino ratio > 0 for profitable data');

  // Kelly criterion should be positive for profitable strategy
  assert(stats.kellyCriterion > 0, 'Kelly criterion > 0');
  assert(stats.kellyCriterion < 1, 'Kelly criterion < 1');

  // Recovery factor
  assert(stats.recoveryFactor > 0, 'Recovery factor > 0');

  // All-losing data
  const lossPnls = [-10, -20, -30, -40, -50];
  const lossPath = [10000];
  for (const p of lossPnls) lossPath.push(lossPath[lossPath.length - 1] + p);
  const lossStats = computeHistoricalStats(lossPnls, lossPath, calculateMaxDrawdown(lossPath), 252);
  assertApprox(lossStats.winRate, 0, 0.001, 'All-losing: win rate = 0%');
  assert(lossStats.kellyCriterion === 0, 'All-losing: Kelly = 0');
  assertApprox(lossStats.maxConsecutiveLosses, 5, 0.001, 'All-losing: max consec = 5');

  // Empty data
  const emptyStats = computeHistoricalStats([], [10000], 0, 252);
  assert(emptyStats.totalTrades === 0, 'Empty data: 0 trades');
  assertApprox(emptyStats.winRate, 0, 0.001, 'Empty data: 0% win rate');
})();

// ═══════════════════════════════════════════════════════════
// 6. MATH UTILS EDGE CASES
// ═══════════════════════════════════════════════════════════
section('Math Utils Edge Cases');

(() => {
  // Max drawdown
  const flatEquity = [100, 100, 100, 100];
  assertApprox(calculateMaxDrawdown(flatEquity), 0, 0.001, 'Flat equity: 0% drawdown');

  const monotoneUp = [100, 200, 300, 400];
  assertApprox(calculateMaxDrawdown(monotoneUp), 0, 0.001, 'Monotone up: 0% drawdown');

  const v_shape = [100, 50, 100];
  assertApprox(calculateMaxDrawdown(v_shape), 0.5, 0.001, 'V-shape: 50% drawdown');

  // meanAndStdDev edge cases
  const { mean: m0, std: s0 } = meanAndStdDev([]);
  assert(m0 === 0 && s0 === 0, 'Empty array: mean=0, std=0');

  const { mean: m1, std: s1 } = meanAndStdDev([42]);
  assert(m1 === 42 && s1 === 0, 'Single element: mean=value, std=0');

  // Seeded RNG reproducibility
  const rng1 = createSeededRng(42);
  const rng2 = createSeededRng(42);
  const seq1 = Array.from({ length: 100 }, () => rng1());
  const seq2 = Array.from({ length: 100 }, () => rng2());
  assert(seq1.every((v, i) => v === seq2[i]), 'Seeded RNG is fully reproducible');

  // Different seeds give different sequences
  const rng3 = createSeededRng(99);
  const seq3 = Array.from({ length: 10 }, () => rng3());
  assert(!seq1.slice(0, 10).every((v, i) => v === seq3[i]), 'Different seeds give different sequences');
})();

// ═══════════════════════════════════════════════════════════
// 7. GARCH(1,1) VOLATILITY MODEL
// ═══════════════════════════════════════════════════════════
section('GARCH(1,1) Volatility Model');
(() => {
  const rng = createSeededRng(42);
  const data = [];
  for (let i = 0; i < 500; i++) data.push(randomNormal(rng) * 10);
  
  const garch = fitGarch11(data);
  assert(garch.params.omega > 0, 'GARCH omega is positive');
  assert(garch.params.alpha >= 0, 'GARCH alpha >= 0');
  assert(garch.params.beta >= 0, 'GARCH beta >= 0');
  assert(garch.params.persistence < 1, 'GARCH persistence < 1 (stationary)');
  
  const sim = simulateGarchPath(garch.params, 100, rng);
  assert(sim.length === 100, 'GARCH path has correct length');
})();

// ═══════════════════════════════════════════════════════════
// 8. DRAWDOWN DURATION
// ═══════════════════════════════════════════════════════════
section('Drawdown Duration');
(() => {
  const equity = [100, 90, 80, 95, 105, 95, 110];
  const dd = computeDrawdownDurations(equity);
  assert(dd.length === 2, 'Detects 2 distinct drawdown periods');
  
  const stats = computeTimeUnderWater(equity);
  assert(stats.maxDuration === 3, 'Max duration is 3 trades');
  assert(stats.currentDuration === 0, 'Not currently in drawdown at end');
})();

// ═══════════════════════════════════════════════════════════
// 9. CONVERGENCE DIAGNOSTICS
// ═══════════════════════════════════════════════════════════
section('Convergence Diagnostics');
(() => {
  const finalBalances = Array.from({ length: 5000 }, () => 10000 + Math.random() * 5000);
  const maxDrawdowns = Array.from({ length: 5000 }, () => Math.random() * 0.2);
  const conv = computeConvergence(finalBalances, maxDrawdowns, 10000, 10);
  assert(conv.checkpoints.length > 0, 'Generates checkpoints');
  assert(conv.checkpoints[0].n === 100, 'First checkpoint is N=100');
})();

// ═══════════════════════════════════════════════════════════
// 10. STRESS TESTING
// ═══════════════════════════════════════════════════════════
section('Stress Testing');
(() => {
  const pnls = [10, -5, 20, -10, 15, -2, -3, -5, 10, -8];
  const stress = computeStressScenarios(pnls, 100, 10);
  assert(stress.scenarios.length === 10, 'Generates 10 scenarios');
  assert(stress.scenarios.some(s => s.name.includes('Volatility')), 'Includes Volatility shock');
  assert(stress.scenarios.some(s => s.name.includes('Black Swan')), 'Includes Black Swan');
})();

// ═══════════════════════════════════════════════════════════
// 11. DYNAMIC COPULA (REGIME-SWITCHING)
// ═══════════════════════════════════════════════════════════
section('Dynamic Copula');
(() => {
  const rng = createSeededRng(42);
  const pnl1 = [1, 2, 1, 2, 10, 20, 10, 20];
  const pnl2 = [1, 2, 1, 2, -10, -20, -10, -20];
  const regimes = ['normal', 'normal', 'normal', 'normal', 'crisis', 'crisis', 'crisis', 'crisis'];
  const alignedPnls = [pnl1, pnl2];

  const model = buildDynamicCopulaModel(alignedPnls, regimes);

  assert(model.regimes.includes('normal') && model.regimes.includes('crisis'), 'Detects all regimes');
  assert(Object.keys(model.choleskyLByRegime).length === 2, 'Builds Cholesky matrices for each regime');
  assert(model.initialProbabilities['normal'] === 0.5, 'Computes correct initial probabilities');
  assert(model.transitionMatrix['normal']['crisis'] === 1/4, 'Computes empirical transition probabilities');

  // Verify transition sampling
  let toCrisisCount = 0;
  for (let i = 0; i < 1000; i++) {
    const next = sampleNextRegime('normal', model, rng);
    if (next === 'crisis') toCrisisCount++;
  }
  // Expected transition normal->crisis is 1/4, so ~250
  assert(toCrisisCount > 150 && toCrisisCount < 350, 'Markov transition sampling matches empirical probabilities');
})();

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(50));
console.log(`RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failures.length > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  ❌ ${f}`));
}
console.log('═'.repeat(50));
process.exit(failed > 0 ? 1 : 0);
