/**
 * Supplementary end-to-end test that runs the **GARCH** and **Portfolio**
 * (multi-instrument sleeve) models against a real NinjaTrader Grid CSV,
 * complementing `e2e_real_data.test.ts` (which covers basic / regime /
 * parametric).
 *
 * Same skip semantics as the sibling test:
 *   - Resolve the CSV path from `MC_E2E_CSV` env var or argv[2].
 *   - Skip with exit 0 when the CSV is not provided / not found.
 *
 * Run:
 *   $env:MC_E2E_CSV = 'C:\path\to\NinjaTrader Grid ....csv'
 *   npx tsx src/__tests__/e2e_real_data_garch_portfolio.test.ts
 */

import * as fs from 'fs';
import { ensureWasmInitialized } from './nodeWasmBootstrap';
import { runSimulation } from '../simulationEngine';
import { runPortfolioSimulation } from '../portfolioEngine';
import type { DailyData, StrategyAllocation } from '../types';

// Pre-initialize wasm-engine for Node — see comment in e2e_real_data.test.ts.
await ensureWasmInitialized();

// ─── Harness ─────────────────────────────────────────────────────
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

function section(name: string) {
  console.log(`\n══ ${name} ══`);
}

// ─── CSV resolution ──────────────────────────────────────────────
section('CSV Parsing');
const CSV_PATH = process.env.MC_E2E_CSV ?? process.argv[2];

if (!CSV_PATH || CSV_PATH.trim() === '') {
  console.log('  ⏭️  SKIP: no CSV path provided.');
  console.log('     Set MC_E2E_CSV or pass the path as argv[1].');
  process.exit(0);
}
if (!fs.existsSync(CSV_PATH)) {
  console.log(`  ⏭️  SKIP: CSV not found at "${CSV_PATH}".`);
  process.exit(0);
}

// Reuse the same minimal parser the sibling test uses — the CSV format is
// fixed (NinjaTrader Grid Trades export).
const raw = fs.readFileSync(CSV_PATH, 'utf-8');
const lines = raw.trim().split('\n').map(l => l.replace(/\r$/, ''));
const header = lines[0].split(',').map(h => h.trim());

const profitIdx = header.indexOf('Profit');
const instrumentIdx = header.indexOf('Instrument');
const exitTimeIdx = header.indexOf('Exit time');

assert(profitIdx !== -1, `Found "Profit" column @ ${profitIdx}`);
assert(instrumentIdx !== -1, `Found "Instrument" column @ ${instrumentIdx}`);
assert(exitTimeIdx !== -1, `Found "Exit time" column @ ${exitTimeIdx}`);

function parseFinancial(s: string): number {
  const cleaned = s.replace(/[\$,\s]/g, '');
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    return -parseFloat(cleaned.slice(1, -1));
  }
  return parseFloat(cleaned);
}

interface ParsedTrade {
  instrument: string;
  pnl: number;
  exitTime: string;
}

const trades: ParsedTrade[] = [];
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',');
  if (cols.length <= Math.max(profitIdx, instrumentIdx, exitTimeIdx)) continue;
  const pnl = parseFinancial(cols[profitIdx]);
  if (!isFinite(pnl)) continue;
  trades.push({
    instrument: (cols[instrumentIdx] ?? '').trim(),
    pnl,
    exitTime: (cols[exitTimeIdx] ?? '').trim(),
  });
}

assert(trades.length > 0, `Parsed ${trades.length} trades`);
assert(trades.length === 127, `Expected 127 trades, got ${trades.length}`);

// All-trades view (single-strategy GARCH)
const allDailyData: DailyData[] = trades.map(t => ({ pnl: t.pnl, timestamp: t.exitTime }));

// Group by instrument for portfolio sleeves
const byInstrument = new Map<string, DailyData[]>();
for (const t of trades) {
  const key = t.instrument || 'UNKNOWN';
  if (!byInstrument.has(key)) byInstrument.set(key, []);
  byInstrument.get(key)!.push({ pnl: t.pnl, timestamp: t.exitTime });
}
const sleeves = [...byInstrument.entries()].map(([name, data]) => ({ name, data }));
console.log(`  Detected ${sleeves.length} instrument sleeves: ${sleeves.map(s => `${s.name} (${s.data.length})`).join(', ')}`);

