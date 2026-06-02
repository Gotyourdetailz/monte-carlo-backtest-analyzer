import type { InstitutionalRiskMetrics } from './riskMetrics';

export type SamplingMode = 'bootstrap' | 'permutation' | 'block_bootstrap';
/** Portfolio-only: independent sleeves vs Gaussian copula vs Student-t copula vs Dynamic Copula */
export type PortfolioResampling = 'independent' | 'gaussian_copula' | 'student_t_copula' | 'dynamic_copula';
export type RowFrequency = 'trade' | 'day';
export type SlippageModel = 'none' | 'fixed' | 'sqrt_impact';

export type DataFormat = 'pct' | 'mult' | 'absolute';

/**
 * Cap on the number of equity-curve paths retained for spaghetti-plot
 * visualization. This must match the cap enforced inside the WASM kernel
 * (`max_stored_paths` in `wasm-engine/src/lib.rs`) so that single-strategy
 * runs (kernel-driven) and portfolio runs (TS-driven) surface the same
 * sample size to the UI. Bumping this on either side requires bumping it
 * on the other in lockstep.
 *
 * Requirement 6.2 (F-SD-05, F-SD-17, F-CQ-31): the path-cap value lives
 * in exactly one place.
 */
export const MAX_STORED_PATHS = 50;

/**
 * Fields common to every simulation run, regardless of single-strategy vs
 * portfolio dispatch.
 *
 * Slippage fields live here because both engines must accept them on the
 * common worker payload (per `workerProtocol.CommonRunPayload`); the
 * portfolio engine currently ignores them, but they are still wired through
 * for forward compatibility with portfolio-level slippage modeling.
 */
export type CommonRunConfig = {
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

  // Slippage (common: applies to single-strategy paths, portfolio reserved for forward compat)
  slippageModel: SlippageModel;
  impactCoefficient: number; // k for sqrt_impact (default 0.1)

  /**
   * When true, the engine skips the post-simulation institutional add-ons
   * (model validation, EVT, benchmark attribution, timestamp analytics,
   * walk-forward, multi-factor attribution). Used by the position-sizing
   * bisection so each intermediate scale-search run only pays for the
   * headline simulation rather than the full validation suite. Defaults
   * to `false` so headline runs always include full analytics.
   * Requirement 14.1, 14.2, 14.3 (F-SD-14).
   */
  skipPostSimAnalytics?: boolean;
};

/**
 * Single-strategy run config (basic / regime / parametric / GARCH).
 *
 * Carries the regime-tagging and prop-firm evaluation fields that are
 * meaningless on a portfolio run, plus engine-only fields (`data`,
 * `dataFormat`, `factorNames`, `onProgress`) that are not part of the
 * worker-boundary payload.
 *
 * Discriminator: `modelType` ∈ {'basic','regime','parametric','garch'}.
 */
export type SingleStrategyConfig = CommonRunConfig & {
  modelType: 'basic' | 'regime' | 'parametric' | 'garch';
  data: DailyData[];
  dataFormat: DataFormat;
  /** Ordered factor labels matching `DailyData.factorRow` entries. */
  factorNames?: string[];
  onProgress?: (completed: number, total: number) => void;

  // Regime Settings
  regimeSource: string; // column name, or 'AUTO'
  autoRegimeWindow: number;
  autoRegimeThreshold: number; // percentile (0-100) or cutoff

  // Prop-firm evaluation
  propFirmRulesEnabled: boolean;
  propTarget: number; // Absolute $ profit target
  propMaxDrawdown: number; // Absolute $ max trailing drawdown
  propConsistencyPercent: number; // Max percentage of total profits from a single trade
  dailyLossLimitEnabled: boolean;
  dailyMaxLosses: number;
  dailyMaxLossDollars: number;
  tradesPerSession: number;
};

/**
 * Multi-strategy portfolio run config.
 *
 * Single-strategy fields (`propTarget`, `propMaxDrawdown`, `dailyMaxLosses`,
 * `regimeSource`, …) are intentionally absent here so the wrong fields
 * cannot be silently consumed (Requirement 8.5).
 *
 * Discriminator: `modelType` = `'portfolio'`.
 */
export type PortfolioConfig = CommonRunConfig & {
  modelType: 'portfolio';
  strategies: StrategyAllocation[];
  dataFormat: DataFormat;
  /** Degrees of freedom for the Student-t copula (default 5). Portfolio-only. */
  copulaDf: number;
  portfolioResampling?: PortfolioResampling;
  /** True when each sleeve is the same CSV row index (multi-column); false for instrument-filtered logs. */
  portfolioAlignedRows?: boolean;
  enablePortfolioRegimeBreakdown?: boolean;
  factorNames?: string[];
  onProgress?: (completed: number, total: number) => void;
};

