import {
  DailyData,
  DataFormat,
  HistoricalStats,
  MAX_STORED_PATHS,
  PortfolioConfig,
  PortfolioRegimeBreakdown,
  PortfolioResampling,
  PortfolioStrategyMeta,
  PortfolioStrategyResult,
  RowFrequency,
  SimulationResults,
  SimulationRunMeta,
  StrategyAllocation,
} from './types';
import { regimeSegmentLabel, RegimeSegmentId } from './regimeSegmentation';
import { terminalPnLValidForRun } from './metricsValidity';
import { expectedShortfall, valueAtRisk } from './riskMetrics';
import { buildCorrelationMatrix } from './correlation';
import {
  choleskyLower,
  drawCorrelatedReturnStep,
  ensurePsdCorrelation,
} from './correlatedResampling';
import {
  buildDynamicCopulaModel,
  sampleInitialRegime,
  sampleNextRegime,
  drawDynamicCorrelatedReturnStep
} from './dynamicCopula';
import { calculateMaxDrawdown, createSeededRng, deriveSessionSeed, fnv1a32, generateRunId, meanAndStdDev } from './mathUtils';
import { buildHistoricalPath, toReturnSeries } from './pathSimulator';
import { computeInstitutionalMetrics } from './riskMetrics';
import { computeHistoricalStats } from './simulationEngine';

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function normalizeWeights(strategies: StrategyAllocation[]): number[] {
  const sum = strategies.reduce((s, st) => s + st.weight, 0);
  if (sum <= 0) return strategies.map(() => 1 / strategies.length);
  return strategies.map((st) => st.weight / sum);
}

function alignTradePnLs(
  strategies: StrategyAllocation[],
  dataFormat: DataFormat,
  commissionPerTrade: number,
  horizon: number
): number[][] {
  return strategies.map((st) => {
    const pnls: number[] = [];
    for (let i = 0; i < horizon; i++) {
      const row = st.data[i];
      if (!row) {
        pnls.push(0);
        continue;
      }
      if (dataFormat === 'absolute') pnls.push(row.pnl - commissionPerTrade);
      else if (dataFormat === 'pct') pnls.push(row.pnl);
      else pnls.push(row.pnl);
    }
    return pnls;
  });
}

function combineLegPaths(legPaths: number[][]): number[] {
  const len = Math.max(...legPaths.map((leg) => leg.length));
  const portfolio: number[] = [];
  for (let t = 0; t < len; t++) {
    let total = 0;
    for (const leg of legPaths) {
      total += leg[Math.min(t, leg.length - 1)];
    }
    portfolio.push(total);
  }
  return portfolio;
}

/**
 * Gaussian copula portfolio paths always bootstrap with replacement.
 * Permutation-only reshuffles preserve multiset sums under absolute PnL → zero terminal variance.
 */
function simulateCorrelatedPortfolioLegs(
  strategies: StrategyAllocation[],
  weights: number[],
  startingCapital: number,
  horizon: number,
  dataFormat: DataFormat,
  commissionPerTrade: number,
  returnPools: number[][],
  choleskyL: number[][],
  rng: () => number,
  portfolioAlignedRows: boolean,
  copulaType: 'gaussian' | 'student_t' = 'gaussian',
  copulaDf: number = 5
): number[][] {
  const caps = weights.map((w) => startingCapital * w);
  const balances = [...caps];
  const paths = caps.map((c) => [c]);
  const useJointRows =
    portfolioAlignedRows && returnPools.every((p) => p.length >= horizon);

  for (let t = 0; t < horizon; t++) {
    const stepReturns = drawCorrelatedReturnStep(
      returnPools,
      choleskyL,
      rng,
      useJointRows ? horizon : undefined,
      copulaType,
      copulaDf
    );
    for (let j = 0; j < strategies.length; j++) {
      const ret = stepReturns[j];
      if (dataFormat === 'absolute') {
        balances[j] = balances[j] + ret - commissionPerTrade;
      } else {
        balances[j] = balances[j] * ret;
      }
      paths[j].push(balances[j]);
    }
  }
  return paths;
}

