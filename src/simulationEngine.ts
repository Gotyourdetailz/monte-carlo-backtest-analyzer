import {
  BaseModelConfig,
  DailyData,
  HistoricalStats,
  RowFrequency,
  SimulationResults,
  SimulationRunMeta,
} from './types';
import { calculateMaxDrawdown, createSeededRng, meanAndStdDev, randomStudentT, shuffleInPlace } from './mathUtils';
import { computeInstitutionalMetrics } from './riskMetrics';
import {
  PERMUTATION_TERMINAL_WARNING,
  terminalPnLValidForRun,
} from './metricsValidity';
import { stationaryBlockBootstrap, optimalBlockLength } from './blockBootstrap';
import { computeSlippage, estimateBaseVolatility, type SlippageConfig } from './slippageModel';
import { fitBestDistribution } from './distributionFitting';
import { fitGarch11, simulateGarchPath } from './garch';
import { computeConvergence } from './convergenceDiagnostics';
import { computeStressScenarios } from './stressTesting';
import { computeSimulatedDDDurations } from './drawdownDuration';
import { buildValidationReport } from './modelValidation';
import { buildEVTReport } from './evt';
import { buildAttributionReport, buildMultiFactorReport } from './benchmarkAttribution';
import { buildTimestampAnalyticsReport, parseTimestamp } from './timestampAnalytics';
import { buildWalkForwardReport } from './walkForward';

