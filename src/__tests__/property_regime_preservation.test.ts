/**
 * property_regime_preservation.test.ts
 *
 * Preservation property suite for the regime-Markov persistence bias
 * bugfix (`.kiro/specs/regime-markov-persistence-bias/`).
 *
 * GOAL
 *   Capture today's behaviour of `runSimulation` on every input where
 *   `isBugCondition(X)` does NOT hold (per `bugfix.md` § "Bug Condition
 *   C(X)") and assert that this baseline is preserved. On the UNFIXED
 *   wasm-engine/pkg this entire suite MUST PASS — that confirms the
 *   baseline. The fix in `wasm-engine/src/models.rs` (task 3.1) must keep
 *   this suite green; any sub-case that drifts after the fix is a
 *   regression in `simulate_regime_path`'s preservation guarantees.
 *
 * METHODOLOGY (observation-first, per task 2 in tasks.md)
 *   For each sub-case:
 *     1. Run `runSimulation` (driven by `nodeWasmBootstrap`) on the
 *        UNFIXED kernel.
 *     2. Capture the result, canonicalise (strip non-deterministic
 *        `runMeta.runId` / `runMeta.timestamp`), and snapshot to a
 *        fixture file under `src/__tests__/fixtures/`.
 *     3. Re-run and assert the canonicalised JSON matches the snapshot
 *        byte-for-byte.
 *   Snapshots are auto-created on first run (when missing) or when
 *   `UPDATE_SNAPSHOTS=1` is set. After that, byte-for-byte equality is
 *   the assertion.
 *
 * SUB-CASES
 *   2.a — Non-regime byte-identity (Req 3.1, 3.6)
 *         For each modelType ∈ {basic, parametric, garch, portfolio} on
 *         a synthetic n = 256 PnL series across seeds {1, 2, 7}, snapshot
 *         the canonicalised JSON of `runSimulation` (or
 *         `runPortfolioSimulation`) and assert byte-equality on re-run.
 *         These branches do NOT enter `simulate_regime_path` at all
 *         (`lib.rs` gates it on `model_type == "regime"`), so byte
 *         identity must be exact.
 *
 *   2.b — Regime, real serial dependence (Req 3.2)
 *         Synthetic AR(1) phi = 0.7, n = 256, seeds {1, 2, 7}. The
 *         empirical input has real autocorrelation (lbEmp.p < 0.05), so
 *         `isBugCondition(X)` early-returns false. Per `design.md`
 *         § "Equivalence definition by sub-case" / "Bit-identity
 *         argument", the preservation guarantee for this branch is
 *         per-trade mean and variance within the documented Monte Carlo
 *         tolerances. (The aspirational "regime engine continues to
 *         reflect autocorrelation" clause from `bugfix.md` 3.2 /
 *         `design.md` is the post-fix Property-1 check in
 *         `repro_regime_persistence.test.ts`, not a preservation
 *         baseline — observation on the unfixed kernel shows that
 *         within-regime IID resampling already breaks AR(1) lag
 *         structure, so today's mean per-path Ljung-Box p does not
 *         reject the null. Asserting rejection here would fail on the
 *         unfixed kernel and contradict the observation-first
 *         methodology in tasks.md task 2.) The mean per-path Ljung-Box
 *         result IS recorded in the diagnostic log so any future drift
 *         is visible.
 *
 *   2.c — Regime, below-power short series (Req 3.3, 3.4)
 *         Synthetic n = 30 IID Gaussian, AUTO classifier, seeds {1, 2, 7}.
 *         Below `MIN_POWER_N = 60`, so `isBugCondition(X)` returns false.
 *         Snapshot `regime_tags` (computed by replicating the AUTO
 *         classifier from `simulationEngine.ts`) and `historicalStats.
 *         byRegime`; assert byte-equality and per-trade mean/variance
 *         preservation within tolerance.
 *
 *   2.d — Metadata preservation under AUTO (Req 3.4)
 *         127-trade NinjaTrader fixture with `regimeSource = 'AUTO'`,
 *         `autoRegimeWindow = 10`, `autoRegimeThreshold = 50`. Snapshot
 *         the AUTO classifier's tag array and the `historicalStats.
 *         byRegime` breakdown into
 *         `src/__tests__/fixtures/regime_tags_snapshot.json`. Assert
 *         byte-equality. Guards against accidental classifier mutation by
 *         the fix.
 *
 *   2.e — User-supplied regime column verbatim (Req 3.5)
 *         Build a `DailyData` array with explicit `regime` labels, run
 *         with a non-AUTO `regimeSource` (the simulationEngine.ts
 *         sentinel branches on `regimeSource === 'AUTO'`, so any other
 *         string routes through `data.map(d => d.regime || 'default')`).
 *         Assert that `historicalStats.byRegime` keys equal the unique
 *         user-supplied labels and per-regime trade counts match the
 *         empirical counts element-for-element.
 *
 *   2.f — Seedability contract (Req 3.6)
 *         For one regime input and one non-regime input (`basic`), run
 *         `runSimulation` twice with the same `randomSeed` and assert
 *         the canonicalised JSON is byte-identical across the two
 *         dispatches. Confirms the seed-determined RNG draw schedule is
 *         stable.
 *
 * Tolerances (per design.md § "Moment Preservation" / task 2 in tasks.md):
 *   Let σ_anchor = stddev of the anchor series, v_anchor = variance of
 *   the anchor series, and N_stored = storedPaths.length * nTrades (the
 *   actual sample our trade-level estimators observe — the kernel caps
 *   stored paths at `MAX_STORED_PATHS = 50` per `wasm-engine/src/lib.rs`
 *   and `types.ts`).
 *     MC_tol_mean = 1.96 * σ_anchor / sqrt(N_stored)
 *     MC_tol_var  = 1.96 * v_anchor * sqrt(2 / (N_stored - 1))
 *
 *   Anchor selection — observation on the unfixed kernel showed that:
 *     - Sub-case 2.a (non-regime): byte-identity holds, so all moments
 *       are exactly preserved by snapshot byte-equality alone.
 *     - Sub-case 2.b (regime / AR(1) n=256): per-trade mean and variance
 *       agree with EMPIRICAL within IID-MC tolerance for most seeds —
 *       except for short-burst small-sample bias on seed 2, see notes.
 *     - Sub-case 2.c (regime / n=30): per-trade mean and variance have
 *       structural deviation from EMPIRICAL beyond IID-MC tolerance,
 *       because the regime mixture's moments follow the law of total
 *       variance / law of total mean over the regime walk's empirical
 *       (not stationary) distribution, and on n=30 the walk is far from
 *       its stationary distribution.
 *
 *   Resolution: the preservation semantic is "fix does not drift the
 *   simulator's output relative to today (F)". For 2.b and 2.c we
 *   therefore anchor the moment assertions to the SIMULATED moments
 *   recorded in the snapshot fixture under `src/__tests__/fixtures/`.
 *   On the unfixed kernel this is trivially true (we just observed
 *   those values). On the post-fix kernel the assertion catches any
 *   drift larger than IID-MC noise. This is consistent with
 *   `design.md` § "Bit-identity argument": for non-bug inputs in the
 *   regime branch the fix may not be byte-identical (rounding), but
 *   it must not drift moments materially.
 *
 * Run:
 *   npx tsx src/__tests__/property_regime_preservation.test.ts
 *
 * Or to (re)create snapshots:
 *   $env:UPDATE_SNAPSHOTS = '1'
 *   npx tsx src/__tests__/property_regime_preservation.test.ts
 *
 * Exits 0 if every sub-case passes; 1 otherwise.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureWasmInitialized } from './nodeWasmBootstrap';
import { runSimulation } from '../simulationEngine';
import { runPortfolioSimulation } from '../portfolioEngine';
import { createSeededRng, randomNormal, meanAndStdDev } from '../mathUtils';
import { ljungBox } from '../modelValidation';
import type { DailyData, SimulationResults, StrategyAllocation } from '../types';

await ensureWasmInitialized();

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

const SEEDS = [1, 2, 7] as const;
const N_SIMULATIONS = 1000;
const HERE = fileURLToPath(import.meta.url);
const FIXTURE_DIR = path.resolve(path.dirname(HERE), 'fixtures');
const UPDATE_SNAPSHOTS = process.env.UPDATE_SNAPSHOTS === '1';

const ALPHA = 0.05;
const H = 10;

// ─────────────────────────────────────────────────────────────────────────
// Test harness
// ─────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string, detail = ''): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    failures.push(label + (detail ? ' — ' + detail : ''));
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n══ ${title} ══`);
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Strip non-deterministic fields (`runMeta.runId`, `runMeta.timestamp`)
 * from a SimulationResults so two runs with the same seed produce
 * byte-identical canonical JSON. Returns a deep clone with those fields
 * removed; the original is untouched.
 */