function simulateDynamicCopulaPortfolioLegs(
  strategies: StrategyAllocation[],
  weights: number[],
  startingCapital: number,
  horizon: number,
  dataFormat: DataFormat,
  commissionPerTrade: number,
  returnPools: number[][],
  dynamicModel: import('./types').DynamicCopulaModel,
  rng: () => number,
  copulaType: 'gaussian' | 'student_t' = 'gaussian',
  copulaDf: number = 5
): number[][] {
  const caps = weights.map((w) => startingCapital * w);
  const balances = [...caps];
  const paths = caps.map((c) => [c]);

  let currentRegime = sampleInitialRegime(dynamicModel, rng);

  for (let t = 0; t < horizon; t++) {
    const stepReturns = drawDynamicCorrelatedReturnStep(
      returnPools,
      dynamicModel,
      currentRegime,
      rng,
      copulaType,
      copulaDf
    );
    
    currentRegime = sampleNextRegime(currentRegime, dynamicModel, rng);

    for (let j = 0; j < strategies.length; j++) {
      const ret = stepReturns[j];
      if (dataFormat === 'absolute') {
        balances[j] = balances[j] + ret - commissionPerTrade;
      } else {
        balances[j] = balances[j] * ret;
      }
      paths[j].push(balances[j]);
    }
  }
  return paths;
}

/** Independent sleeves: portfolio mode uses bootstrap so terminal wealth can vary */
function simulateIndependentPortfolioLegs(
  strategies: StrategyAllocation[],
  weights: number[],
  startingCapital: number,
  horizon: number,
  dataFormat: DataFormat,
  commissionPerTrade: number,
  returnPools: number[][],
  rng: () => number
): number[][] {
  const caps = weights.map((w) => startingCapital * w);
  const balances = [...caps];
  const paths = caps.map((c) => [c]);

  for (let t = 0; t < horizon; t++) {
    for (let j = 0; j < strategies.length; j++) {
      const pool = returnPools[j];
      const idx = Math.floor(rng() * pool.length);
      const ret = pool[idx];
      if (dataFormat === 'absolute') {
        balances[j] = balances[j] + ret - commissionPerTrade;
      } else {
        balances[j] = balances[j] * ret;
      }
      paths[j].push(balances[j]);
    }
  }
  return paths;
}

/**
 * Engine-side params alias for the portfolio arm of the `SimulationParams`
 * discriminated union. The portfolio-specific fields (`strategies`,
 * `copulaDf`, `portfolioResampling`, `portfolioAlignedRows`,
 * `enablePortfolioRegimeBreakdown`) and the engine-only fields
 * (`dataFormat`, `factorNames`, `onProgress`) already live on
 * `PortfolioConfig` in `types.ts`.
 */
export type PortfolioSimulationParams = PortfolioConfig;