type SimulationParams = BaseModelConfig & {
  modelType: 'basic' | 'regime' | 'parametric' | 'garch';
  data: DailyData[];
  dataFormat: 'pct' | 'mult' | 'absolute';
  onProgress?: (completed: number, total: number) => void;
  /** Optional ordered factor labels matching DailyData.factorRow entries. */
  factorNames?: string[];
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

  // Recovery Factor
  const netProfit = rawPnLs.reduce((s, v) => s + v, 0);
  const maxDdDollars = originalMaxDrawdown * (originalPath.length > 0 ? Math.max(...originalPath.slice(0, 100), originalPath[0]) : 1);
  // Actually, let's compute absolute DD properly
  let peak = -Infinity, maxAbsDd = 0;
  for (const v of originalPath) {
    if (v > peak) peak = v;
    const dd = peak - v;
    if (dd > maxAbsDd) maxAbsDd = dd;
  }
  const recoveryFactor = maxAbsDd > 0 ? netProfit / maxAbsDd : 0;

  return { totalTrades, winRate, profitFactor, avgWin, avgLoss, expectancy, sharpeRatio, sortinoRatio, maxConsecutiveLosses: maxConsec, kellyCriterion, recoveryFactor };
}

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
  const CHUNK_SIZE = 500;
  const MAX_STORED_PATHS = 200;
  const rng = randomSeed != null ? createSeededRng(randomSeed) : Math.random;
  const annualizationFactor = periodsPerYear ?? (rowFrequency === 'day' ? 252 : Math.min(252, nTrades));

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
  
  let originalMeanEv = 0;
  if (dataFormat === 'absolute') {
    originalMeanEv = meanAndStdDev(originalPnLs.map(p => p - commissionPerTrade)).mean;
  } else {
    originalMeanEv = meanAndStdDev(originalPnLs).mean - 1;
  }

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
      // Rolling Z-score of Win Rate & Expectancy to classify trades
      // 1. Calculate rolling values
      const rollingScores = absolutePnLs.map((_, i) => {
        if (i < autoRegimeWindow) return 0;
        const windowData = absolutePnLs.slice(i - autoRegimeWindow, i);
        const wins = windowData.filter(p => p > 0).length;
        const wr = wins / autoRegimeWindow;
        return wr; // simple rolling win rate for now
      });

      // 2. Classify based on threshold (e.g. threshold = 50 means wr > median)
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
  
  let gOmega = (params as any).garchOmega;
  let gAlpha = (params as any).garchAlpha;
  let gBeta = (params as any).garchBeta;
  let gMu = (params as any).garchMu;
  if (modelType === 'garch') {
      const fitted = fitGarch11(originalPnLs);
      gOmega = fitted.params.omega;
      gAlpha = fitted.params.alpha;
      gBeta = fitted.params.beta;
      gMu = fitted.params.mu;
      (params as any).__garchFit = fitted;
  }

  const { default: initWasm, run_mc_simulation } = await import('wasm-engine');
  try {
    await initWasm();
  } catch (_) {
    // Already initialized — safe to ignore
  }

  const wasmParams = {
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
      random_seed: randomSeed,
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
  const wasmRes = JSON.parse(wasmResStr);

  const finalBalances: number[] = [];
  const maxDrawdowns: number[] = [];
  const allEndPnls: number[] = [];
  const storedPaths: number[][] = [];
  const tradesToTarget: number[] = [];
  let evSum = 0;
  let ruinS = 0;
  let passedCount = 0;
  let failDrawdownCount = 0;
  let failConsistencyCount = 0;
  let failTimeCount = 0;

  finalBalances.push(...wasmRes.final_balances);
  maxDrawdowns.push(...wasmRes.max_drawdowns);

  if (wasmRes.stored_paths && Array.isArray(wasmRes.stored_paths)) {
    storedPaths.push(...wasmRes.stored_paths);
  }

  for (const finalBal of wasmRes.final_balances) {
      let pathReturn = 0;
      if (dataFormat === 'absolute') {
          pathReturn = (finalBal - startingCapital) / Math.max(1, nTrades);
      } else {
          pathReturn = finalBal > 0 ? (Math.pow(finalBal / startingCapital, 1/Math.max(1, nTrades)) - 1) : -1;
      }
      allEndPnls.push(pathReturn);
  }

  evSum = wasmRes.mean_ev * nSimulations;
  ruinS = Math.round((wasmRes.ruin_probability / 100) * nSimulations);

  passedCount = wasmRes.passed_count;
  failDrawdownCount = wasmRes.fail_drawdown_count;
  failConsistencyCount = wasmRes.fail_consistency_count;
  failTimeCount = wasmRes.fail_time_count;

  if (wasmRes.distribution_fit) {
      (params as any).__fittedDist = wasmRes.distribution_fit;
  }

  if (onProgress) onProgress(nSimulations, nSimulations);

  const ruinProbability = (ruinS / nSimulations) * 100;
  const meanEv = evSum / nSimulations;
  
  allEndPnls.sort((a,b) => a-b);
  const confidenceLowerEv = allEndPnls[Math.floor(nSimulations * 0.05)];
  const confidenceUpperEv = allEndPnls[Math.floor(nSimulations * 0.95)];

  const sortedBalances = [...finalBalances].sort((a,b) => a-b);
  const p5Balance = sortedBalances[Math.floor(nSimulations * 0.05)] || 0;
  const p95Balance = sortedBalances[Math.floor(nSimulations * 0.95)] || 0;
  const meanFinalBalance = finalBalances.reduce((a, b) => a + b, 0) / Math.max(1, nSimulations);

  const runMeta: SimulationRunMeta = {
    runId: `run_${Date.now()}`,
    timestamp: new Date().toISOString(),
    randomSeed: randomSeed ?? null,
    samplingMode: modelType === 'basic' ? samplingMode : 'bootstrap',
    modelType,
    nSimulations,
    nTrades,
    dataFormat,
    rowFrequency,
    commissionPerTrade,
  };

  const terminalValid = terminalPnLValidForRun(
    modelType,
    samplingMode,
    dataFormat,
    finalBalances
  );

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
    distributionFit: (params as any).__fittedDist ?? undefined,
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
  // Model validation: GoF, serial dependence, VaR backtest, PIT.
  // Use one stored path's increments (if any) to test resampler dependence.
  const repPath = storedPaths.length > 0 ? storedPaths[0] : null;
  const repIncrements = repPath
    ? repPath.slice(1).map((v, i) => v - repPath[i])
    : undefined;
  const terminalPnLForGoF = finalBalances.map((b) => b - startingCapital);
  const validationRng = randomSeed != null ? createSeededRng(randomSeed + 7919) : Math.random;
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
      .filter((row) => typeof row.bench === 'number' && isFinite(row.bench as number));
    if (aligned.length >= 10) {
      try {
        statResult.attribution = buildAttributionReport(
          aligned.map((r) => r.ret),
          aligned.map((r) => r.bench as number),
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

  // GARCH params if applicable
  if ((params as any).__garchFit) {
    statResult.garchFit = (params as any).__garchFit.params;
  }

  if (params.propFirmRulesEnabled) {
    const sortedTTT = [...tradesToTarget].sort((a,b) => a-b);
    statResult.propEvalStats = {
      passRate: (passedCount / nSimulations) * 100,
      failDrawdown: (failDrawdownCount / nSimulations) * 100,
      failConsistency: (failConsistencyCount / nSimulations) * 100,
      failTime: (failTimeCount / nSimulations) * 100,
      tradesToTarget,
      medianTradesToTarget: sortedTTT.length > 0 ? sortedTTT[Math.floor(sortedTTT.length / 2)] : 0,
    };
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