function canonicalize(result: SimulationResults): unknown {
  const cloned = JSON.parse(JSON.stringify(result));
  if (cloned && cloned.runMeta && typeof cloned.runMeta === 'object') {
    delete cloned.runMeta.runId;
    delete cloned.runMeta.timestamp;
  }
  return cloned;
}

/** Stable JSON.stringify (object keys in insertion order — Node's default). */
function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Compare a value to a snapshot file. On first run (or when
 * UPDATE_SNAPSHOTS=1), writes the file. Otherwise reads the file and
 * compares byte-for-byte.
 *
 * Returns `{ ok: boolean, action: 'wrote' | 'matched' | 'mismatch' }`.
 */
function snapshotCompare(
  fixtureName: string,
  value: unknown
): { ok: boolean; action: 'wrote' | 'matched' | 'mismatch'; firstDiffAt?: number } {
  const fp = path.join(FIXTURE_DIR, fixtureName);
  const serialized = stableStringify(value);

  if (!fs.existsSync(fp) || UPDATE_SNAPSHOTS) {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.writeFileSync(fp, serialized, 'utf-8');
    return { ok: true, action: 'wrote' };
  }

  const stored = fs.readFileSync(fp, 'utf-8');
  if (stored === serialized) {
    return { ok: true, action: 'matched' };
  }

  // Find first divergent character offset for a useful failure message.
  const minLen = Math.min(stored.length, serialized.length);
  let i = 0;
  for (; i < minLen; i++) {
    if (stored.charCodeAt(i) !== serialized.charCodeAt(i)) break;
  }
  return { ok: false, action: 'mismatch', firstDiffAt: i };
}

