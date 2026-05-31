import {
  DailyData,
  HistoricalStats,
  RowFrequency,
  SimulationResults,
  SimulationRunMeta,
  SingleStrategyConfig,
} from './types';
import { calculateMaxDrawdown, createSeededRng, deriveSessionSeed, generateRunId, meanAndStdDev } from './mathUtils';
import { computeInstitutionalMetrics } from './riskMetrics';
import {
  PERMUTATION_TERMINAL_WARNING,
  terminalPnLValidForRun,
} from './metricsValidity';
import { optimalBlockLength } from './blockBootstrap';
import { estimateBaseVolatility } from './slippageModel';
import { type FittedDistribution } from './distributionFitting';
import { fitGarch11, type GarchFitResult } from './garch';
import type { InstitutionalRiskMetrics } from './riskMetrics';
import { computeConvergence } from './convergenceDiagnostics';
import { computeStressScenarios } from './stressTesting';
import { computeSimulatedDDDurations } from './drawdownDuration';
import { buildValidationReport } from './modelValidation';
import { buildEVTReport } from './evt';
import { buildAttributionReport, buildMultiFactorReport } from './benchmarkAttribution';
import { buildTimestampAnalyticsReport, parseTimestamp } from './timestampAnalytics';
import { buildWalkForwardReport } from './walkForward';
import { WASM_PROTOCOL_VERSION, WasmKernelError } from './workerProtocol';

/**
 * Engine-side params alias for the single-strategy arm of the
 * `SimulationParams` discriminated union. The discriminator (`modelType`) and
 * the engine-only fields (`data`, `dataFormat`, `factorNames`, `onProgress`)
 * are already part of `SingleStrategyConfig`, so this is just a local name.
 */
type SimulationParams = SingleStrategyConfig;

/**
 * Shape of the JSON value returned by the WASM kernel's `run_mc_simulation`
 * entry point. The WASM kernel currently returns its result as a JSON string
 * (rather than a structured-cloned object), so this type captures the
 * deserialized shape and is the only `as` cast permitted in this file.
 *
 * Field names match the snake_case `Serialize` output of
 * `WasmSimulationResults` in `wasm-engine/src/lib.rs`. `distribution_fit`
 * uses camelCase for `logLikelihood` because of an explicit `serde(rename)`
 * on the Rust side.
 */
type WasmKernelResult = {
  mean_final_balance: number;
  p5_balance: number;
  p95_balance: number;
  final_balances: number[];
  max_drawdowns: number[];
  mean_ev: number;
  ruin_probability: number;
  passed_count: number;
  fail_drawdown_count: number;
  fail_consistency_count: number;
  fail_time_count: number;
  institutional_metrics: InstitutionalRiskMetrics;
  distribution_fit?: FittedDistribution | null;
  stored_paths?: number[][];
  /**
   * Trade counts per passing path. Forward-compatible scaffold for
   * Requirement 4.1 — the current pre-versioned kernel does not return
   * this field; once the Rust rebuild lands (Step B) the engine surfaces
   * it through `propEvalStats.tradesToTarget`.
   */
  trades_to_target_passing?: number[];
  /**
   * Build identifier surfaced by the WASM kernel (Requirement 8.4 / task
   * 8.12). Pre-versioned kernels omit the field; the engine persists
   * `'pre-versioned'` on `SimulationRunMeta.kernelVersion` in that case.
   */
  kernel_version?: string;
  /**
   * Structured error reason surfaced by a future versioned WASM kernel
   * (Requirement 7.6). When present and non-empty, the engine throws a
   * typed `WasmKernelError` carrying this reason and `kernel_version`
   * (when reported). Pre-versioned kernels omit the field, so the
   * absence-equals-success scaffold is forward-compatible.
   */
  error?: string;
};

// Yield control back to the event loop so worker can post progress messages
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Compute historical statistics from the raw PnL data (in absolute $)
 */