async function buildPortfolioRegimeBreakdown(
  params: PortfolioSimulationParams,
  strategies: StrategyAllocation[]
): Promise<PortfolioRegimeBreakdown[]> {
  const segmentIds = [
    ...new Set(strategies.flatMap((s) => s.data.map((d) => d.segment).filter(Boolean))),
  ] as string[];

  if (segmentIds.length < 2) return [];

  const breakdown: PortfolioRegimeBreakdown[] = [];
  const regimeSims = Math.min(3000, params.nSimulations);

  for (const segId of segmentIds) {
    const filtered = strategies
      .map((st) => ({
        ...st,
        data: st.data.filter((d) => d.segment === segId),
      }))
      .filter((st) => st.data.length >= 3);

    if (filtered.length < 2) continue;

    /**
     * Derive a deterministic, segment-distinct sub-seed (Requirement 9.6).
     *
     * Using the parent's `randomSeed` directly would force every per-regime
     * sub-run to share the parent PRNG sequence, which (a) wastes the
     * variance-reduction value of independent sub-streams and (b) couples
     * sub-run output to the order in which segments are iterated. XOR-ing
     * with a documented FNV-1a hash of the segment id gives each segment
     * its own deterministic stream while preserving end-to-end
     * reproducibility when `params.randomSeed` is fixed. When the parent
     * seed is `null` (free-seed mode), the sub-run also runs free-seeded.
     */
    const subSeed = params.randomSeed != null
      ? (params.randomSeed ^ fnv1a32(segId)) >>> 0
      : null;

    const sub = await runPortfolioSimulation({
      ...params,
      strategies: filtered,
      nSimulations: regimeSims,
      enablePortfolioRegimeBreakdown: false,
      onProgress: undefined,
      randomSeed: subSeed,
    });

    const pnls = sub.finalBalances.map((b) => b - params.startingCapital);
    const wins = pnls.filter((p) => p > 0).length;
    const sorted = [...pnls].sort((a, b) => a - b);

    breakdown.push({
      segmentId: segId,
      label: regimeSegmentLabel(segId),
      tradeCount: filtered.reduce((s, st) => s + st.data.length, 0),
      meanPnL: pnls.reduce((s, v) => s + v, 0) / Math.max(1, pnls.length),
      winRate: (wins / Math.max(1, pnls.length)) * 100,
      var95: valueAtRisk(sorted, 0.95),
      cvar95: expectedShortfall(sorted, 0.95),
      ruinProbability: sub.ruinProbability,
    });
  }

  return breakdown;
}

/**
 * Multi-strategy portfolio Monte Carlo orchestrator. Combines per-leg
 * historical PnL series under the configured `portfolioResampling` scheme
 * (independent / Gaussian copula / Student-t copula / dynamic copula) and
 * aggregates the leg paths into a single portfolio equity curve per
 * simulation. Implemented entirely in TypeScript — there is no WASM
 * dispatch on this path.
 *
 * Inputs (`PortfolioSimulationParams` = `PortfolioConfig`):
 * - `strategies: StrategyAllocation[]` — at least 2 sleeves, each with
 *   `id`, `name`, `weight`, and a per-row `data: DailyData[]` series.
 *   Sleeve weights are normalized internally.
 * - `nSimulations`, `nTrades`, `startingCapital`, `ruinThreshold`,
 *   `commissionPerTrade` — scenario sizing.
 * - `dataFormat` ∈ `'pct' | 'mult' | 'absolute'` — applied uniformly
 *   to every sleeve.
 * - `portfolioResampling` ∈ `'independent' | 'gaussian_copula' |
 *   'student_t_copula' | 'dynamic_copula'`; `copulaDf` controls the
 *   Student-t / dynamic copula degrees of freedom.
 * - `portfolioAlignedRows` (default true) decides whether per-leg
 *   resampling indices share a step or are drawn independently.
 * - `enablePortfolioRegimeBreakdown` (default false) triggers a recursive
 *   per-segment breakdown (uses deterministic FNV-1a sub-seeds derived
 *   from `randomSeed`).
 * - `randomSeed` is optional; when omitted, the engine derives one via
 *   `deriveSessionSeed()` at run start so `runMeta.randomSeed` is never
 *   null for a completed run (Requirement 9.3).
 * - `onProgress?(completed, total)` — fired every `CHUNK_SIZE`
 *   iterations and once on completion.
 *
 * Output (`SimulationResults`): same shape as `runSimulation`, with
 * `modelType: 'portfolio'` and `portfolioMeta` populated. Notable fields:
 * - `paths: number[][]` — sampled portfolio equity curves, capped at
 *   `MAX_STORED_PATHS`.
 * - `finalBalances`, `maxDrawdowns` — one entry per simulation, in
 *   simulation order (the loop index).
 * - `runMeta.prngFamily` is always `'mulberry32-ts'` on this path, since
 *   randomness is generated entirely by `createSeededRng` (no WASM
 *   kernel involvement).
 * - `runMeta.kernelVersion` is `'pre-versioned'` (no kernel).
 *
 * Ordering guarantees:
 * - For a fixed `randomSeed`, results are deterministic: the same RNG
 *   stream is consumed by leg resampling, copula draws, and (when
 *   enabled) the regime-breakdown recursion.
 * - `paths[i]` is the i-th sampled simulation's equity curve, length
 *   `nTrades + 1`, starting at `startingCapital`.
 * - Per-leg input `data` row order is preserved when constructing each
 *   sleeve's historical path; `combineLegPaths` aggregates legs at the
 *   same time step.
 *
 * Side effects:
 * - Pure with respect to module-level state.
 * - Calls `onProgress` if supplied; awaits `yieldToEventLoop()` between
 *   chunks so the worker can post progress messages.
 * - May emit a deduplicated `console.warn` per run when the dynamic
 *   copula falls back to an identity correlation matrix for any regime
 *   (Requirement 4.8).
 * - Recursively calls itself for per-segment breakdowns when
 *   `enablePortfolioRegimeBreakdown` is true (with `onProgress: undefined`
 *   on the inner calls).
 * - **Does NOT** read or write IndexedDB. Persisting the result to the
 *   audit log is the caller's responsibility — `App.tsx` invokes
 *   `runHistory.recordRun(...)` after consuming the returned
 *   `SimulationResults`.
 *
 * @throws {Error} when fewer than 2 sleeves are supplied, or when the
 *   correlation matrix cannot be Cholesky-factored under a static copula.
 */