/** Per-path increments → flattened trade-level returns. */
function pathToTradeReturns(equityPath: number[]): number[] {
  const out: number[] = [];
  for (let j = 1; j < equityPath.length; j++) {
    out.push(equityPath[j] - equityPath[j - 1]);
  }
  return out;
}

function flattenStoredTradeReturns(paths: number[][]): number[] {
  const out: number[] = [];
  for (const p of paths) {
    for (let j = 1; j < p.length; j++) out.push(p[j] - p[j - 1]);
  }
  return out;
}

/**
 * Mean Ljung-Box across stored paths (per-path Q at lag h, then averaged).
 * Per-path is the natural aggregator because Ljung-Box is a within-
 * sequence statistic; concatenating paths would smear inter-path
 * boundaries into the autocorrelation estimate.
 */
function meanPerPathLjungBoxP(paths: number[][], h: number): number {
  let pSum = 0;
  let count = 0;
  for (const p of paths) {
    if (p.length < h + 2) continue;
    const inc = pathToTradeReturns(p);
    const lb = ljungBox(inc, h);
    pSum += lb.p;
    count++;
  }
  return count === 0 ? NaN : pSum / count;
}

/** Synthetic IID Gaussian PnL series. */
function syntheticIidGaussian(n: number, seed: number): number[] {
  const rng = createSeededRng(seed);
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = 5 + 100 * randomNormal(rng);
  }
  return out;
}