assert(sleeves.length >= 2, `At least 2 instrument sleeves for portfolio dispatch`);

// ─── Common config (mirrors e2e_real_data.test.ts) ───────────────
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

// ─── GARCH ───────────────────────────────────────────────────────
section('Simulation Engine — GARCH(1,1)');

const garchResult = await runSimulation({
  ...baseConfig,
  modelType: 'garch',
  data: allDailyData,
  dataFormat: 'absolute',
  samplingMode: 'bootstrap',
});

assert(garchResult.modelType === 'garch', '[garch] modelType = garch');
assert(garchResult.nSimulations === 2000, '[garch] nSimulations = 2000');
assert(garchResult.finalBalances.length === 2000, '[garch] 2000 final balances');
assert(garchResult.maxDrawdowns.length === 2000, '[garch] 2000 max drawdowns');
assert(garchResult.paths.length > 0, '[garch] stored paths > 0');
assert(garchResult.ruinProbability >= 0 && garchResult.ruinProbability <= 100,
  `[garch] Ruin prob in [0,100]: ${garchResult.ruinProbability.toFixed(2)}%`);
assert(isFinite(garchResult.meanFinalBalance),
  `[garch] Mean final balance is finite: $${garchResult.meanFinalBalance.toFixed(2)}`);
assert(garchResult.maxDrawdowns.every(d => d >= 0 && d <= 1), '[garch] drawdowns in [0,1]');
assert(garchResult.garchFit !== undefined, '[garch] garchFit attached');
if (garchResult.garchFit) {
  const g = garchResult.garchFit;
  console.log(`    Fit: ω=${g.omega.toExponential(3)}, α=${g.alpha.toFixed(4)}, β=${g.beta.toFixed(4)}, μ=${g.mu.toFixed(2)}`);
  assert(isFinite(g.omega) && g.omega >= 0, '[garch] ω >= 0 and finite');
  assert(isFinite(g.alpha) && g.alpha >= 0, '[garch] α >= 0 and finite');
  assert(isFinite(g.beta) && g.beta >= 0, '[garch] β >= 0 and finite');
  // Stationarity: α + β < 1
  assert(g.alpha + g.beta < 1.0 + 1e-9, `[garch] stationarity α+β < 1: ${(g.alpha + g.beta).toFixed(4)}`);
}

console.log(`    Ruin: ${garchResult.ruinProbability.toFixed(2)}%, Mean: $${garchResult.meanFinalBalance.toFixed(0)}, ` +
  `VaR95: $${garchResult.institutionalMetrics.var95.toFixed(0)}, CVaR95: $${garchResult.institutionalMetrics.cvar95.toFixed(0)}`);

// Reproducibility for GARCH
const garchRun2 = await runSimulation({
  ...baseConfig,
  modelType: 'garch',
  data: allDailyData,
  dataFormat: 'absolute',
  samplingMode: 'bootstrap',
});
assert(garchResult.meanFinalBalance === garchRun2.meanFinalBalance,
  '[garch] Same seed → identical mean final balance');
assert(garchResult.finalBalances.every((v, i) => v === garchRun2.finalBalances[i]),
  '[garch] Same seed → all final balances bit-identical');

// ─── Portfolio (instruments as sleeves) ──────────────────────────
section('Simulation Engine — Portfolio (per-instrument sleeves)');

// The portfolio engine requires every sleeve to have at least horizon rows of data
// when `portfolioAlignedRows: true`, AND it iterates t = 0..horizon-1 over each sleeve.
// We pad shorter sleeves by recycling their rows so the horizon = max sleeve length.
const minLen = Math.min(...sleeves.map(s => s.data.length));
const horizon = minLen; // safe horizon = shortest sleeve length
console.log(`  Portfolio horizon = ${horizon} (min sleeve length)`);

const allocations: StrategyAllocation[] = sleeves.map((s, i) => ({
  id: `sleeve-${i}`,
  name: s.name,
  weight: 1 / sleeves.length,
  data: s.data,
}));