export async function runPortfolioSimulation(
  params: PortfolioSimulationParams
): Promise<SimulationResults> {
  const {
    strategies,
    nSimulations,
    nTrades,
    startingCapital,
    ruinThreshold,
    dataFormat,
    onProgress,
    commissionPerTrade = 0,
    randomSeed,
    samplingMode,
    rowFrequency,
    periodsPerYear,
    portfolioResampling = 'gaussian_copula',
    portfolioAlignedRows = true,
    enablePortfolioRegimeBreakdown = false,
  } = params;

  if (strategies.length < 2) {
    throw new Error('Portfolio mode requires at least 2 strategies.');
  }

  const isDynamicCopula = portfolioResampling === 'dynamic_copula';
  const useStaticCopula = portfolioResampling === 'gaussian_copula' || portfolioResampling === 'student_t_copula';
  const copulaType: 'gaussian' | 'student_t' = portfolioResampling === 'student_t_copula' ? 'student_t' : 'gaussian';
  const copulaDfVal = params.copulaDf ?? 5;

  const CHUNK_SIZE = 500;
  /**
   * Session-stable seed (Requirement 9.3, F-SD-10): when the caller has
   * not supplied a fixed seed, derive one at run start so the audit log
   * records the exact mulberry32 seed used by every leg-resampling step.
   * `runMeta.randomSeed` is then never `null` for a completed run.
   */
  const effectiveSeed = randomSeed ?? deriveSessionSeed();
  const rng = createSeededRng(effectiveSeed);
  const weights = normalizeWeights(strategies);
  const horizon = nTrades;
  const annualizationFactor =
    periodsPerYear ?? (rowFrequency === 'day' ? 252 : Math.min(252, horizon));

  const legHistorical = strategies.map((st, i) =>
    buildHistoricalPath({
      data: st.data.slice(0, horizon),
      dataFormat,
      startingCapital: startingCapital * weights[i],
      commissionPerTrade,
    })
  );
  const originalPath = combineLegPaths(legHistorical);
  const originalMaxDrawdown = calculateMaxDrawdown(originalPath);

  const alignedPnls = alignTradePnLs(strategies, dataFormat, commissionPerTrade, horizon);
  const correlationMatrix = buildCorrelationMatrix(alignedPnls);
  const correlationMatrixUsed = ensurePsdCorrelation(correlationMatrix);
  const choleskyL = useStaticCopula ? choleskyLower(correlationMatrixUsed) : null;

  if (useStaticCopula && !choleskyL) {
    throw new Error('Could not factor correlation matrix for copula resampling.');
  }

  let dynamicModel: import('./types').DynamicCopulaModel | null = null;
  if (isDynamicCopula) {
    const regimeLabels = Array.from({ length: horizon }, (_, t) => {
      return strategies[0].data[t]?.segment || 'dispersed';
    });
    dynamicModel = buildDynamicCopulaModel(alignedPnls, regimeLabels);

    // Deduplicated warning: emit a single console.warn per run listing
    // every regime that fell back to identity (Requirement 4.8). The
    // PortfolioRegimePanel renders the same list as visible pills.
    if (dynamicModel.fallbackRegimes.length > 0) {
      const uniqueFallbacks = Array.from(new Set(dynamicModel.fallbackRegimes));
      console.warn(
        `[dynamic-copula] Insufficient data — regime(s) fell back to independent (identity) correlation: ${uniqueFallbacks.join(', ')}`
      );
    }
  }

  const returnPools = strategies.map((st) => toReturnSeries(st.data, dataFormat));

  const strategyResults: PortfolioStrategyResult[] = strategies.map((st, i) => {
    const cap = startingCapital * weights[i];
    const soloPath = legHistorical[i];
    const absolutePnLs = alignTradePnLs([st], dataFormat, commissionPerTrade, horizon)[0];
    const stats = computeHistoricalStats(
      absolutePnLs,
      soloPath,
      calculateMaxDrawdown(soloPath),
      annualizationFactor
    );
    return {
      id: st.id,
      name: st.name,
      weight: weights[i],
      allocatedCapital: cap,
      historicalStats: stats,
      soloMaxDrawdown: calculateMaxDrawdown(soloPath),
      soloTerminalBalance: soloPath[soloPath.length - 1],
      soloNetPnL: soloPath[soloPath.length - 1] - cap,
    };
  });

  const storedPaths: number[][] = [];
  const pathStoreInterval = Math.max(1, Math.floor(nSimulations / MAX_STORED_PATHS));
  const finalBalances: number[] = [];
  const maxDrawdowns: number[] = [];
  let ruinS = 0;
  const ruinVal = startingCapital * (1 - ruinThreshold / 100);

  for (let i = 0; i < nSimulations; i++) {
    if (i > 0 && i % CHUNK_SIZE === 0) {
      onProgress?.(i, nSimulations);
      await yieldToEventLoop();
    }

    const legs = isDynamicCopula
      ? simulateDynamicCopulaPortfolioLegs(
          strategies,
          weights,
          startingCapital,
          horizon,
          dataFormat,
          commissionPerTrade,
          returnPools,
          dynamicModel!,
          rng,
          copulaType,
          copulaDfVal
        )
      : useStaticCopula
        ? simulateCorrelatedPortfolioLegs(
            strategies,
            weights,
            startingCapital,
            horizon,
            dataFormat,
            commissionPerTrade,
            returnPools,
            choleskyL!,
            rng,
            portfolioAlignedRows,
            copulaType,
            copulaDfVal
          )
        : simulateIndependentPortfolioLegs(
            strategies,
            weights,
            startingCapital,
            horizon,
            dataFormat,
            commissionPerTrade,
            returnPools,
            rng
          );

    const portfolioPath = combineLegPaths(legs);

    if (i % pathStoreInterval === 0 && storedPaths.length < MAX_STORED_PATHS) {
      storedPaths.push(portfolioPath);
    }

    const finalBalance = portfolioPath[portfolioPath.length - 1];
    finalBalances.push(finalBalance);
    maxDrawdowns.push(calculateMaxDrawdown(portfolioPath) || 0);

    if (portfolioPath.some((pt) => pt <= ruinVal)) ruinS++;
  }

  onProgress?.(nSimulations, nSimulations);

  const ruinProbability = (ruinS / nSimulations) * 100;
  const sortedBalances = [...finalBalances].sort((a, b) => a - b);
  const p5Balance = sortedBalances[Math.floor(nSimulations * 0.05)] || 0;
  const p95Balance = sortedBalances[Math.floor(nSimulations * 0.95)] || 0;
  const meanFinalBalance =
    finalBalances.reduce((a, b) => a + b, 0) / Math.max(1, nSimulations);

  const { mean: portMean } = meanAndStdDev(
    finalBalances.map((b) => (b - startingCapital) / Math.max(1, horizon))
  );

  const weightedSoloDd = strategyResults.reduce(
    (s, r) => s + r.weight * r.soloMaxDrawdown,
    0
  );
  const portfolioMedianDd =
    [...maxDrawdowns].sort((a, b) => a - b)[Math.floor(nSimulations * 0.5)] || 0;

  const combinedAbsolutePnls = Array.from({ length: horizon }, (_, t) =>
    alignedPnls.reduce((s, series) => s + series[t], 0)
  );
  const historicalStats = computeHistoricalStats(
    combinedAbsolutePnls,
    originalPath,
    originalMaxDrawdown,
    annualizationFactor
  );

  const runMeta: SimulationRunMeta = {
    runId: generateRunId('portfolio'),
    timestamp: new Date().toISOString(),
    // Persist the exact seed used (never `null` for a completed run —
    // Requirement 9.3 / F-SD-10).
    randomSeed: effectiveSeed,
    // Portfolio runs persist `samplingMode` verbatim (Requirement 9.4):
    // the portfolio path uses `portfolioResampling` (independent /
    // gaussian / student_t / dynamic copula) rather than the single-
    // strategy `samplingMode`, so the user-supplied value is recorded
    // unchanged and no `effectiveSamplingMode` coercion is reported here.
    samplingMode,
    modelType: 'portfolio',
    nSimulations,
    nTrades: horizon,
    dataFormat,
    rowFrequency,
    commissionPerTrade,
    // Portfolio simulation runs entirely on the TS side via mulberry32
    // (`createSeededRng`); the WASM kernel is not invoked. Requirement 9.1.
    prngFamily: 'mulberry32-ts',
    // Portfolio runs do not invoke the WASM kernel, so there is no
    // `kernel_version` to surface (Requirement 8.4 / task 8.12). Persist
    // the documented sentinel `'pre-versioned'` so audit log consumers
    // see a uniform shape across single-strategy and portfolio entries.
    kernelVersion: 'pre-versioned',
    // Stub value populated properly by task 8.6 (pnlDigest). Required at
    // the type level today so the new SimulationRunMeta shape compiles.
    pnlDigest: '',
  };

  const institutionalMetrics = computeInstitutionalMetrics(
    finalBalances,
    maxDrawdowns,
    startingCapital,
    horizon,
    annualizationFactor
  );

  const portfolioMeta: PortfolioStrategyMeta = {
    strategyNames: strategies.map((s) => s.name),
    correlationMatrix,
    correlationMatrixUsed,
    resampling: portfolioResampling,
    strategies: strategyResults,
    horizonTrades: horizon,
    diversificationRatio:
      weightedSoloDd > 0 ? weightedSoloDd / Math.max(portfolioMedianDd, 1e-9) : 1,
  };

  if (isDynamicCopula && dynamicModel && dynamicModel.fallbackRegimes.length > 0) {
    portfolioMeta.dynamicCopulaFallbackRegimes = Array.from(
      new Set(dynamicModel.fallbackRegimes)
    );
  }

  if (enablePortfolioRegimeBreakdown) {
    portfolioMeta.regimeBreakdown = await buildPortfolioRegimeBreakdown(params, strategies);
  }

  const terminalValid = terminalPnLValidForRun(
    'portfolio',
    'bootstrap',
    dataFormat,
    finalBalances
  );

  return {
    nSimulations,
    paths: storedPaths,
    finalBalances,
    maxDrawdowns,
    ruinProbability,
    meanEv: portMean,
    confidenceLowerEv: 0,
    confidenceUpperEv: 0,
    p5Balance,
    p95Balance,
    meanFinalBalance,
    originalMaxDrawdown,
    originalPath,
    modelType: 'portfolio',
    historicalStats,
    institutionalMetrics,
    metricsValidity: {
      terminalPnL: terminalValid,
      drawdown: true,
    },
    runMeta,
    portfolioMeta,
  };
}