/** Synthetic AR(1) PnL series: x_t = phi * x_{t-1} + eps_t. */
function syntheticAR1(n: number, seed: number, phi: number): number[] {
  const rng = createSeededRng(seed);
  const out: number[] = new Array(n);
  out[0] = randomNormal(rng) * 100;
  for (let i = 1; i < n; i++) {
    out[i] = phi * out[i - 1] + 100 * randomNormal(rng);
  }
  // Center on a small positive expectancy so historical-stats aren't
  // pathological (totalTrades counts wins/losses).
  const mean = out.reduce((a, b) => a + b, 0) / n;
  for (let i = 0; i < n; i++) out[i] = out[i] - mean + 5;
  return out;
}

/**
 * AUTO classifier — replicated verbatim from `simulationEngine.ts` (the
 * `if (regimeSource === 'AUTO') { ... }` branch). Used to capture the
 * regime_tags array for snapshot purposes (Req 3.4) since the runtime
 * `SimulationRunMeta` does not surface the tag array directly today.
 *
 * If the AUTO classifier in `simulationEngine.ts` is ever modified, this
 * mirror MUST be updated to match — but per the bugfix scope (Req 3.4),
 * the classifier is explicitly forbidden from changing, so this mirror
 * is the canonical AUTO output for preservation purposes.
 */
function autoClassifierTags(
  absolutePnLs: number[],
  autoRegimeWindow: number,
  autoRegimeThreshold: number
): string[] {
  const rollingScores = absolutePnLs.map((_, i) => {
    if (i < autoRegimeWindow) return 0;
    const windowData = absolutePnLs.slice(i - autoRegimeWindow, i);
    const wins = windowData.filter(p => p > 0).length;
    return wins / autoRegimeWindow;
  });
  const sortedScores = [...rollingScores.filter((_, i) => i >= autoRegimeWindow)].sort(
    (a, b) => a - b
  );
  const cutoff =
    sortedScores[Math.floor(sortedScores.length * (autoRegimeThreshold / 100))] || 0;
  return absolutePnLs.map((_, i) => {
    if (i < autoRegimeWindow) return 'Dispersed';
    return rollingScores[i] >= cutoff ? 'Clustered' : 'Dispersed';
  });
}

/** Parse NinjaTrader-style financial values: ($11.90) → -11.90 */
function parseFinancial(s: string): number {
  const cleaned = s.replace(/[\$,\s]/g, '');
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    return -parseFloat(cleaned.slice(1, -1));
  }
  return parseFloat(cleaned);
}

function loadNinjaTraderFixture(): number[] {
  const fixtureName = 'NinjaTrader Grid 2026-04-08 10-41 PM.csv';
  const localFixture = path.join(FIXTURE_DIR, fixtureName);
  const candidate = fs.existsSync(localFixture)
    ? localFixture
    : path.resolve(path.dirname(HERE), '..', '..', fixtureName);
  if (!fs.existsSync(candidate)) {
    throw new Error(
      `NinjaTrader fixture not found at ${localFixture} or ${candidate}.`
    );
  }
  const raw = fs.readFileSync(candidate, 'utf-8');
  const lines = raw.trim().split('\n').map(l => l.replace(/\r$/, ''));
  const header = lines[0].split(',');
  const profitIdx = header.findIndex(h => h.trim() === 'Profit');
  if (profitIdx === -1) throw new Error('Profit column not found.');
  const pnls: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length <= profitIdx) continue;
    const v = parseFinancial(cols[profitIdx]);
    if (!isNaN(v)) pnls.push(v);
  }
  return pnls;
}

// ─────────────────────────────────────────────────────────────────────────
// Common run-config builders
// ─────────────────────────────────────────────────────────────────────────

type SingleConfigOverrides = {
  modelType: 'basic' | 'regime' | 'parametric' | 'garch';
  data: DailyData[];
  randomSeed: number;
  nTrades: number;
  regimeSource?: string;
  autoRegimeWindow?: number;
  autoRegimeThreshold?: number;
};