export function computeHistoricalStats(
  rawPnLs: number[],
  originalPath: number[],
  originalMaxDrawdown: number,
  periodsPerYear: number
): HistoricalStats {
  const totalTrades = rawPnLs.length;
  if (totalTrades === 0) {
    return { totalTrades: 0, winRate: 0, profitFactor: 0, avgWin: 0, avgLoss: 0, expectancy: 0, sharpeRatio: 0, sortinoRatio: 0, maxConsecutiveLosses: 0, kellyCriterion: 0, recoveryFactor: 0 };
  }

  const wins = rawPnLs.filter(p => p > 0);
  const losses = rawPnLs.filter(p => p < 0);

  const winRate = (wins.length / totalTrades) * 100;
  const grossProfit = wins.reduce((s, v) => s + v, 0);
  const grossLoss = Math.abs(losses.reduce((s, v) => s + v, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;

  const { mean, std } = meanAndStdDev(rawPnLs);
  const expectancy = mean;

  const sharpeRatio = std > 0 ? (mean / std) * Math.sqrt(periodsPerYear) : 0;

  const downsidePnLs = rawPnLs.filter(p => p < 0);
  const downsideVariance = downsidePnLs.length > 0
    ? downsidePnLs.reduce((s, v) => s + v * v, 0) / downsidePnLs.length
    : 0;
  const downsideStd = Math.sqrt(downsideVariance);
  const sortinoRatio = downsideStd > 0 ? (mean / downsideStd) * Math.sqrt(periodsPerYear) : 0;

  // Max consecutive losses
  let maxConsec = 0, curConsec = 0;
  for (const p of rawPnLs) {
    if (p < 0) { curConsec++; maxConsec = Math.max(maxConsec, curConsec); }
    else { curConsec = 0; }
  }

  // Kelly Criterion: f* = W - (1-W)/R where W = win rate, R = avg win / avg loss
  const W = wins.length / totalTrades;
  const R = avgLoss > 0 ? avgWin / avgLoss : 0;
  const kellyCriterion = R > 0 ? Math.max(0, W - (1 - W) / R) : 0;

  // Recovery Factor: net profit divided by the worst peak-to-trough drawdown
  // measured in absolute dollars on the equity curve.
  const netProfit = rawPnLs.reduce((s, v) => s + v, 0);
  let peak = -Infinity, maxAbsDd = 0;
  for (const v of originalPath) {
    if (v > peak) peak = v;
    const dd = peak - v;
    if (dd > maxAbsDd) maxAbsDd = dd;
  }
  const recoveryFactor = maxAbsDd > 0 ? netProfit / maxAbsDd : 0;

  return { totalTrades, winRate, profitFactor, avgWin, avgLoss, expectancy, sharpeRatio, sortinoRatio, maxConsecutiveLosses: maxConsec, kellyCriterion, recoveryFactor };
}

/**
 * Single-strategy Monte Carlo orchestrator. Resamples the historical PnL
 * series under the configured `samplingMode` / `modelType`, dispatches the
 * hot loop to the Rust → WebAssembly kernel, then layers TS-side analytics
 * (institutional metrics, convergence, validation, EVT, attribution,
 * timestamp / walk-forward / multi-factor) on top of the kernel output.
 *
 * Inputs (`SimulationParams` = `SingleStrategyConfig`):
 * - `nSimulations`, `nTrades`, `startingCapital`, `ruinThreshold`,
 *   `commissionPerTrade`, `positionSizeMultiplier` — scenario sizing.
 * - `modelType` ∈ `'basic' | 'regime' | 'parametric' | 'garch'` selects
 *   the kernel branch.
 * - `data: DailyData[]` is the user PnL series (plus optional `regime`,
 *   `segment`, `timestamp`, `benchmarkReturn`, `factorRow` per row).
 * - `dataFormat` ∈ `'pct' | 'mult' | 'absolute'` controls how each row's
 *   `pnl` is folded into the equity curve.
 * - `randomSeed` is optional; when omitted, the engine derives one via
 *   `deriveSessionSeed()` at run start so `runMeta.randomSeed` is never
 *   null for a completed run (Requirement 9.3).
 * - `samplingMode`, `rowFrequency`, `periodsPerYear`, `regimeSource`,
 *   `autoRegimeWindow`, `autoRegimeThreshold`, slippage config — engine
 *   knobs documented in `types.ts`.
 * - `onProgress?(completed, total)` — optional progress callback fired
 *   from the worker dispatch path; not called from outside the kernel.
 * - `skipPostSimAnalytics?` — when true, skips validation / EVT /
 *   attribution / timestamp / walk-forward / multi-factor blocks
 *   (used by the position-sizing bisection; Requirement 14).
 *
 * Output (`SimulationResults`):
 * - `paths: number[][]` — equity curves, capped at `MAX_STORED_PATHS`
 *   for plotting. Empty when the kernel returned no `stored_paths`.
 * - `finalBalances: number[]`, `maxDrawdowns: number[]` — one entry per
 *   simulated path, in the kernel's path order.
 * - `runMeta: SimulationRunMeta` — audit fields including `runId`
 *   (UUID), `randomSeed` (derived seed when caller passed none),
 *   `prngFamily` (`'stdrng-chacha-rs'` for WASM-only paths,
 *   `'mixed-mulberry32+stdrng'` when TS-side validation runs),
 *   `kernelVersion` (sentinel `'pre-versioned'` when the kernel does
 *   not surface one), and `effectiveSamplingMode` when the engine
 *   internally coerced the user-supplied mode.
 * - Per-domain reports (`institutionalMetrics`, `convergence`,
 *   `modelValidation`, `evt`, `attribution`, `timestampAnalytics`,
 *   `walkForward`, `multiFactor`, `distributionFit`, `garchFit`,
 *   `propEvalStats`) populated when their inputs are available and
 *   `skipPostSimAnalytics` is false.
 *
 * Ordering guarantees:
 * - For a fixed `randomSeed`, the WASM kernel produces deterministic
 *   `final_balances`, `max_drawdowns`, and `stored_paths` in a stable
 *   order; the engine surfaces them as-is.
 * - `paths[i]` always has length `nTrades + 1` (starting capital + one
 *   point per trade) and starts at `startingCapital`.
 * - The input `data` row order is preserved when constructing the
 *   historical equity curve (`originalPath`).
 *
 * Side effects:
 * - Pure with respect to module-level state (no exported mutables).
 * - Awaits `import('wasm-engine')` and dispatches to the Rust kernel.
 * - Calls `onProgress` if supplied (typically from the worker bridge).
 * - Reads `performance.now()` / `Date.now()` for timing and `runId`
 *   generation; uses `crypto.randomUUID()` with a documented fallback.
 * - May log deduplicated warnings via `console.warn` (e.g. invalid
 *   terminal-PnL metrics, dynamic-copula identity fallback).
 * - **Does NOT** read or write IndexedDB. Persisting the result to the
 *   audit log is the caller's responsibility — `App.tsx` invokes
 *   `runHistory.recordRun(...)` after consuming the returned
 *   `SimulationResults`.
 *
 * @throws {WasmKernelError} when the deserialized WASM result carries a
 *   non-empty `error` field (Requirement 7.6).
 */
export async function runSimulation(params: SimulationParams): Promise<SimulationResults> {
  const {
    nSimulations,
    nTrades,
    startingCapital,
    ruinThreshold,
    modelType,
    data,
    dataFormat,
    onProgress,
    commissionPerTrade = 0,
    randomSeed,
    samplingMode,
    rowFrequency,
    periodsPerYear,
    positionSizeMultiplier = 1.0,
    regimeSource,
    autoRegimeWindow = 10,
    autoRegimeThreshold = 50,
  } = params;
  const annualizationFactor = periodsPerYear ?? (rowFrequency === 'day' ? 252 : Math.min(252, nTrades));

  /**
   * Session-stable seed (Requirement 9.3, F-SD-10): when the caller has
   * not supplied a fixed seed, derive one at run start so the audit log
   * records the exact seed actually used by both the WASM kernel and the
   * TS-side validation RNG. `runMeta.randomSeed` is then never `null` for
   * a completed run.
   */
  const effectiveSeed = randomSeed ?? deriveSessionSeed();

  // 1. Process original data
  const originalPnLs = data.map(d => {
    let pnl = d.pnl * positionSizeMultiplier;
    if (dataFormat === 'pct') {
       return 1 + (pnl / 100);
    } else if (dataFormat === 'mult') {
       return 1 + pnl;
    } else {
       return pnl;
    }
  });

  // Absolute PnLs for historical stats (always in dollar terms)
  const absolutePnLs = data.map(d => {
    const pnl = d.pnl * positionSizeMultiplier;
    if (dataFormat === 'absolute') return pnl - commissionPerTrade;
    if (dataFormat === 'pct') return pnl; // % value, stats less meaningful but still compute
    return pnl; // mult
  });

  const originalPath = [startingCapital];
  for (const ret of originalPnLs) {
    if (dataFormat === 'absolute') {
      originalPath.push(originalPath[originalPath.length - 1] + ret - commissionPerTrade);
    } else {
      originalPath.push(originalPath[originalPath.length - 1] * ret);
    }
  }
  const originalMaxDrawdown = calculateMaxDrawdown(originalPath);

  // Compute historical stats
  const historicalStats = computeHistoricalStats(
    absolutePnLs,
    originalPath,
    originalMaxDrawdown,
    annualizationFactor
  );

  // Auto-Regime Detection logic
  let finalRegimeTags: string[] = [];
  if (modelType === 'regime') {
    if (regimeSource === 'AUTO') {
      // AUTO classifier: tag each trade by the rolling raw win rate over the
      // previous `autoRegimeWindow` trades (no z-score, no expectancy term).
      // The OR branch of Requirement 4.7 (F-CQ-24): docs match the implementation.
      // 1. Compute the rolling raw win rate at each index.
      const rollingScores = absolutePnLs.map((_, i) => {
        if (i < autoRegimeWindow) return 0;
        const windowData = absolutePnLs.slice(i - autoRegimeWindow, i);
        const wins = windowData.filter(p => p > 0).length;
        const wr = wins / autoRegimeWindow;
        return wr; // rolling raw win rate
      });

      // 2. Classify by percentile cutoff over the rolling raw win-rate series
      //    (e.g. autoRegimeThreshold = 50 splits at the median).
      const sortedScores = [...rollingScores.filter((_, i) => i >= autoRegimeWindow)].sort((a,b) => a-b);
      const cutoff = sortedScores[Math.floor(sortedScores.length * (autoRegimeThreshold / 100))] || 0;

      finalRegimeTags = absolutePnLs.map((_, i) => {
        if (i < autoRegimeWindow) return 'Dispersed'; // default start
        return rollingScores[i] >= cutoff ? 'Clustered' : 'Dispersed';
      });
    } else {
      finalRegimeTags = data.map(d => d.regime || 'default');
    }
  } else {
    finalRegimeTags = data.map(d => d.regime || 'default');
  }

  // Compute stats per regime
  historicalStats.byRegime = {};
  const uniqueRegimes = [...new Set(finalRegimeTags)];
  uniqueRegimes.forEach(regime => {
    const indices = finalRegimeTags.map((r, i) => r === regime ? i : -1).filter(i => i !== -1);
    if (indices.length > 0) {
      const regimeAbsPnLs = indices.map(i => absolutePnLs[i]);
      
      // We don't have a distinct equity curve for the regime itself, so we pass fake data for drawdown/recovery
      const dummyPath = [startingCapital];
      for (const p of regimeAbsPnLs) dummyPath.push(dummyPath[dummyPath.length - 1] + p);
      const dummyMaxDd = calculateMaxDrawdown(dummyPath);
      
      historicalStats.byRegime![regime] = computeHistoricalStats(regimeAbsPnLs, dummyPath, dummyMaxDd, annualizationFactor);
    }
  });

  // Engine Initialization
  const blockInfo = samplingMode === 'block_bootstrap' ? optimalBlockLength(originalPnLs) : null;
  const avgBlock = blockInfo ? blockInfo.avgBlockLength : 1;
  const baseVol = dataFormat === 'absolute' ? estimateBaseVolatility(originalPnLs) : 0;
  
  // GARCH parameters: only computed when modelType === 'garch'.
  // Held as ordinary local variables (no back-channel mutation of `params`).
  let gOmega: number | undefined;
  let gAlpha: number | undefined;
  let gBeta: number | undefined;
  let gMu: number | undefined;
  let garchFit: GarchFitResult | null = null;
  if (modelType === 'garch') {
      garchFit = fitGarch11(originalPnLs);
      gOmega = garchFit.params.omega;
      gAlpha = garchFit.params.alpha;
      gBeta = garchFit.params.beta;
      gMu = garchFit.params.mu;
  }

  const { default: initWasm, run_mc_simulation } = await import('wasm-engine');
  try {
    await initWasm();
  } catch (_) {
    // Already initialized — safe to ignore
  }

  const wasmParams = {
      // Schema version stamped on every kernel-bound payload (Requirement
      // 8.3 / task 9.4). The kernel will reject mismatched versions with a
      // structured `error` response once the Rust side enforces the check
      // (see `WasmKernelResult.error` and `WasmKernelError` for the
      // forward-compatible scaffold). Until then the kernel ignores it.
      wasm_protocol_version: WASM_PROTOCOL_VERSION,
      n_simulations: nSimulations,
      n_trades: nTrades,
      starting_capital: startingCapital,
      original_pnls: originalPnLs,
      data_format: dataFormat,
      commission_per_trade: commissionPerTrade,
      model_type: modelType,
      sampling_mode: samplingMode,
      avg_block_length: avgBlock,
      periods_per_year: periodsPerYear,
      random_seed: effectiveSeed,
      ruin_threshold: ruinThreshold,
      position_size_multiplier: positionSizeMultiplier,
      slippage_model: params.slippageModel,
      impact_coefficient: params.impactCoefficient,
      base_volatility: baseVol,
      daily_loss_limit_enabled: params.dailyLossLimitEnabled,
      trades_per_session: params.tradesPerSession,
      daily_max_losses: params.dailyMaxLosses,
      daily_max_loss_dollars: params.dailyMaxLossDollars,
      prop_firm_rules_enabled: params.propFirmRulesEnabled,
      prop_target: params.propTarget,
      prop_max_drawdown: params.propMaxDrawdown,
      prop_consistency_percent: params.propConsistencyPercent,
      garch_omega: gOmega,
      garch_alpha: gAlpha,
      garch_beta: gBeta,
      garch_mu: gMu,
      regime_tags: modelType === 'regime' ? finalRegimeTags : undefined
  };

  const wasmResStr = run_mc_simulation(JSON.stringify(wasmParams));
  // The WASM kernel returns a JSON string. This is the only `as` cast
  // permitted in this file (Requirement 5.3).
  const wasmRes = JSON.parse(wasmResStr) as WasmKernelResult;

  // Structured WASM kernel error handling (Requirement 7.6): when a future
  // versioned kernel returns `{ "error": "<reason>" }` (e.g. for
  // `wasm_protocol_version` mismatch or invalid params), surface it as a
  // typed `WasmKernelError` carrying the kernel-reported reason and
  // `kernel_version` when present. Pre-versioned kernels omit `error`, so
  // a missing or empty field is treated as success — the scaffold is
  // forward-compatible.
  if (typeof wasmRes.error === 'string' && wasmRes.error.length > 0) {
    throw new WasmKernelError(wasmRes.error, wasmRes.kernel_version);
  }

  // Headline aggregates come directly from the WASM kernel — Requirement 6.3
  // (F-SD-05): `mean_ev` and `ruin_probability` are the source of truth, the
  // engine does not recompute them from `final_balances`.
  const finalBalances = wasmRes.final_balances;
  const maxDrawdowns = wasmRes.max_drawdowns;
  const storedPaths: number[][] =
    wasmRes.stored_paths && Array.isArray(wasmRes.stored_paths)
      ? wasmRes.stored_paths
      : [];

  // Forward-compatible scaffold for Requirement 4.1 (Step A: TS-only landing).
  // The current Rust kernel does not return `trades_to_target_passing`, so the
  // legacy `tradesToTarget = []` always-zero `medianTradesToTarget` path has
  // been removed. If a future kernel rebuild (Step B) populates the field,
  // the engine surfaces it through `propEvalStats.tradesToTarget` /
  // `propEvalStats.medianTradesToTarget` and the App.tsx UI block currently
  // gated on `medianTradesToTarget > 0` can be restored.
  const tradesToTargetPassing: number[] | undefined =
    wasmRes.trades_to_target_passing && Array.isArray(wasmRes.trades_to_target_passing)
      ? wasmRes.trades_to_target_passing
      : undefined;

  const passedCount = wasmRes.passed_count;
  const failDrawdownCount = wasmRes.fail_drawdown_count;
  const failConsistencyCount = wasmRes.fail_consistency_count;
  const failTimeCount = wasmRes.fail_time_count;

  // Per-path average return, used only for the EV confidence band below.
  const allEndPnls: number[] = finalBalances.map((finalBal) => {
    if (dataFormat === 'absolute') {
      return (finalBal - startingCapital) / Math.max(1, nTrades);
    }
    return finalBal > 0
      ? Math.pow(finalBal / startingCapital, 1 / Math.max(1, nTrades)) - 1
      : -1;
  });

  // Fitted distribution from the WASM kernel — held as a normal local var.
  const fittedDistribution: FittedDistribution | undefined =
    wasmRes.distribution_fit ?? undefined;

  if (onProgress) onProgress(nSimulations, nSimulations);

  const ruinProbability = wasmRes.ruin_probability;
  const meanEv = wasmRes.mean_ev;
  
  allEndPnls.sort((a,b) => a-b);
  const confidenceLowerEv = allEndPnls[Math.floor(nSimulations * 0.05)];
  const confidenceUpperEv = allEndPnls[Math.floor(nSimulations * 0.95)];

  const sortedBalances = [...finalBalances].sort((a,b) => a-b);
  const p5Balance = sortedBalances[Math.floor(nSimulations * 0.05)] || 0;
  const p95Balance = sortedBalances[Math.floor(nSimulations * 0.95)] || 0;
  const meanFinalBalance = finalBalances.reduce((a, b) => a + b, 0) / Math.max(1, nSimulations);

  // Compute terminal-PnL validity up front so we can record the correct
  // PRNG family on `runMeta` (Requirement 9.1): a TS-side validation pass
  // only runs when terminalPnL is valid and post-sim analytics aren't
  // skipped, which is the gate that decides between WASM-only and mixed.
  const terminalValid = terminalPnLValidForRun(
    modelType,
    samplingMode,
    dataFormat,
    finalBalances
  );

  /**
   * PRNG family stamping (Requirement 9.1, 9.2 — F-SD-02):
   *
   * - Single-strategy runs without a TS validation pass use only the
   *   Rust `StdRng` (ChaCha) seeded by the WASM kernel → `'stdrng-chacha-rs'`.
   * - When the post-sim validation block runs (`terminalValid` true and
   *   `skipPostSimAnalytics` not set), `validationRng` is a TS-side
   *   `mulberry32` derived from `effectiveSeed`; the run combines both
   *   PRNGs → `'mixed-mulberry32+stdrng'`.
   *
   * `compareReproducibility` (task 8.8) refuses to declare two runs
   * reproducible when `prngFamily` differs.
   */
  const usesTsValidationRng = terminalValid && !params.skipPostSimAnalytics;
  const prngFamily: SimulationRunMeta['prngFamily'] = usesTsValidationRng
    ? 'mixed-mulberry32+stdrng'
    : 'stdrng-chacha-rs';

  /**
   * Sampling-mode honesty (Requirement 9.4 — F-SD-09): persist the
   * user-supplied `samplingMode` verbatim. When the engine internally
   * coerces sampling for non-`'basic'` models (regime / parametric /
   * garch always run as bootstrap inside the WASM kernel, regardless of
   * what the user picked), record the engine-applied mode in
   * `effectiveSamplingMode` without overwriting the user value. The
   * `'basic'` model honors the user mode end-to-end, so no effective
   * coercion is recorded in that case.
   */
  const effectiveSamplingMode: SimulationRunMeta['effectiveSamplingMode'] =
    modelType !== 'basic' && samplingMode !== 'bootstrap'
      ? 'bootstrap'
      : undefined;

  const runMeta: SimulationRunMeta = {
    runId: generateRunId('run'),
    timestamp: new Date().toISOString(),
    // Persist the exact seed used (never `null` for a completed run —
    // Requirement 9.3 / F-SD-10).
    randomSeed: effectiveSeed,
    samplingMode,
    ...(effectiveSamplingMode ? { effectiveSamplingMode } : {}),
    modelType,
    nSimulations,
    nTrades,
    dataFormat,
    rowFrequency,
    commissionPerTrade,
    prngFamily,
    // Surface the WASM kernel build identifier when the kernel reports
    // one (Requirement 8.4 / task 8.12). Pre-versioned kernels omit the
    // `kernel_version` field; we persist the documented sentinel
    // `'pre-versioned'` so audit log readers can distinguish the
    // unversioned-build era from a future tagged build.
    kernelVersion: wasmRes.kernel_version ?? 'pre-versioned',
    // Stub value populated properly by task 8.6 (pnlDigest). Required at
    // the type level today so the new SimulationRunMeta shape compiles.
    pnlDigest: '',
  };

  const institutionalMetrics = computeInstitutionalMetrics(
    finalBalances,
    maxDrawdowns,
    startingCapital,
    nTrades,
    annualizationFactor
  );

  const metricsValidity = {
    terminalPnL: terminalValid,
    drawdown: true,
    warning: terminalValid ? undefined : PERMUTATION_TERMINAL_WARNING,
  };

  const statResult: SimulationResults = {
    nSimulations,
    paths: storedPaths,
    finalBalances,
    maxDrawdowns,
    ruinProbability,
    meanEv,
    confidenceLowerEv,
    confidenceUpperEv,
    p5Balance,
    p95Balance,
    meanFinalBalance,
    originalMaxDrawdown,
    originalPath,
    modelType,
    historicalStats,
    institutionalMetrics,
    metricsValidity,
    runMeta,
    distributionFit: fittedDistribution,
  };

  // ─── Post-simulation analytics ───
  // Convergence diagnostics
  statResult.convergence = computeConvergence(
    finalBalances,
    maxDrawdowns,
    startingCapital,
    ruinThreshold
  );

  // Stress testing (on absolute PnLs)
  const absPnLsForStress = data.map(d => {
    const pnl = d.pnl * (params.positionSizeMultiplier || 1);
    if (dataFormat === 'absolute') return pnl - commissionPerTrade;
    return pnl;
  });
  statResult.stressTest = computeStressScenarios(
    absPnLsForStress,
    startingCapital,
    ruinThreshold
  );

  // Drawdown duration analysis across simulated paths
  statResult.drawdownDuration = computeSimulatedDDDurations(storedPaths);

  // ─── Institutional add-ons ───
  // These post-simulation analytics are skipped when `skipPostSimAnalytics`
  // is true (Requirement 14.1, 14.2 — F-SD-14). The position-sizing
  // bisection in `positionSizing.ts` sets the flag on its intermediate
  // scale-search runs so wall-clock time is dominated by the headline run
  // rather than 12 redundant validation passes. Headline runs default to
  // `false` and continue to compute the full suite.
  if (!params.skipPostSimAnalytics) {
    // Model validation: GoF, serial dependence, VaR backtest, PIT.
    // Use one stored path's increments (if any) to test resampler dependence.
    const repPath = storedPaths.length > 0 ? storedPaths[0] : null;
    const repIncrements = repPath
      ? repPath.slice(1).map((v, i) => v - repPath[i])
      : undefined;
    const terminalPnLForGoF = finalBalances.map((b) => b - startingCapital);
    // Use the engine's effective seed (derived at run start when the user
    // disabled fixed-seed mode) so the validation RNG is reproducible
    // alongside the WASM kernel — Requirement 9.3.
    const validationRng = createSeededRng(effectiveSeed + 7919);
    if (terminalValid) {
      statResult.modelValidation = buildValidationReport({
        historicalPnL: absPnLsForStress,
        simulatedTerminalPnL: terminalPnLForGoF,
        simulatedIncrements: repIncrements,
        horizon: nTrades,
        rng: validationRng,
      });
    }

    // EVT — only meaningful when we have absolute-dollar PnLs with enough losses
    if (dataFormat === 'absolute' && absPnLsForStress.filter((v) => v < 0).length >= 30) {
      statResult.evt = buildEVTReport(absPnLsForStress, 0.9);
    }

    // Benchmark attribution — only if user supplied a benchmark column
    const hasBenchmark = data.some((d) => typeof d.benchmarkReturn === 'number' && isFinite(d.benchmarkReturn));
    if (hasBenchmark) {
      // Strategy returns: per-period return on starting capital (stable scaling).
      // Benchmark returns are passed in by the caller in the same convention.
      const aligned = data
        .map((d) => ({
          ret:
            dataFormat === 'absolute'
              ? d.pnl / Math.max(1, startingCapital)
              : dataFormat === 'pct'
              ? d.pnl / 100
              : d.pnl,
          bench: d.benchmarkReturn,
        }))
        .filter(
          (row): row is { ret: number; bench: number } =>
            typeof row.bench === 'number' && isFinite(row.bench)
        );
      if (aligned.length >= 10) {
        try {
          statResult.attribution = buildAttributionReport(
            aligned.map((r) => r.ret),
            aligned.map((r) => r.bench),
            annualizationFactor
          );
        } catch {
          // Suppress attribution failures; report builds without it.
        }
      }
    }

    // Timestamp analytics — only when a timestamp column has been mapped
    const tsRows = data
      .map((d) => ({ t: d.timestamp ? parseTimestamp(d.timestamp) : null, pnl: d.pnl }))
      .filter((r): r is { t: Date; pnl: number } => r.t !== null);
    if (tsRows.length >= 5) {
      statResult.timestampAnalytics = buildTimestampAnalyticsReport(
        tsRows.map((r) => r.t),
        // Use absolute dollars when available; otherwise feed raw values.
        tsRows.map((r) =>
          dataFormat === 'absolute' ? r.pnl - commissionPerTrade : r.pnl
        )
      );
    }

    // Walk-forward / out-of-sample validation — only meaningful for absolute PnL with enough history.
    if (dataFormat === 'absolute' && absPnLsForStress.length >= 50) {
      const wf = buildWalkForwardReport(absPnLsForStress, { trainFraction: 0.7 });
      if (wf) statResult.walkForward = wf;
    }

    // Multi-factor attribution — when factor columns are mapped.
    const factorNames = (params.factorNames ?? []).filter((s) => !!s && s.length > 0);
    if (factorNames.length > 0) {
      const rowsWithFactors = data
        .map((d, i) => ({
          ret:
            dataFormat === 'absolute'
              ? d.pnl / Math.max(1, startingCapital)
              : dataFormat === 'pct'
              ? d.pnl / 100
              : d.pnl,
          row: d.factorRow ?? null,
        }))
        .filter(
          (r): r is { ret: number; row: number[] } =>
            r.row !== null && r.row.length === factorNames.length && r.row.every((v) => isFinite(v))
        );
      if (rowsWithFactors.length >= factorNames.length + 5) {
        const mf = buildMultiFactorReport(
          rowsWithFactors.map((r) => r.ret),
          rowsWithFactors.map((r) => r.row),
          factorNames,
          annualizationFactor
        );
        if (mf) statResult.multiFactor = mf;
      }
    }
  }

  // GARCH params if applicable
  if (garchFit) {
    statResult.garchFit = garchFit.params;
  }

  if (params.propFirmRulesEnabled) {
    const propEvalStats: NonNullable<SimulationResults['propEvalStats']> = {
      passRate: (passedCount / nSimulations) * 100,
      failDrawdown: (failDrawdownCount / nSimulations) * 100,
      failConsistency: (failConsistencyCount / nSimulations) * 100,
      failTime: (failTimeCount / nSimulations) * 100,
    };
    // Surface trades-to-target only when the WASM kernel actually returned it
    // (Requirement 4.1, Step A). Pre-rebuild kernels omit the field; we leave
    // it undefined so the App.tsx UI block stays hidden rather than rendering
    // a misleading zero.
    if (tradesToTargetPassing && tradesToTargetPassing.length > 0) {
      const sortedTTT = [...tradesToTargetPassing].sort((a, b) => a - b);
      propEvalStats.tradesToTarget = tradesToTargetPassing;
      propEvalStats.medianTradesToTarget = sortedTTT[Math.floor(sortedTTT.length / 2)];
    }
    statResult.propEvalStats = propEvalStats;
  }

  return statResult;
}

/** Due-diligence stats from uploaded backtest before Monte Carlo run */
export function previewHistoricalStats(
  data: DailyData[],
  dataFormat: SimulationParams['dataFormat'],
  startingCapital: number,
  commissionPerTrade: number,
  rowFrequency: RowFrequency,
  periodsPerYear?: number
): HistoricalStats {
  const annualizationFactor =
    periodsPerYear ?? (rowFrequency === 'day' ? 252 : Math.min(252, data.length));

  const originalPnLs = data.map((d) => {
    if (dataFormat === 'pct') return 1 + d.pnl / 100;
    if (dataFormat === 'mult') return 1 + d.pnl;
    return d.pnl;
  });

  const absolutePnLs = data.map((d) =>
    dataFormat === 'absolute' ? d.pnl - commissionPerTrade : d.pnl
  );

  const originalPath = [startingCapital];
  for (const ret of originalPnLs) {
    if (dataFormat === 'absolute') {
      originalPath.push(originalPath[originalPath.length - 1] + ret - commissionPerTrade);
    } else {
      originalPath.push(originalPath[originalPath.length - 1] * ret);
    }
  }

  return computeHistoricalStats(
    absolutePnLs,
    originalPath,
    calculateMaxDrawdown(originalPath),
    annualizationFactor
  );
}
