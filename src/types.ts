import type { InstitutionalRiskMetrics } from './riskMetrics';

export type SamplingMode = 'bootstrap' | 'permutation' | 'block_bootstrap';
/** Portfolio-only: independent sleeves vs Gaussian copula vs Student-t copula vs Dynamic Copula */
export type PortfolioResampling = 'independent' | 'gaussian_copula' | 'student_t_copula' | 'dynamic_copula';
export type RowFrequency = 'trade' | 'day';
export type SlippageModel = 'none' | 'fixed' | 'sqrt_impact';

export type BaseModelConfig = {
  nSimulations: number;
  nTrades: number;
  startingCapital: number;
  ruinThreshold: number;
  commissionPerTrade: number;
  randomSeed: number | null;
  samplingMode: SamplingMode;
  rowFrequency: RowFrequency;
  periodsPerYear: number;
  positionSizeMultiplier: number;
  
  // Regime Settings
  regimeSource: string; // column name, or 'AUTO'
  autoRegimeWindow: number;
  autoRegimeThreshold: number; // percentile (0-100) or cutoff

  propFirmRulesEnabled: boolean;
  propTarget: number; // Absolute $ profit target
  propMaxDrawdown: number; // Absolute $ max trailing drawdown
  propConsistencyPercent: number; // Max percentage of total profits from a single trade
  dailyLossLimitEnabled: boolean;
  dailyMaxLosses: number;
  dailyMaxLossDollars: number;
  tradesPerSession: number;

  // Slippage
  slippageModel: SlippageModel;
  impactCoefficient: number; // k for sqrt_impact (default 0.1)

  // Portfolio copula
  copulaDf: number; // degrees of freedom for Student-t copula (default 5)
};

export type DataFormat = 'pct' | 'mult' | 'absolute';

export type HistoricalStats = {
  totalTrades: number;
  winRate: number;        // 0-100
  profitFactor: number;   // gross profit / gross loss
  avgWin: number;         // average winning trade $
  avgLoss: number;        // average losing trade $ (positive number)
  expectancy: number;     // average $ per trade
  sharpeRatio: number;    // annualized (assume 252 trading days)
  sortinoRatio: number;   // downside-only risk-adjusted
  maxConsecutiveLosses: number;
  kellyCriterion: number; // optimal fraction to risk (0-1)
  recoveryFactor: number; // net profit / max drawdown
  byRegime?: Record<string, Omit<HistoricalStats, 'byRegime'>>; // Breakdown by regime tag
};

export type SimulationRunMeta = {
  runId: string;
  timestamp: string;
  randomSeed: number | null;
  samplingMode: SamplingMode;
  modelType: 'basic' | 'regime' | 'parametric' | 'portfolio' | 'garch';
  nSimulations: number;
  nTrades: number;
  dataFormat: DataFormat;
  rowFrequency: RowFrequency;
  commissionPerTrade: number;
};

export type SimulationResults = {
  nSimulations: number;   // actual count for display
  paths: number[][];      // Subsampled paths for plotting
  finalBalances: number[];
  maxDrawdowns: number[];
  ruinProbability: number;
  meanEv: number;
  confidenceLowerEv: number;
  confidenceUpperEv: number;
  p5Balance: number;
  p95Balance: number;
  meanFinalBalance: number;
  originalMaxDrawdown: number;
  originalPath: number[];
  modelType: 'basic' | 'regime' | 'parametric' | 'portfolio' | 'garch';
  historicalStats: HistoricalStats;
  institutionalMetrics: InstitutionalRiskMetrics;
  metricsValidity: MetricsValidity;
  runMeta: SimulationRunMeta;
  portfolioMeta?: PortfolioStrategyMeta;
  positionSizing?: PositionSizingRecommendation;
  propEvalStats?: {
    passRate: number;
    failDrawdown: number;
    failConsistency: number;
    failTime: number;
    tradesToTarget: number[];   // How many trades each passing sim took
    medianTradesToTarget: number;
  };
  distributionFit?: import('./distributionFitting').FittedDistribution;
  convergence?: import('./convergenceDiagnostics').ConvergenceResult;
  stressTest?: import('./stressTesting').StressTestResult;
  drawdownDuration?: {
    medianMaxDuration: number;
    p95MaxDuration: number;
    avgPctUnderwater: number;
  };
  garchFit?: import('./garch').GarchParams;
  modelValidation?: import('./modelValidation').ModelValidationReport;
  evt?: import('./evt').EVTReport;
  attribution?: import('./benchmarkAttribution').AttributionReport;
  timestampAnalytics?: import('./timestampAnalytics').TimestampAnalyticsReport;
  walkForward?: import('./walkForward').WalkForwardReport;
  multiFactor?: import('./benchmarkAttribution').MultiFactorReport;
};

