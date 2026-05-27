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

type SimulationParams = BaseModelConfig & {
  modelType: 'basic' | 'regime' | 'parametric' | 'garch';
  data: DailyData[];
  dataFormat: 'pct' | 'mult' | 'absolute';
  onProgress?: (completed: number, total: number) => void;
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
  let simulatePath: () => number[];

  if (modelType === 'basic') {
    // Pre-compute block bootstrap parameters if needed
    const blockInfo = samplingMode === 'block_bootstrap'
      ? optimalBlockLength(originalPnLs)
      : null;
    const avgBlock = blockInfo ? blockInfo.avgBlockLength : 1;

    // Build slippage config
    const slippageConfig: SlippageConfig = {
      model: params.slippageModel || 'fixed',
      fixedSlippagePerTrade: commissionPerTrade,
      impactCoefficient: params.impactCoefficient || 0.1,
      baseVolatility: dataFormat === 'absolute' ? estimateBaseVolatility(originalPnLs) : 0,
    };

    simulatePath = () => {
      const path = [startingCapital];
      let sessionLossCount = 0;
      let sessionDollarLoss = 0;

      let tradeSequence: number[];
      if (samplingMode === 'permutation') {
        const indices = originalPnLs.map((_, i) => i);
        shuffleInPlace(indices, rng);
        tradeSequence = indices.map((i) => originalPnLs[i]);
      } else if (samplingMode === 'block_bootstrap') {
        tradeSequence = stationaryBlockBootstrap(originalPnLs, nTrades, avgBlock, rng);
      } else {
        tradeSequence = [];
      }

      for (let t = 0; t < nTrades; t++) {
        if (params.dailyLossLimitEnabled && t % params.tradesPerSession === 0) {
            sessionLossCount = 0;
            sessionDollarLoss = 0;
        }

        if (params.dailyLossLimitEnabled && (sessionLossCount >= params.dailyMaxLosses || sessionDollarLoss <= -params.dailyMaxLossDollars)) {
            path.push(path[path.length - 1]);
            continue;
        }

        const ret =
          (samplingMode === 'permutation' || samplingMode === 'block_bootstrap')
            ? tradeSequence[t % tradeSequence.length]
            : originalPnLs[Math.floor(rng() * originalPnLs.length)];

        // Dynamic slippage
        const slip = computeSlippage(slippageConfig, ret, positionSizeMultiplier, slippageConfig.baseVolatility);

        let newBalance = 0;
        if (dataFormat === 'absolute') {
          newBalance = path[path.length - 1] + ret - slip;
        } else {
          newBalance = path[path.length - 1] * ret;
        }
        path.push(newBalance);

        if (params.dailyLossLimitEnabled) {
          const tradePnL = newBalance - path[path.length - 2];
          if (tradePnL < 0) sessionLossCount++;
          sessionDollarLoss += tradePnL;
        }
      }
      return path;
    };

  } else if (modelType === 'regime') {
    // Regime-Switching Model
    const regimes = uniqueRegimes;
    const transitionCounts: Record<string, Record<string, number>> = {};
    const regimePnls: Record<string, number[]> = {};

    regimes.forEach(r => {
      transitionCounts[r] = {};
      regimes.forEach(r2 => transitionCounts[r][r2] = 0);
      regimePnls[r] = [];
    });

    for (let i = 0; i < absolutePnLs.length; i++) {
        const r = finalRegimeTags[i];
        regimePnls[r].push(originalPnLs[i]);
        if (i < absolutePnLs.length - 1) {
            const nextR = finalRegimeTags[i + 1];
            transitionCounts[r][nextR]++;
        }
    }

    // Convert counts to probabilities
    const transitionProbs: Record<string, Record<string, number>> = {};
    for (const r of regimes) {
        let total = 0;
        for (const r2 of regimes) total += transitionCounts[r][r2];
        transitionProbs[r] = {};
        for (const r2 of regimes) {
            transitionProbs[r][r2] = total > 0 ? transitionCounts[r][r2] / total : (1 / regimes.length);
        }
    }

    simulatePath = () => {
      const path = [startingCapital];
      let currentRegime = regimes[Math.floor(rng() * regimes.length)];
      let sessionLossCount = 0;
      let sessionDollarLoss = 0;
      for (let t = 0; t < nTrades; t++) {
        if (params.dailyLossLimitEnabled && t % params.tradesPerSession === 0) {
            sessionLossCount = 0;
            sessionDollarLoss = 0;
        }

        if (params.dailyLossLimitEnabled && (sessionLossCount >= params.dailyMaxLosses || sessionDollarLoss <= -params.dailyMaxLossDollars)) {
            path.push(path[path.length - 1]);
            continue;
        }

        // Draw PnL
        const pnlList = regimePnls[currentRegime];
        const ret = pnlList.length > 0 ? pnlList[Math.floor(rng() * pnlList.length)] : (dataFormat === 'absolute' ? 0 : 1);
        let newBalance = 0;
        if (dataFormat === 'absolute') {
          newBalance = path[path.length - 1] + ret - commissionPerTrade;
        } else {
          newBalance = path[path.length - 1] * ret;
        }
        path.push(newBalance);

        if (params.dailyLossLimitEnabled) {
          const tradePnL = newBalance - path[path.length - 2];
          if (tradePnL < 0) sessionLossCount++;
          sessionDollarLoss += tradePnL;
        }

        // Transition Regime
        const probs = transitionProbs[currentRegime];
        let rand = rng();
        let cumulative = 0;
        for (const [nextR, prob] of Object.entries(probs)) {
          cumulative += prob;
          if (rand <= cumulative) {
            currentRegime = nextR;
            break;
          }
        }
      }
      return path;
    };

  } else {
    // Parametric Model — MLE-fitted distribution (Normal or Student-t)
    const fitInput = dataFormat === 'absolute' ? originalPnLs.map(p => p - commissionPerTrade) : originalPnLs.map(x => x - 1);
    const fitResult = fitBestDistribution(fitInput);
    const fittedDist = fitResult.best;
    const fittedMu = fittedDist.mu;
    const fittedSigma = fittedDist.sigma;
    const fittedDf = fittedDist.df ?? 30; // fallback for Normal (high df ≈ normal)

    simulatePath = () => {
      const path = [startingCapital];
      let sessionLossCount = 0;
      let sessionDollarLoss = 0;
      for (let t = 0; t < nTrades; t++) {
        if (params.dailyLossLimitEnabled && t % params.tradesPerSession === 0) {
            sessionLossCount = 0;
            sessionDollarLoss = 0;
        }

        if (params.dailyLossLimitEnabled && (sessionLossCount >= params.dailyMaxLosses || sessionDollarLoss <= -params.dailyMaxLossDollars)) {
            path.push(path[path.length - 1]);
            continue;
        }

        // Draw from MLE-fitted distribution
        const tVal = fittedDist.type === 'student_t'
          ? randomStudentT(fittedDf, rng)
          : randomStudentT(30, rng); // Normal ≈ t(30)
        
        let newBalance = 0;
        if (dataFormat === 'absolute') {
            const simulatedDraw = fittedMu + tVal * fittedSigma;
            newBalance = path[path.length - 1] + simulatedDraw - commissionPerTrade;
        } else {
            const simulatedDraw = fittedMu + tVal * fittedSigma;
            const ret = 1 + simulatedDraw;
            newBalance = Math.max(0, path[path.length - 1] * ret);
        }
        path.push(newBalance);

        if (params.dailyLossLimitEnabled) {
          const tradePnL = newBalance - path[path.length - 2];
          if (tradePnL < 0) sessionLossCount++;
          sessionDollarLoss += tradePnL;
        }
      }
      return path;
    };

    // Store fit result for UI display
    (params as any).__fittedDist = fittedDist;
  }

  // ═══ GARCH(1,1) Model ═══
  if (modelType === 'garch') {
    const fitInput = dataFormat === 'absolute' ? originalPnLs.map(p => p - commissionPerTrade) : originalPnLs.map(x => x - 1);
    const garchResult = fitGarch11(fitInput);
    const garchParams = garchResult.params;
    
    // Also fit distribution for innovation type
    const fitResult = fitBestDistribution(fitInput);
    const fittedDist = fitResult.best;
    const innovDf = fittedDist.type === 'student_t' && fittedDist.df ? fittedDist.df : undefined;
    
    // Store for UI
    (params as any).__garchFit = garchParams;
    (params as any).__fittedDist = fittedDist;
    
    simulatePath = () => {
      const garchPnLs = simulateGarchPath(garchParams, nTrades, rng, innovDf);
      const path = [startingCapital];
      let sessionLossCount = 0;
      let sessionDollarLoss = 0;
      for (let t = 0; t < nTrades; t++) {
        if (params.dailyLossLimitEnabled && t % params.tradesPerSession === 0) {
          sessionLossCount = 0;
          sessionDollarLoss = 0;
        }
        if (params.dailyLossLimitEnabled && (sessionLossCount >= params.dailyMaxLosses || sessionDollarLoss <= -params.dailyMaxLossDollars)) {
          path.push(path[path.length - 1]);
          continue;
        }
        let newBalance: number;
        if (dataFormat === 'absolute') {
          newBalance = path[path.length - 1] + garchPnLs[t];
        } else {
          newBalance = Math.max(0, path[path.length - 1] * (1 + garchPnLs[t]));
        }
        path.push(newBalance);
        if (params.dailyLossLimitEnabled) {
          const tradePnL = newBalance - path[path.length - 2];
          if (tradePnL < 0) sessionLossCount++;
          sessionDollarLoss += tradePnL;
        }
      }
      return path;
    };
  }

  // 3. Execution
  const storedPaths: number[][] = [];
  const pathStoreInterval = Math.max(1, Math.floor(nSimulations / MAX_STORED_PATHS));
  const finalBalances: number[] = [];
  const maxDrawdowns: number[] = [];
  let ruinS = 0;
  const ruinVal = startingCapital * (1 - (ruinThreshold / 100));
  let evSum = 0;
  let allEndPnls: number[] = [];

  let passedCount = 0;
  let failDrawdownCount = 0;
  let failConsistencyCount = 0;
  let failTimeCount = 0;
  const tradesToTarget: number[] = []; // Track how many trades each passing sim took
  const { propFirmRulesEnabled, propTarget, propMaxDrawdown, propConsistencyPercent } = params;

  for (let i = 0; i < nSimulations; i++) {
    if (i > 0 && i % CHUNK_SIZE === 0) {
      if (onProgress) onProgress(i, nSimulations);
      await yieldToEventLoop();
    }
    const path = simulatePath();
    if (i % pathStoreInterval === 0 && storedPaths.length < MAX_STORED_PATHS) {
      storedPaths.push(path);
    }
    const finalBalance = path[path.length - 1];
    finalBalances.push(finalBalance);
    
    let pathReturn = 0;
    if (dataFormat === 'absolute') {
        pathReturn = (finalBalance - startingCapital) / Math.max(1, nTrades);
    } else {
        pathReturn = finalBalance > 0 ? (Math.pow(finalBalance / startingCapital, 1/Math.max(1, nTrades)) - 1) : -1;
    }
    allEndPnls.push(pathReturn);
    evSum += pathReturn || 0;

    const maxDd = calculateMaxDrawdown(path);
    maxDrawdowns.push(maxDd || 0);

    let isRuin = false;
    for (let pt of path) {
        if (pt <= ruinVal) {
            isRuin = true;
            break;
        }
    }
    if (isRuin) ruinS++;

    // Prop Firm Rules Check
    if (propFirmRulesEnabled) {
      let isDone = false;
      let peakBal = startingCapital;
      let tradeProfits: number[] = [];

      for (let t = 1; t < path.length; t++) {
        const bal = path[t];
        const prevBal = path[t-1];
        const tradeProfit = bal - prevBal;
        tradeProfits.push(tradeProfit);
        
        if (bal > peakBal) peakBal = bal;

        const trailingDrawdown = peakBal - bal;
        if (trailingDrawdown >= propMaxDrawdown) {
          failDrawdownCount++;
          isDone = true;
          break;
        }

        const totalProfit = bal - startingCapital;
        if (totalProfit >= propTarget) {
          const consistencyThreshold = totalProfit * (propConsistencyPercent / 100);
          let failedConsistency = false;
          for (const tp of tradeProfits) {
              if (tp > consistencyThreshold) {
                  failedConsistency = true;
                  break;
              }
          }
          if (failedConsistency) {
              failConsistencyCount++;
          } else {
              passedCount++;
              tradesToTarget.push(t); // Record how many trades it took
          }
          isDone = true;
          break;
        }
      }

      if (!isDone) {
        failTimeCount++;
      }
    }
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

  // GARCH params if applicable
  if ((params as any).__garchFit) {
    statResult.garchFit = (params as any).__garchFit;
  }

  if (propFirmRulesEnabled) {
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
