/**
 * repro_regime_persistence.test.ts
 *
 * Bug-condition exploration test for the regime-Markov persistence bias
 * documented in `.kiro/specs/regime-markov-persistence-bias/bugfix.md`.
 *
 * GOAL
 *   Surface concrete counterexamples that demonstrate that the regime-
 *   switching engine (`modelType === 'regime'`) manufactures Ljung-Box
 *   failure on the simulated trade-level series even when the empirical
 *   input series itself passes Ljung-Box at the same lag.
 *
 * METHODOLOGY (per bugfix.md § "Bug Condition C(X)")
 *   For each input X = { pnlSeries, modelType='regime', seed, h=10,
 *   alpha=0.05, QRatioMax=2.0 } the predicate `isBugCondition(X)`:
 *     1. Returns false when length(pnlSeries) < MIN_POWER_N (= 60).
 *     2. Returns false when the empirical Ljung-Box already fails
 *        (real serial dependence in the input).
 *     3. Otherwise returns true iff lbSim.p < alpha OR
 *        lbSim.Q / max(lbEmp.Q, eps) > QRatioMax.
 *
 *   Property 1 (design.md § "Correctness Properties") asserts that on the
 *   FIXED simulator F' the same X must yield lbSim.p > alpha AND
 *   lbSim.Q / max(lbEmp.Q, eps) <= QRatioMax. The negation of that
 *   assertion is exactly `isBugCondition(X)`, so on the UNFIXED kernel
 *   the predicate must hold for every concrete failing case below.
 *
 * SCOPED PBT APPROACH
 *   Three deterministic concrete cases are pinned by seed so the failure
 *   is reproducible across re-runs and across machines:
 *
 *     A. 127-trade NinjaTrader fixture
 *          (src/__tests__/fixtures/NinjaTrader Grid 2026-04-08 10-41 PM.csv,
 *           also at repo root). Seed = 42. nSimulations = 1000.
 *
 *     B. Synthetic IID Gaussian, n = 256, seed = 1.
 *        Generated via createSeededRng + randomNormal from mathUtils.ts.
 *        nSimulations = 1000.
 *
 *     C. Boundary stress, n = 64, seed = 7. Just above MIN_POWER_N = 60.
 *        Synthetic IID Gaussian, distinct seed. nSimulations = 1000.
 *
 *   All three are dispatched through the same path the worker uses:
 *   `runSimulation` from simulationEngine.ts driven by `nodeWasmBootstrap`,
 *   with modelType='regime', regimeSource='AUTO', autoRegimeWindow=10,
 *   autoRegimeThreshold=50.
 *
 * EXPECTED OUTCOME (UNFIXED wasm-engine/pkg)
 *   The Property-1 assertion FAILS on every concrete case. That failure
 *   is the SUCCESS criterion for this exploration test — it confirms the
 *   bug exists and gives Property 1 a concrete counterexample.
 *
 *   When this same file is re-run on the FIXED kernel (after task 3.1
 *   and the wasm rebuild), the assertion must PASS on every case.
 *
 * COUNTEREXAMPLE LOG
 *   The script prints, for every case:
 *     - input shape (n, source)
 *     - seed
 *     - empirical Q_emp, p_emp
 *     - simulated Q_sim, p_sim
 *     - ratio Q_sim / max(Q_emp, eps)
 *     - the boolean isBugCondition(X)
 *   so the failure is self-explanatory.
 *
 *   For case A the bugfix.md report cites approximately
 *     Q_emp ≈ 10.30, p_emp ≈ 0.415   (PASS)
 *     Q_sim ≈ 24.89, p_sim ≈ 0.006   (FAIL)
 *     Q_sim / Q_emp ≈ 2.42 > 2.0
 *   The actual numbers printed by this run depend on the seed and the
 *   exact wasm build — they are recorded by the runner as the live
 *   counterexample for the PBT status update.
 *
 * Run:
 *   npx tsx src/__tests__/repro_regime_persistence.test.ts
 *
 * Exits 0 if every case satisfies Property 1 (i.e. only after the fix).
 * Exits 1 if any case fails Property 1 (i.e. the bug is reproduced on
 * the unfixed kernel — the EXPECTED outcome before the fix).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { ensureWasmInitialized } from './nodeWasmBootstrap';
import { runSimulation } from '../simulationEngine';
import { createSeededRng, randomNormal } from '../mathUtils';
import { ljungBox } from '../modelValidation';
import type { DailyData } from '../types';

// ─────────────────────────────────────────────────────────────────────────
// Bootstrap wasm (Node-only; web build's fetch-based init is a no-op here)
// ─────────────────────────────────────────────────────────────────────────

await ensureWasmInitialized();

// ─────────────────────────────────────────────────────────────────────────
// Constants — match design.md § "Bug Condition C(X)" / "Correctness Properties"
// ─────────────────────────────────────────────────────────────────────────

const ALPHA = 0.05;
const H = 10;
const Q_RATIO_MAX = 2.0;
const MIN_POWER_N = 60;
const EPS = 1e-12;

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Parse NinjaTrader-style financial values: ($11.90) → -11.90, $909.24 → 909.24 */
function parseFinancial(s: string): number {
  const cleaned = s.replace(/[\$,\s]/g, '');
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    return -parseFloat(cleaned.slice(1, -1));
  }
  return parseFloat(cleaned);
}