for (const resampling of ['independent', 'gaussian_copula', 'student_t_copula'] as const) {
  const portfolioResult = await runPortfolioSimulation({
    ...baseConfig,
    modelType: 'portfolio',
    strategies: allocations,
    dataFormat: 'absolute',
    samplingMode: 'bootstrap',
    portfolioResampling: resampling,
    portfolioAlignedRows: false, // sleeves have unequal lengths
    nTrades: horizon,
  });

  assert(portfolioResult.modelType === 'portfolio', `[portfolio/${resampling}] modelType = portfolio`);
  assert(portfolioResult.nSimulations === 2000, `[portfolio/${resampling}] nSimulations = 2000`);
  assert(portfolioResult.finalBalances.length === 2000, `[portfolio/${resampling}] 2000 final balances`);
  assert(portfolioResult.paths.length > 0, `[portfolio/${resampling}] stored paths > 0`);
  assert(portfolioResult.ruinProbability >= 0 && portfolioResult.ruinProbability <= 100,
    `[portfolio/${resampling}] Ruin prob in [0,100]: ${portfolioResult.ruinProbability.toFixed(2)}%`);
  assert(isFinite(portfolioResult.meanFinalBalance),
    `[portfolio/${resampling}] Mean final balance finite: $${portfolioResult.meanFinalBalance.toFixed(2)}`);
  assert(portfolioResult.maxDrawdowns.every(d => d >= 0 && d <= 1),
    `[portfolio/${resampling}] all drawdowns in [0,1]`);
  assert(portfolioResult.portfolioMeta !== undefined, `[portfolio/${resampling}] portfolioMeta attached`);

  if (portfolioResult.portfolioMeta) {
    const meta = portfolioResult.portfolioMeta;
    assert(meta.strategies.length === sleeves.length,
      `[portfolio/${resampling}] one strategy result per sleeve`);
    assert(meta.correlationMatrix.length === sleeves.length,
      `[portfolio/${resampling}] correlation matrix is N×N`);
    assert(meta.correlationMatrixUsed.length === sleeves.length,
      `[portfolio/${resampling}] PSD-corrected matrix is N×N`);
    // Correlation diagonal must be 1.0
    const diagOk = meta.correlationMatrix.every((row, i) => Math.abs(row[i] - 1.0) < 1e-9);
    assert(diagOk, `[portfolio/${resampling}] correlation diagonal = 1`);
    // Off-diagonal in [-1, 1]
    const offOk = meta.correlationMatrix.every((row, i) =>
      row.every((v, j) => i === j || (v >= -1.0001 && v <= 1.0001)));
    assert(offOk, `[portfolio/${resampling}] correlation off-diagonal in [-1,1]`);
    assert(isFinite(meta.diversificationRatio) && meta.diversificationRatio > 0,
      `[portfolio/${resampling}] diversification ratio finite and > 0: ${meta.diversificationRatio.toFixed(3)}`);
  }
  assert(portfolioResult.runMeta.prngFamily === 'mulberry32-ts',
    `[portfolio/${resampling}] runMeta.prngFamily = mulberry32-ts (TS-only path)`);

  console.log(`    ${resampling}: ruin=${portfolioResult.ruinProbability.toFixed(2)}%, ` +
    `mean=$${portfolioResult.meanFinalBalance.toFixed(0)}, ` +
    `divRatio=${portfolioResult.portfolioMeta?.diversificationRatio.toFixed(3)}, ` +
    `VaR95=$${portfolioResult.institutionalMetrics.var95.toFixed(0)}`);
}

// Portfolio reproducibility
section('Portfolio — Reproducibility');
const portRun1 = await runPortfolioSimulation({
  ...baseConfig,
  modelType: 'portfolio',
  strategies: allocations,
  dataFormat: 'absolute',
  samplingMode: 'bootstrap',
  portfolioResampling: 'gaussian_copula',
  portfolioAlignedRows: false,
  nTrades: horizon,
  randomSeed: 4242,
});
const portRun2 = await runPortfolioSimulation({
  ...baseConfig,
  modelType: 'portfolio',
  strategies: allocations,
  dataFormat: 'absolute',
  samplingMode: 'bootstrap',
  portfolioResampling: 'gaussian_copula',
  portfolioAlignedRows: false,
  nTrades: horizon,
  randomSeed: 4242,
});
assert(portRun1.meanFinalBalance === portRun2.meanFinalBalance,
  '[portfolio] same seed → identical mean final balance');
assert(portRun1.finalBalances.every((v, i) => v === portRun2.finalBalances[i]),
  '[portfolio] same seed → all final balances bit-identical');

// ─── Summary ─────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failures.length > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  ❌ ${f}`));
}
console.log('═'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