/** Discriminated union over `modelType` keyed by `'portfolio'` vs the single-strategy literals. */
export type SimulationParams = SingleStrategyConfig | PortfolioConfig;

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

/**
 * Identifies which PRNG implementation produced a given run's randomness.
 *
 * - `'mulberry32-ts'`  — TS-only paths (portfolio, position-sizing search,
 *   validation). Mulberry32 seeded via `createSeededRng` in `mathUtils.ts`.
 * - `'stdrng-chacha-rs'` — WASM-only paths (basic / regime / parametric /
 *   garch single-strategy runs through the Rust kernel).
 * - `'mixed-mulberry32+stdrng'` — single-strategy runs with a TS validation
 *   pass over Rust-generated paths.
 *
 * Required for reproducibility comparisons (Requirement 9.2): two runs with
 * mismatched `prngFamily` cannot be declared reproducible peers even when
 * inputs and seeds match.
 */
export type PrngFamily =
  | 'mulberry32-ts'
  | 'stdrng-chacha-rs'
  | 'mixed-mulberry32+stdrng';

export type SimulationRunMeta = {
  runId: string;
  timestamp: string;
  randomSeed: number | null;
  /**
   * The user-supplied sampling mode, persisted verbatim. The engine MUST
   * NOT silently coerce this value — see `effectiveSamplingMode` for the
   * model-coerced case (Requirement 9.4).
   */
  samplingMode: SamplingMode;
  /**
   * Optional engine-coerced sampling mode, present only when the engine
   * internally substitutes a different mode for non-`'basic'` models. The
   * caller-supplied `samplingMode` is never overwritten.
   */
  effectiveSamplingMode?: SamplingMode;
  modelType: 'basic' | 'regime' | 'parametric' | 'portfolio' | 'garch';
  nSimulations: number;
  nTrades: number;
  dataFormat: DataFormat;
  rowFrequency: RowFrequency;
  commissionPerTrade: number;
  /**
   * Identifier of the PRNG family that generated this run's randomness
   * (Requirement 9.1, 9.2). Populated by tasks 8.3 / 8.4; constructed
   * inline today with a placeholder of `'mulberry32-ts'` for TS-only paths.
   */
  prngFamily: PrngFamily;
  /**
   * Version string surfaced from the WASM kernel response, or
   * `'pre-versioned'` for kernels that predate the version tag
   * (Requirement 8.4). Populated by task 8.12.
   */
  kernelVersion: string;
  /**
   * SHA-256 hex digest of the PnL series alone — a fast input-drift alarm
   * complementing the full-input `dataDigest` persisted on
   * `RunHistoryEntry` (Requirement 9.5). Populated by task 8.6.
   */
  pnlDigest: string;
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
    /**
     * Trade counts per passing path. Only populated when the WASM kernel
     * surfaces `trades_to_target_passing` (Requirement 4.1). Until the
     * kernel rebuild lands (Step B), single-strategy runs leave this
     * field undefined and the UI block that consumed it is omitted.
     */
    tradesToTarget?: number[];
    /**
     * Median of `tradesToTarget`. Only populated when the WASM kernel
     * surfaces `trades_to_target_passing` (Requirement 4.1). Until the
     * kernel rebuild lands (Step B), single-strategy runs leave this
     * field undefined.
     */
    medianTradesToTarget?: number;
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
  /**
   * Regime IDs (from the dynamic copula model) that lacked enough data to
   * fit a correlation matrix and fell back to an identity matrix. The UI
   * surfaces this list as visible pills (Requirement 4.8 — F-CQ-13).
   * Only populated when `resampling === 'dynamic_copula'`.
   */
  dynamicCopulaFallbackRegimes?: string[];
};

export type DynamicCopulaModel = {
  regimes: string[];
  choleskyLByRegime: Record<string, number[][]>;
  transitionMatrix: Record<string, Record<string, number>>;
  initialProbabilities: Record<string, number>;
  /**
   * Regime IDs that fell back to an identity correlation matrix because the
   * regime had fewer than two aligned rows or its Cholesky factorization
   * failed (Requirement 4.8 — F-CQ-13). Surfaced to the UI by
   * `portfolioEngine.ts` so the user sees a visible "fallback to
   * independent" pill rather than a silent identity substitution.
   */
  fallbackRegimes: string[];
};