function loadNinjaTraderFixture(): number[] {
  const here = fileURLToPath(import.meta.url);
  const fixtureDir = path.resolve(path.dirname(here), 'fixtures');
  const fixtureName = 'NinjaTrader Grid 2026-04-08 10-41 PM.csv';
  const localFixture = path.join(fixtureDir, fixtureName);

  // Prefer the in-tree fixture; fall back to the repo-root copy if a
  // checkout did not bring fixtures along.
  const candidate = fs.existsSync(localFixture)
    ? localFixture
    : path.resolve(path.dirname(here), '..', '..', fixtureName);

  if (!fs.existsSync(candidate)) {
    throw new Error(
      `NinjaTrader fixture not found at ${localFixture} or ${candidate}. ` +
        'Copy "NinjaTrader Grid 2026-04-08 10-41 PM.csv" into ' +
        'src/__tests__/fixtures/ before running this test.'
    );
  }

  const raw = fs.readFileSync(candidate, 'utf-8');
  const lines = raw.trim().split('\n').map(l => l.replace(/\r$/, ''));
  const header = lines[0].split(',');
  const profitIdx = header.findIndex(h => h.trim() === 'Profit');
  if (profitIdx === -1) {
    throw new Error('Profit column not found in NinjaTrader fixture CSV.');
  }
  const pnls: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length <= profitIdx) continue;
    const v = parseFinancial(cols[profitIdx]);
    if (!isNaN(v)) pnls.push(v);
  }
  return pnls;
}

/** Generate a synthetic IID Gaussian PnL series via createSeededRng. */
function syntheticIidGaussian(n: number, seed: number): number[] {
  const rng = createSeededRng(seed);
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // Mean ~ 5 ticks, σ ~ 100 ticks — chosen so the series shape mimics
    // a typical futures-trading PnL distribution (positive expectancy,
    // fat-ish dispersion) without injecting any serial dependence.
    out[i] = 5 + 100 * randomNormal(rng);
  }
  return out;
}

/** Reconstruct the per-trade simulated PnL series from a stored equity path. */
function pathToTradeReturns(equityPath: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < equityPath.length; i++) {
    out.push(equityPath[i] - equityPath[i - 1]);
  }
  return out;
}

/**
 * Aggregate Ljung-Box across all stored paths.
 *
 * Ljung-Box at lag h is a within-sequence statistic — concatenating
 * per-path increment series across paths destroys within-path
 * autocorrelation because the inter-path boundaries are random jumps,
 * which dilutes the very signal we are testing for. So we instead
 * compute lbSim per path and aggregate the per-path Q / p values.
 *
 * The user-reported counterexample in bugfix.md (Q_sim ≈ 24.89,
 * p_sim ≈ 0.006) is exactly the SR 11-7 panel's reading, which uses
 * ONE representative path's increments (`storedPaths[0]`), so a single
 * path is sufficient power for the property-1 assertion.
 *
 * For stability across the ensemble — and to satisfy the bug-condition
 * predicate's "sufficient number of paths" clause in design.md §
 * "Correctness Properties" / Property 1 — we report the MEAN Q_sim and
 * MEAN p_sim across all stored paths. Mean Q is a meaningful aggregate
 * because under the null Q ~ chi²(h), so its mean is h; under the
 * regime-bug alternative the per-path Q is shifted upward in
 * expectation, so mean Q is the natural ensemble statistic that mirrors
 * the per-path Q reported by the panel.
 */
function aggregatePerPathLjungBox(
  paths: number[][],
  h: number
): { meanQ: number; meanP: number; firstQ: number; firstP: number } {
  let qSum = 0;
  let pSum = 0;
  let count = 0;
  let firstQ = NaN;
  let firstP = NaN;
  for (const p of paths) {
    if (p.length < h + 2) continue;
    const inc = pathToTradeReturns(p);
    const lb = ljungBox(inc, h);
    qSum += lb.Q;
    pSum += lb.p;
    if (count === 0) {
      firstQ = lb.Q;
      firstP = lb.p;
    }
    count++;
  }
  if (count === 0) {
    return { meanQ: NaN, meanP: NaN, firstQ: NaN, firstP: NaN };
  }
  return { meanQ: qSum / count, meanP: pSum / count, firstQ, firstP };
}