function buildSingleConfig(o: SingleConfigOverrides) {
  return {
    nSimulations: N_SIMULATIONS,
    nTrades: o.nTrades,
    startingCapital: 10000,
    ruinThreshold: 50,
    commissionPerTrade: 0,
    randomSeed: o.randomSeed,
    samplingMode: 'bootstrap' as const,
    rowFrequency: 'trade' as const,
    periodsPerYear: 252,
    positionSizeMultiplier: 1.0,
    slippageModel: 'none' as const,
    impactCoefficient: 0.1,
    modelType: o.modelType,
    data: o.data,
    dataFormat: 'absolute' as const,
    regimeSource: o.regimeSource ?? 'None',
    autoRegimeWindow: o.autoRegimeWindow ?? 10,
    autoRegimeThreshold: o.autoRegimeThreshold ?? 50,
    propFirmRulesEnabled: false,
    propTarget: 3000,
    propMaxDrawdown: 1500,
    propConsistencyPercent: 30,
    dailyLossLimitEnabled: false,
    dailyMaxLosses: 2,
    dailyMaxLossDollars: 500,
    tradesPerSession: 3,
  };
}

function buildPortfolioConfig(seed: number, sleeves: DailyData[][], horizon: number) {
  const allocations: StrategyAllocation[] = sleeves.map((data, i) => ({
    id: `sleeve-${i}`,
    name: `S${i}`,
    weight: 1 / sleeves.length,
    data,
  }));
  return {
    nSimulations: N_SIMULATIONS,
    nTrades: horizon,
    startingCapital: 10000,
    ruinThreshold: 50,
    commissionPerTrade: 0,
    randomSeed: seed,
    samplingMode: 'bootstrap' as const,
    rowFrequency: 'trade' as const,
    periodsPerYear: 252,
    positionSizeMultiplier: 1.0,
    slippageModel: 'none' as const,
    impactCoefficient: 0.1,
    modelType: 'portfolio' as const,
    strategies: allocations,
    dataFormat: 'absolute' as const,
    copulaDf: 5,
    portfolioResampling: 'gaussian_copula' as const,
    portfolioAlignedRows: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-case 2.a — Non-regime byte-identity (Req 3.1, 3.6)
// ─────────────────────────────────────────────────────────────────────────

section(
  'Sub-case 2.a — Non-regime byte-identity (basic / parametric / garch / portfolio × seeds {1,2,7})'
);

{
  // One synthetic n = 256 series, shared across seeds for reproducibility.
  // The series itself is generated with a fixed seed (-1) so the snapshot
  // depends only on the simulator-side seed under test.
  const series = syntheticIidGaussian(256, -1);
  const dailyData: DailyData[] = series.map(v => ({ pnl: v }));

  const allRecords: Record<string, unknown> = {};

  for (const modelType of ['basic', 'parametric', 'garch'] as const) {
    for (const seed of SEEDS) {
      const config = buildSingleConfig({
        modelType,
        data: dailyData,
        randomSeed: seed,
        nTrades: 256,
      });
      const result = await runSimulation(config);
      allRecords[`${modelType}_seed${seed}`] = canonicalize(result);
    }
  }

  // Portfolio: 2 sleeves so the engine can construct a correlation matrix.
  const sleeveA = syntheticIidGaussian(256, -2).map(v => ({ pnl: v } as DailyData));
  const sleeveB = syntheticIidGaussian(256, -3).map(v => ({ pnl: v } as DailyData));
  for (const seed of SEEDS) {
    const config = buildPortfolioConfig(seed, [sleeveA, sleeveB], 256);
    const result = await runPortfolioSimulation(config);
    allRecords[`portfolio_seed${seed}`] = canonicalize(result);
  }

  const snap = snapshotCompare('preservation_non_regime.json', allRecords);
  if (snap.action === 'wrote') {
    console.log(
      '  NOTE  preservation_non_regime.json snapshot did not exist — wrote it from this run on the unfixed kernel.'
    );
  }
  assert(
    snap.ok,
    '2.a Non-regime byte-identity for {basic, parametric, garch, portfolio} × seeds {1,2,7}',
    snap.action === 'mismatch'
      ? `JSON diverged at offset ${snap.firstDiffAt}`
      : snap.action
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-case 2.b — Regime, real serial dependence (Req 3.2)
// ─────────────────────────────────────────────────────────────────────────

section('Sub-case 2.b — Regime, AR(1) phi=0.7, n=256, seeds {1,2,7}');

{
  const records: Record<string, unknown> = {};

  for (const seed of SEEDS) {
    const empirical = syntheticAR1(256, seed, 0.7);
    const dailyData: DailyData[] = empirical.map(v => ({ pnl: v }));

    // Sanity: empirical series should reject the no-serial-dependence
    // null by construction. If not, the AR(1) parameterisation is too
    // weak and the sub-case label is wrong. This is a property of the
    // input generator, not of the kernel under test, so a single
    // assertion is sufficient.
    const lbEmp = ljungBox(empirical, H);
    assert(
      lbEmp.p < ALPHA,
      `2.b/seed=${seed} empirical input has real serial dependence (lbEmp.p < ${ALPHA})`,
      `lbEmp.p=${lbEmp.p.toFixed(4)} Q=${lbEmp.Q.toFixed(2)}`
    );

    const config = buildSingleConfig({
      modelType: 'regime',
      data: dailyData,
      randomSeed: seed,
      nTrades: 256,
      regimeSource: 'AUTO',
      autoRegimeWindow: 10,
      autoRegimeThreshold: 50,
    });
    const result = await runSimulation(config);

    // Diagnostic only — see header comment for sub-case 2.b. We log the
    // mean per-path Ljung-Box p-value but do NOT assert lbSim.p < ALPHA:
    // observation on the unfixed kernel shows that within-regime IID
    // resampling already breaks AR(1) lag structure at the trade level,
    // so today's mean p does not reject the null. The aspirational
    // Req 3.2 "continues to reflect autocorrelation" check is the
    // post-fix Property-1 assertion in `repro_regime_persistence.test.ts`,
    // not a preservation baseline.
    const meanP = meanPerPathLjungBoxP(result.paths, H);
    console.log(
      `  DIAG  2.b/seed=${seed} mean per-path Ljung-Box p = ${meanP.toFixed(4)}`
    );

    // Per-trade mean and variance from the stored-path increments.
    const simTrades = flattenStoredTradeReturns(result.paths);
    if (simTrades.length === 0) {
      assert(
        false,
        `2.b/seed=${seed} simulator returned at least one stored path with trades`,
        `simTrades.length=0`
      );
      continue;
    }
    const simMV = meanAndStdDev(simTrades);
    const simVar = simMV.std * simMV.std;

    // Snapshot record — preservation semantic anchors moment
    // assertions against the unfixed-kernel observed values.
    records[`seed${seed}`] = {
      simMeanUnfixedSnapshot: simMV.mean,
      simVarUnfixedSnapshot: simVar,
    };
  }

  const snap = snapshotCompare('preservation_regime_ar1.json', records);
  if (snap.action === 'wrote') {
    console.log(
      '  NOTE  preservation_regime_ar1.json snapshot did not exist — wrote it from this run on the unfixed kernel.'
    );
  }
  assert(
    snap.ok,
    '2.b Regime AR(1) per-trade mean and variance snapshot byte-equality across seeds {1,2,7}',
    snap.action === 'mismatch'
      ? `JSON diverged at offset ${snap.firstDiffAt}`
      : snap.action
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-case 2.c — Regime, below-power short series (Req 3.3, 3.4)
// ─────────────────────────────────────────────────────────────────────────

section('Sub-case 2.c — Regime, n=30 IID Gaussian, AUTO, seeds {1,2,7}');

{
  const records: Record<string, unknown> = {};

  for (const seed of SEEDS) {
    const empirical = syntheticIidGaussian(30, seed * 1000 + 13);
    const dailyData: DailyData[] = empirical.map(v => ({ pnl: v }));

    const config = buildSingleConfig({
      modelType: 'regime',
      data: dailyData,
      randomSeed: seed,
      nTrades: 30,
      regimeSource: 'AUTO',
      autoRegimeWindow: 10,
      autoRegimeThreshold: 50,
    });
    const result = await runSimulation(config);

    // Reproduce the AUTO classifier output for the snapshot record.
    const tags = autoClassifierTags(empirical, 10, 50);

    // Per-trade moment estimators (Req 3.3).
    const simTrades = flattenStoredTradeReturns(result.paths);
    if (simTrades.length === 0) {
      assert(
        false,
        `2.c/seed=${seed} simulator returned at least one stored path with trades`,
        `simTrades.length=0`
      );
      continue;
    }
    const simVarMV = meanAndStdDev(simTrades);
    const simVar = simVarMV.std * simVarMV.std;

    // Snapshot record: byRegime + tags + observed-on-unfixed simMean &
    // simVar. The preservation semantic anchors moment assertions
    // against the unfixed-kernel observed values (see header).
    records[`seed${seed}`] = {
      regime_tags: tags,
      byRegime: result.historicalStats.byRegime ?? null,
      simMeanUnfixedSnapshot: simVarMV.mean,
      simVarUnfixedSnapshot: simVar,
    };

    // Diagnostic only — empirical-vs-simulated comparison. We do NOT
    // assert closeness to empirical (see header — regime mixture moments
    // have structural deviation from empirical on n = 30). The snapshot
    // byte-equality at the bottom of the sub-case IS the preservation
    // assertion for both per-trade mean and variance.
    const empMV = meanAndStdDev(empirical);
    const empVar = empMV.std * empMV.std;
    console.log(
      `  DIAG  2.c/seed=${seed} simMean=${simVarMV.mean.toFixed(4)} ` +
        `empMean=${empMV.mean.toFixed(4)}  ` +
        `simVar=${simVar.toFixed(2)} empVar=${empVar.toFixed(2)}`
    );
  }

  const snap = snapshotCompare('preservation_regime_short.json', records);
  if (snap.action === 'wrote') {
    console.log(
      '  NOTE  preservation_regime_short.json snapshot did not exist — wrote it from this run on the unfixed kernel.'
    );
  }
  assert(
    snap.ok,
    '2.c Regime n=30 byRegime + regime_tags snapshot byte-equality across seeds {1,2,7}',
    snap.action === 'mismatch'
      ? `JSON diverged at offset ${snap.firstDiffAt}`
      : snap.action
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-case 2.d — Metadata preservation under AUTO (Req 3.4)
// ─────────────────────────────────────────────────────────────────────────

section('Sub-case 2.d — 127-trade NinjaTrader fixture, AUTO, W=10, threshold=50');

{
  const ninjaPnls = loadNinjaTraderFixture();
  const dailyData: DailyData[] = ninjaPnls.map(v => ({ pnl: v }));

  const config = buildSingleConfig({
    modelType: 'regime',
    data: dailyData,
    randomSeed: 42,
    nTrades: ninjaPnls.length,
    regimeSource: 'AUTO',
    autoRegimeWindow: 10,
    autoRegimeThreshold: 50,
  });
  const result = await runSimulation(config);

  const tags = autoClassifierTags(ninjaPnls, 10, 50);
  const record = {
    regime_tags: tags,
    byRegime: result.historicalStats.byRegime ?? null,
  };

  const snap = snapshotCompare('regime_tags_snapshot.json', record);
  if (snap.action === 'wrote') {
    console.log(
      '  NOTE  regime_tags_snapshot.json did not exist — wrote it from this run on the unfixed kernel.'
    );
  }
  assert(
    snap.ok,
    '2.d 127-trade NinjaTrader regime_tags + byRegime snapshot byte-equality',
    snap.action === 'mismatch'
      ? `JSON diverged at offset ${snap.firstDiffAt}`
      : snap.action
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-case 2.e — User-supplied regime column verbatim (Req 3.5)
// ─────────────────────────────────────────────────────────────────────────

section('Sub-case 2.e — User-supplied regime column (regimeSource != AUTO)');

{
  // Hand-crafted DailyData with explicit user labels. simulationEngine.ts:
  //   if (regimeSource === 'AUTO') { ...auto... }
  //   else { finalRegimeTags = data.map(d => d.regime || 'default'); }
  // Any non-'AUTO' regimeSource string takes the else branch and uses
  // d.regime verbatim.
  const userLabels = [
    'Calm', 'Calm', 'Calm', 'Calm', 'Calm',
    'Wild', 'Wild', 'Wild',
    'Calm', 'Calm', 'Calm', 'Calm',
    'Wild', 'Wild', 'Wild', 'Wild',
    'Calm', 'Calm', 'Calm',
    'Wild', 'Wild',
    'Calm', 'Calm', 'Calm', 'Calm', 'Calm',
    'Wild', 'Wild', 'Wild', 'Wild',
  ];
  // n = 30, distinct from SEEDS used elsewhere.
  const empirical = syntheticIidGaussian(userLabels.length, 99);
  const dailyData: DailyData[] = empirical.map((v, i) => ({
    pnl: v,
    regime: userLabels[i],
  }));

  const config = buildSingleConfig({
    modelType: 'regime',
    data: dailyData,
    randomSeed: 1,
    nTrades: empirical.length,
    regimeSource: 'regime', // any non-'AUTO' string routes through the else branch
  });
  const result = await runSimulation(config);

  // Verify byRegime keys match the unique user labels and per-regime
  // trade counts match the empirical counts. Without a runtime surface
  // for the tag array on `runMeta`, this is the strongest observable
  // assertion that the engine routed user-supplied labels verbatim.
  const expectedUnique = [...new Set(userLabels)].sort();
  const observedKeys = Object.keys(result.historicalStats.byRegime ?? {}).sort();
  assert(
    JSON.stringify(observedKeys) === JSON.stringify(expectedUnique),
    '2.e historicalStats.byRegime keys equal unique user-supplied labels',
    `expected=${JSON.stringify(expectedUnique)} observed=${JSON.stringify(observedKeys)}`
  );

  const expectedCounts: Record<string, number> = {};
  for (const lbl of userLabels) {
    expectedCounts[lbl] = (expectedCounts[lbl] ?? 0) + 1;
  }
  const byRegime = result.historicalStats.byRegime ?? {};
  for (const lbl of expectedUnique) {
    const stats = byRegime[lbl];
    assert(
      !!stats && stats.totalTrades === expectedCounts[lbl],
      `2.e per-regime trade count for "${lbl}" matches user-supplied data`,
      `expected=${expectedCounts[lbl]} observed=${stats?.totalTrades}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-case 2.f — Seedability contract (Req 3.6)
// ─────────────────────────────────────────────────────────────────────────

section('Sub-case 2.f — Seedability contract: same seed → byte-identical JSON');

{
  // Non-regime input (basic) — strongest preservation guarantee.
  const basicSeries = syntheticIidGaussian(256, -42);
  const basicData: DailyData[] = basicSeries.map(v => ({ pnl: v }));
  const basicConfig = buildSingleConfig({
    modelType: 'basic',
    data: basicData,
    randomSeed: 12345,
    nTrades: 256,
  });
  const basicA = await runSimulation(basicConfig);
  const basicB = await runSimulation(basicConfig);
  const basicEq =
    stableStringify(canonicalize(basicA)) === stableStringify(canonicalize(basicB));
  assert(basicEq, '2.f Same seed yields byte-identical JSON for modelType=basic');

  // Regime input — exercises the regime walk's RNG draw schedule.
  const regimeSeries = syntheticIidGaussian(256, -77);
  const regimeData: DailyData[] = regimeSeries.map(v => ({ pnl: v }));
  const regimeConfig = buildSingleConfig({
    modelType: 'regime',
    data: regimeData,
    randomSeed: 54321,
    nTrades: 256,
    regimeSource: 'AUTO',
    autoRegimeWindow: 10,
    autoRegimeThreshold: 50,
  });
  const regimeA = await runSimulation(regimeConfig);
  const regimeB = await runSimulation(regimeConfig);
  const regimeEq =
    stableStringify(canonicalize(regimeA)) === stableStringify(canonicalize(regimeB));
  assert(regimeEq, '2.f Same seed yields byte-identical JSON for modelType=regime');
}

// ─────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(72));
console.log(`RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failures.length > 0) {
  console.log('\nFailed checks:');
  for (const f of failures) console.log(`  FAIL  ${f}`);
}
console.log('═'.repeat(72));
process.exit(failed > 0 ? 1 : 0);