export type PropFirmPreset = {
  name: string;
  target: number;
  maxDrawdown: number;
  consistencyPercent: number;
  accountSize: number;
  dailyLossLimit?: number;
};

export const PROP_FIRM_PRESETS: PropFirmPreset[] = [
  { name: 'TopOneFutures 50k', target: 3000, maxDrawdown: 1500, consistencyPercent: 30, accountSize: 50000 },
  { name: 'TopOneFutures 150k', target: 9000, maxDrawdown: 4500, consistencyPercent: 30, accountSize: 150000 },
  { name: 'FTMO 100k', target: 10000, maxDrawdown: 10000, consistencyPercent: 100, accountSize: 100000, dailyLossLimit: 5000 },
  { name: 'FTMO 200k', target: 20000, maxDrawdown: 20000, consistencyPercent: 100, accountSize: 200000, dailyLossLimit: 10000 },
  { name: 'Apex 50k', target: 3000, maxDrawdown: 2500, consistencyPercent: 100, accountSize: 50000 },
  { name: 'Apex 100k', target: 6000, maxDrawdown: 3000, consistencyPercent: 100, accountSize: 100000 },
];

// ---------------------------------------------------------------------------
// WASM kernel boundary types (forward-compatible scaffold — Requirement 8.3 / 8.4)
// ---------------------------------------------------------------------------

/**
 * JSON-serialized parameters passed across the TS ↔ Rust kernel boundary.
 *
 * The TS engine currently constructs this payload inline via an untyped
 * object literal in `simulationEngine.ts`; this declaration documents the
 * forward-compatible shape that the kernel will eventually validate. Field
 * names use `snake_case` to match the existing serde-deserialized struct on
 * the Rust side.
 *
 * `wasm_protocol_version` is stamped onto every outgoing payload by the
 * dispatcher (Requirement 8.3). Mismatched versions will be rejected by the
 * kernel with a structured error response once Requirement 8.3 lands on the
 * Rust side; the TS scaffold tolerates the older kernel today by treating
 * a missing `error` field as success.
 */
export interface WasmSimulationParams {
  /** Schema version tag; matches `WASM_PROTOCOL_VERSION` in `workerProtocol.ts`. */
  wasm_protocol_version: number;
  n_simulations: number;
  n_trades: number;
  starting_capital: number;
  original_pnls: number[];
  data_format: DataFormat;
  commission_per_trade: number;
  model_type: 'basic' | 'regime' | 'parametric' | 'garch';
  sampling_mode: SamplingMode;
  avg_block_length: number;
  periods_per_year: number;
  random_seed: number | null;
  ruin_threshold: number;
  position_size_multiplier: number;
  slippage_model: SlippageModel;
  impact_coefficient: number;
  base_volatility: number;
  daily_loss_limit_enabled: boolean;
  trades_per_session: number;
  daily_max_losses: number;
  daily_max_loss_dollars: number;
  prop_firm_rules_enabled: boolean;
  prop_target: number;
  prop_max_drawdown: number;
  prop_consistency_percent: number;
  garch_omega?: number;
  garch_alpha?: number;
  garch_beta?: number;
  garch_mu?: number;
  regime_tags?: string[];
}

/**
 * JSON-deserialized result returned from the WASM kernel.
 *
 * The kernel today returns a plain object with the headline fields below;
 * `kernel_version`, `error`, and `trades_to_target_passing` are
 * forward-compatible additions (Requirement 4.1, 7.6, 8.4) that older
 * kernels simply omit. The TS engine treats a missing `error` as success
 * and a missing `kernel_version` as `'pre-versioned'` (task 8.12).
 */
export interface WasmSimulationResults {
  final_balances: number[];
  max_drawdowns: number[];
  stored_paths?: number[][];
  mean_ev: number;
  ruin_probability: number;
  passed_count: number;
  fail_drawdown_count: number;
  fail_consistency_count: number;
  fail_time_count: number;
  distribution_fit?: unknown;
  /**
   * Trade counts per passing path used for the `medianTradesToTarget`
   * UI block. Optional until the WASM rebuild lands (Requirement 4.1).
   */
  trades_to_target_passing?: number[];
  /**
   * Kernel build identifier; absent on pre-versioned kernels
   * (Requirement 8.4).
   */
  kernel_version?: string;
  /**
   * Structured error reason when the kernel fails. When present, the
   * engine throws `WasmKernelError` rather than treating the response as
   * success (Requirement 7.6).
   */
  error?: string;
}