// ─────────────────────────────────────────────────────────────────────────
// Bug-condition predicate — verbatim from bugfix.md § "Bug Condition C(X)"
// ─────────────────────────────────────────────────────────────────────────

type BugConditionInput = {
  pnlSeries: number[];
  modelType: 'basic' | 'regime' | 'parametric' | 'garch' | 'portfolio';
  seed: number;
  h: number;
  alpha: number;
  QRatioMax: number;
};

type BugConditionEvidence = {
  isBug: boolean;
  reason: string;
  qEmp: number;
  pEmp: number;
  qSim: number;
  pSim: number;
  ratio: number;
  firstPathQ: number;
  firstPathP: number;
};

async function evaluateBugCondition(
  X: BugConditionInput
): Promise<BugConditionEvidence> {
  // Empty / placeholder evidence used for early-return branches.
  const emptyEv: Omit<BugConditionEvidence, 'isBug' | 'reason'> = {
    qEmp: NaN,
    pEmp: NaN,
    qSim: NaN,
    pSim: NaN,
    ratio: NaN,
    firstPathQ: NaN,
    firstPathP: NaN,
  };

  if (X.modelType !== 'regime') {
    return { isBug: false, reason: 'modelType != regime', ...emptyEv };
  }
  if (X.pnlSeries.length < MIN_POWER_N) {
    return {
      isBug: false,
      reason: `length ${X.pnlSeries.length} < MIN_POWER_N (${MIN_POWER_N})`,
      ...emptyEv,
    };
  }

  const lbEmp = ljungBox(X.pnlSeries, X.h);
  if (lbEmp.p <= X.alpha) {
    return {
      isBug: false,
      reason: `empirical Ljung-Box already fails (p=${lbEmp.p.toFixed(4)})`,
      qEmp: lbEmp.Q,
      pEmp: lbEmp.p,
      qSim: NaN,
      pSim: NaN,
      ratio: NaN,
      firstPathQ: NaN,
      firstPathP: NaN,
    };
  }

  // Drive the regime simulator through the same dispatch path the worker uses.
  const dailyData: DailyData[] = X.pnlSeries.map(v => ({ pnl: v }));
  const result = await runSimulation({
    nSimulations: 1000,
    nTrades: X.pnlSeries.length,
    startingCapital: 10000,
    ruinThreshold: 50,
    commissionPerTrade: 0,
    randomSeed: X.seed,
    samplingMode: 'bootstrap',
    rowFrequency: 'trade',
    periodsPerYear: 252,
    positionSizeMultiplier: 1.0,
    slippageModel: 'none',
    impactCoefficient: 0.1,
    modelType: 'regime',
    data: dailyData,
    dataFormat: 'absolute',
    regimeSource: 'AUTO',
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
    skipPostSimAnalytics: true, // we compute Ljung-Box directly below
  });

  const simAgg = aggregatePerPathLjungBox(result.paths, X.h);
  if (!isFinite(simAgg.meanQ)) {
    throw new Error(
      `Per-path Ljung-Box aggregation produced no usable paths; ` +
        `need at least one stored path with length >= h + 2 (h=${X.h}).`
    );
  }
  // The bug-condition predicate from bugfix.md uses a single lbSim reading.
  // We use the MEAN-Q / MEAN-p across stored paths as the stable ensemble
  // estimator — this is the canonical Monte Carlo aggregator for a
  // per-path test statistic. The first-path values are also surfaced to
  // mirror the SR 11-7 panel's per-path reading (`storedPaths[0]`).
  const qSim = simAgg.meanQ;
  const pSim = simAgg.meanP;
  const ratio = qSim / Math.max(lbEmp.Q, EPS);
  const isBug = pSim < X.alpha || ratio > X.QRatioMax;
  return {
    isBug,
    reason: isBug
      ? `regime-engine output violates Ljung-Box null (p_sim=${pSim.toFixed(4)}, ratio=${ratio.toFixed(2)})`
      : 'regime-engine output preserves Ljung-Box null',
    qEmp: lbEmp.Q,
    pEmp: lbEmp.p,
    qSim,
    pSim,
    ratio,
    firstPathQ: simAgg.firstQ,
    firstPathP: simAgg.firstP,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Concrete cases
// ─────────────────────────────────────────────────────────────────────────

type ConcreteCase = {
  label: string;
  source: string;
  n: number;
  seed: number;
  pnls: number[];
};

const ninjaPnls = loadNinjaTraderFixture();

const cases: ConcreteCase[] = [
  {
    label: 'A',
    source: 'NinjaTrader Grid 2026-04-08 10-41 PM.csv',
    n: ninjaPnls.length,
    seed: 42,
    pnls: ninjaPnls,
  },
  {
    label: 'B',
    source: 'synthetic IID Gaussian (μ=5, σ=100)',
    n: 256,
    seed: 1,
    pnls: syntheticIidGaussian(256, 1),
  },
  {
    label: 'C',
    source: 'synthetic IID Gaussian (μ=5, σ=100), boundary stress',
    n: 64,
    seed: 7,
    pnls: syntheticIidGaussian(64, 7),
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────

console.log('═'.repeat(72));
console.log('Bug-Condition Exploration: regime-Markov persistence bias');
console.log('═'.repeat(72));
console.log(
  `Property 1 (design.md § "Correctness Properties"): ` +
    `lbSim.p > ${ALPHA} AND lbSim.Q / max(lbEmp.Q, eps) <= ${Q_RATIO_MAX}`
);
console.log(
  `On the UNFIXED wasm kernel this assertion is EXPECTED TO FAIL — ` +
    `failure confirms the bug exists.`
);
console.log('');

let property1Failures = 0;
const counterexamples: Array<{
  label: string;
  source: string;
  n: number;
  seed: number;
  qEmp: number;
  pEmp: number;
  qSim: number;
  pSim: number;
  ratio: number;
  isBug: boolean;
  firstPathQ: number;
  firstPathP: number;
}> = [];

for (const c of cases) {
  console.log(`Case ${c.label}: ${c.source}`);
  console.log(`  n = ${c.n}, seed = ${c.seed}`);
  const ev = await evaluateBugCondition({
    pnlSeries: c.pnls,
    modelType: 'regime',
    seed: c.seed,
    h: H,
    alpha: ALPHA,
    QRatioMax: Q_RATIO_MAX,
  });
  console.log(
    `  empirical : Q_emp = ${ev.qEmp.toFixed(4)}, p_emp = ${ev.pEmp.toFixed(4)}`
  );
  console.log(
    `  simulated (mean across paths): Q_sim = ${ev.qSim.toFixed(4)}, p_sim = ${ev.pSim.toFixed(4)}`
  );
  console.log(
    `  simulated (first stored path = SR 11-7 panel reading): Q = ${ev.firstPathQ.toFixed(4)}, p = ${ev.firstPathP.toFixed(4)}`
  );
  console.log(
    `  Q_sim / Q_emp = ${ev.ratio.toFixed(4)}  (threshold: ${Q_RATIO_MAX})`
  );
  console.log(`  isBugCondition(X) = ${ev.isBug}  (${ev.reason})`);

  // Property 1 assertion: on the FIXED kernel we expect lbSim.p > alpha AND
  // ratio <= QRatioMax. The bug condition is exactly the negation of that
  // assertion (modulo the empirical-passes precondition). On the UNFIXED
  // kernel this should fail for all three cases.
  const property1Holds = ev.pSim > ALPHA && ev.ratio <= Q_RATIO_MAX;
  if (!property1Holds) {
    console.log(
      `  ❌ Property 1 violated — counterexample recorded for case ${c.label}`
    );
    property1Failures++;
  } else {
    console.log(`  ✅ Property 1 holds for case ${c.label}`);
  }
  counterexamples.push({
    label: c.label,
    source: c.source,
    n: c.n,
    seed: c.seed,
    qEmp: ev.qEmp,
    pEmp: ev.pEmp,
    qSim: ev.qSim,
    pSim: ev.pSim,
    ratio: ev.ratio,
    isBug: ev.isBug,
    firstPathQ: ev.firstPathQ,
    firstPathP: ev.firstPathP,
  });
  console.log('');
}

console.log('═'.repeat(72));
console.log('Counterexample summary');
console.log('═'.repeat(72));
for (const ce of counterexamples) {
  console.log(
    `Case ${ce.label}  n=${ce.n}  seed=${ce.seed}  ` +
      `Q_emp=${ce.qEmp.toFixed(4)}  p_emp=${ce.pEmp.toFixed(4)}  ` +
      `Q_sim(mean)=${ce.qSim.toFixed(4)}  p_sim(mean)=${ce.pSim.toFixed(4)}  ` +
      `Q_sim(path0)=${ce.firstPathQ.toFixed(4)}  p_sim(path0)=${ce.firstPathP.toFixed(4)}  ` +
      `ratio=${ce.ratio.toFixed(4)}  isBug=${ce.isBug}`
  );
}
console.log('');

if (property1Failures > 0) {
  console.log(
    `Property 1 violated on ${property1Failures} / ${cases.length} ` +
      `concrete case(s). On the UNFIXED kernel this is the EXPECTED outcome ` +
      `and confirms the bug. On the FIXED kernel this would indicate a ` +
      `regression.`
  );
  process.exit(1);
} else {
  console.log(
    `Property 1 holds on all ${cases.length} concrete cases. This is the ` +
      `EXPECTED outcome on the FIXED kernel.`
  );
  process.exit(0);
}
