import { DailyData, DataFormat, PositionSizingRecommendation, RowFrequency } from './types';
import { runSimulation } from './simulationEngine';

export type PositionSizingParams = {
  data: DailyData[];
  dataFormat: DataFormat;
  startingCapital: number;
  ruinThreshold: number;
  commissionPerTrade: number;
  randomSeed: number | null;
  rowFrequency: RowFrequency;
  periodsPerYear: number;
  baselineRuin: number;
  baselineCvar95: number;
  baselineStdPnL: number;
  baselineMeanPnL: number;
};

function scaleData(data: DailyData[], scale: number): DailyData[] {
  return data.map((d) => ({ ...d, pnl: d.pnl * scale }));
}

type ScaleMetrics = {
  ruinProbability: number;
  cvar95: number;
  stdTerminalPnL: number;
  meanTerminalPnL: number;
};

async function metricsAtScale(
  params: PositionSizingParams,
  scale: number,
  nSimulations: number
): Promise<ScaleMetrics> {
  const result = await runSimulation({
    nSimulations,
    nTrades: params.data.length,
    startingCapital: params.startingCapital,
    ruinThreshold: params.ruinThreshold,
    modelType: 'parametric',
    data: scaleData(params.data, scale),
    dataFormat: params.dataFormat,
    commissionPerTrade: params.commissionPerTrade,
    randomSeed: params.randomSeed,
    samplingMode: 'bootstrap',
    rowFrequency: params.rowFrequency,
    periodsPerYear: params.periodsPerYear,
    propFirmRulesEnabled: false,
    propTarget: 0,
    propMaxDrawdown: 0,
    propConsistencyPercent: 0,
    dailyLossLimitEnabled: false,
    dailyMaxLosses: 0,
    dailyMaxLossDollars: 0,
    tradesPerSession: 1,
  });

  const pnls = result.finalBalances.map((b) => b - params.startingCapital);
  const mean = pnls.reduce((s, v) => s + v, 0) / Math.max(1, pnls.length);
  const variance =
    pnls.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, pnls.length - 1);
  const std = Math.sqrt(variance);

  return {
    ruinProbability: result.ruinProbability,
    cvar95: result.institutionalMetrics.cvar95,
    stdTerminalPnL: std,
    meanTerminalPnL: mean,
  };
}

function meetsGuardrails(m: ScaleMetrics, startingCapital: number): boolean {
  const meanRef = Math.max(Math.abs(m.meanTerminalPnL), 1);
  return (
    m.ruinProbability < 2 &&
    m.cvar95 >= -0.3 * startingCapital &&
    m.stdTerminalPnL < 1.5 * meanRef
  );
}

/**
 * Largest scale in [minScale, 1] satisfying ruin < 2%, |CVaR95| <= 30% account, std < 1.5×|mean|.
 */
export async function computePositionSizingRecommendation(
  params: PositionSizingParams,
  options?: { searchSimulations?: number; minScale?: number }
): Promise<PositionSizingRecommendation> {
  const searchSims = options?.searchSimulations ?? 2500;
  const minScale = options?.minScale ?? 0.05;

  const baseline = {
    scale: 1,
    ruinProbability: params.baselineRuin,
    cvar95: params.baselineCvar95,
    stdTerminalPnL: params.baselineStdPnL,
    meanTerminalPnL: params.baselineMeanPnL,
  };

  if (meetsGuardrails(baseline, params.startingCapital)) {
    return {
      recommendedScale: 1,
      baselineAtScale1: baseline,
      projectedAtRecommended: baseline,
      constraintsMetAtRecommended: true,
      summary:
        'Full parametric size already meets all guardrails (ruin < 2%, CVaR 95% within 30% of account, volatility below 1.5× mean PnL). No reduction required.',
    };
  }

  let lo = minScale;
  let hi = 1;
  let best = minScale;
  let bestMetrics = await metricsAtScale(params, minScale, searchSims);

  if (!meetsGuardrails(bestMetrics, params.startingCapital)) {
    return {
      recommendedScale: minScale,
      baselineAtScale1: baseline,
      projectedAtRecommended: { scale: minScale, ...bestMetrics },
      constraintsMetAtRecommended: false,
      summary:
        `Even at ${(minScale * 100).toFixed(0)}% size, guardrails are not fully met (ruin ${bestMetrics.ruinProbability.toFixed(2)}%, CVaR 95% $${Math.round(bestMetrics.cvar95).toLocaleString()}). Consider fewer trades, tighter stops, or more capital.`,
    };
  }

  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const m = await metricsAtScale(params, mid, searchSims);
    if (meetsGuardrails(m, params.startingCapital)) {
      best = mid;
      bestMetrics = m;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const pct = (best * 100).toFixed(1);
  const ruinDelta = params.baselineRuin - bestMetrics.ruinProbability;
  const cvarDelta = bestMetrics.cvar95 - params.baselineCvar95;

  return {
    recommendedScale: best,
    baselineAtScale1: baseline,
    projectedAtRecommended: { scale: best, ...bestMetrics },
    constraintsMetAtRecommended: true,
    summary: `Recommended position scale: ${pct}% of backtested size. At this scale, ruin probability drops by about ${ruinDelta.toFixed(2)} points to ${bestMetrics.ruinProbability.toFixed(2)}% (target < 2%), CVaR 95% improves by about $${Math.round(cvarDelta).toLocaleString()} to $${Math.round(bestMetrics.cvar95).toLocaleString()} (floor −30% of $${params.startingCapital.toLocaleString()} account), and terminal PnL volatility stays within 1.5× the mean. Mean terminal PnL scales to about $${Math.round(bestMetrics.meanTerminalPnL).toLocaleString()} vs $${Math.round(params.baselineMeanPnL).toLocaleString()} at 100% size.`,
  };
}