export type DailyData = {
  pnl: number;
  regime?: string;
  /** Portfolio correlation-regime bucket (in_regime / clustered / …) */
  segment?: string;
  /** Optional ISO timestamp string for calendar-aware analytics */
  timestamp?: string;
  /** Optional benchmark per-period return (decimal or %) for attribution */
  benchmarkReturn?: number;
  /** Optional multi-factor row (e.g. [Mkt-RF, SMB, HML]). Aligns with factorNames in the engine call. */
  factorRow?: number[];
};

export type MetricsValidity = {
  terminalPnL: boolean;
  drawdown: boolean;
  warning?: string;
};

export type PositionSizingMetrics = {
  scale: number;
  ruinProbability: number;
  cvar95: number;
  stdTerminalPnL: number;
  meanTerminalPnL: number;
};

export type PositionSizingRecommendation = {
  recommendedScale: number;
  baselineAtScale1: PositionSizingMetrics;
  projectedAtRecommended: PositionSizingMetrics;
  constraintsMetAtRecommended: boolean;
  summary: string;
};

export type PortfolioRegimeBreakdown = {
  segmentId: string;
  label: string;
  tradeCount: number;
  meanPnL: number;
  winRate: number;
  var95: number;
  cvar95: number;
  ruinProbability: number;
};

export type StrategyAllocation = {
  id: string;
  name: string;
  weight: number;
  data: DailyData[];
};

export type PortfolioStrategyResult = {
  id: string;
  name: string;
  weight: number;
  allocatedCapital: number;
  historicalStats: HistoricalStats;
  soloMaxDrawdown: number;
  soloTerminalBalance: number;
  soloNetPnL: number;
};

export type PortfolioStrategyMeta = {
  strategyNames: string[];
  correlationMatrix: number[][];
  /** PSD-adjusted matrix used for Cholesky copula draws */
  correlationMatrixUsed: number[][];
  resampling: PortfolioResampling;
  strategies: PortfolioStrategyResult[];
  horizonTrades: number;
  /** Weighted avg solo DD / portfolio median DD — values > 1 imply diversification benefit */
  diversificationRatio: number;
  regimeBreakdown?: PortfolioRegimeBreakdown[];
};

export type DynamicCopulaModel = {
  regimes: string[];
  choleskyLByRegime: Record<string, number[][]>;
  transitionMatrix: Record<string, Record<string, number>>;
  initialProbabilities: Record<string, number>;
};

export type PropFirmPreset = {
  name: string;
  target: number;
  maxDrawdown: number;
  consistencyPercent: number;
  dailyLossLimit?: number;
};

export const PROP_FIRM_PRESETS: PropFirmPreset[] = [
  { name: 'TopOneFutures 50k', target: 3000, maxDrawdown: 1500, consistencyPercent: 30 },
  { name: 'TopOneFutures 150k', target: 9000, maxDrawdown: 4500, consistencyPercent: 30 },
  { name: 'FTMO 100k', target: 10000, maxDrawdown: 10000, consistencyPercent: 100, dailyLossLimit: 5000 },
  { name: 'FTMO 200k', target: 20000, maxDrawdown: 20000, consistencyPercent: 100, dailyLossLimit: 10000 },
  { name: 'Apex 50k', target: 3000, maxDrawdown: 2500, consistencyPercent: 100 },
  { name: 'Apex 100k', target: 6000, maxDrawdown: 3000, consistencyPercent: 100 },
];
