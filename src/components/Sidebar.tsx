import React from 'react';
import { Upload, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import {
  PortfolioResampling,
  PROP_FIRM_PRESETS,
  SamplingMode,
  SlippageModel,
} from '../types';
import { cn } from '../lib/utils';

/**
 * Sidebar strategy row shape — kept structurally identical to the
 * `PortfolioStrategyConfig` type currently inlined in `App.tsx`. Re-declared
 * here so this module is self-contained and can be imported without circular
 * dependencies. App.tsx will be updated by task 5.13.
 */
export type PortfolioStrategyConfig = {
  column: string;
  name: string;
  weight: number;
  enabled: boolean;
  /** NinjaTrader: sleeve = all trades for this Instrument value */
  groupByInstrument?: boolean;
};

export type SidebarActiveTab = 'basic' | 'regime' | 'parametric' | 'portfolio' | 'garch';

export interface SidebarProps {
  // Data + column metadata
  csvData: Record<string, unknown>[];
  columns: string[];
  ninjaTraderMode: boolean;
  ntInstrumentCol: string;

  // Tab / loading / progress + run history opener
  activeTab: SidebarActiveTab;
  isLoading: boolean;
  progress: number;
  error: string;
  onOpenHistory: () => void;

  // Column mappings
  pnlCol: string;
  setPnlCol: (v: string) => void;
  regimeCol: string;
  setRegimeCol: (v: string) => void;
  timestampCol: string;
  setTimestampCol: (v: string) => void;
  benchmarkCol: string;
  setBenchmarkCol: (v: string) => void;
  benchmarkFormat: 'pct' | 'mult';
  setBenchmarkFormat: (v: 'pct' | 'mult') => void;
  factorCols: string;
  setFactorCols: (v: string) => void;

  // Data + sampling settings
  dataFormat: 'pct' | 'mult' | 'absolute';
  setDataFormat: (v: 'pct' | 'mult' | 'absolute') => void;
  rowFrequency: 'trade' | 'day';
  setRowFrequency: (v: 'trade' | 'day') => void;
  samplingMode: SamplingMode;
  setSamplingMode: (v: SamplingMode) => void;
  portfolioResampling: PortfolioResampling;
  setPortfolioResampling: (v: PortfolioResampling) => void;
  copulaDf: number;
  setCopulaDf: (v: number) => void;
  commissionPerTrade: number;
  setCommissionPerTrade: (v: number) => void;
  slippageModel: SlippageModel;
  setSlippageModel: (v: SlippageModel) => void;
  positionSizeMultiplier: number;
  setPositionSizeMultiplier: (v: number) => void;

  // Auto regime
  autoRegimeWindow: number;
  setAutoRegimeWindow: (v: number) => void;
  autoRegimeThreshold: number;
  setAutoRegimeThreshold: (v: number) => void;

  // Reproducibility / sim sizing
  useFixedSeed: boolean;
  setUseFixedSeed: (v: boolean) => void;
  randomSeed: number;
  setRandomSeed: (v: number) => void;
  nSimulations: number;
  setNSimulations: (v: number) => void;
  startingCapital: number;
  setStartingCapital: (v: number) => void;
  ruinThreshold: number;
  setRuinThreshold: (v: number) => void;

  // Prop firm
  propPreset: string;
  applyPropPreset: (name: string) => void;
  propFirmRulesEnabled: boolean;
  setPropFirmRulesEnabled: (v: boolean) => void;
  propTarget: number;
  setPropTarget: (v: number) => void;
  propMaxDrawdown: number;
  setPropMaxDrawdown: (v: number) => void;
  propConsistencyPercent: number;
  setPropConsistencyPercent: (v: number) => void;
  dailyLossLimitEnabled: boolean;
  setDailyLossLimitEnabled: (v: boolean) => void;
  dailyMaxLosses: number;
  setDailyMaxLosses: (v: number) => void;
  dailyMaxLossDollars: number;
  setDailyMaxLossDollars: (v: number) => void;
  tradesPerSession: number;
  setTradesPerSession: (v: number) => void;

  // Portfolio strategy editor
  portfolioStrategies: PortfolioStrategyConfig[];
  setPortfolioStrategies: React.Dispatch<React.SetStateAction<PortfolioStrategyConfig[]>>;
  enabledPortfolioCount: number;
  setEqualPortfolioWeights: () => void;
  normalizePortfolioWeights: () => void;

  // Top-level handlers
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleRun: () => void;
  handleCancel: () => void;
}

export function Sidebar(props: SidebarProps): React.ReactElement {
  const {
    csvData,
    columns,
    ninjaTraderMode,
    ntInstrumentCol,
    activeTab,
    isLoading,
    progress,
    error,
    onOpenHistory,
    pnlCol,
    setPnlCol,
    regimeCol,
    setRegimeCol,
    timestampCol,
    setTimestampCol,
    benchmarkCol,
    setBenchmarkCol,
    benchmarkFormat,
    setBenchmarkFormat,
    factorCols,
    setFactorCols,
    dataFormat,
    setDataFormat,
    rowFrequency,
    setRowFrequency,
    samplingMode,
    setSamplingMode,
    portfolioResampling,
    setPortfolioResampling,
    copulaDf,
    setCopulaDf,
    commissionPerTrade,
    setCommissionPerTrade,
    slippageModel,
    setSlippageModel,
    positionSizeMultiplier,
    setPositionSizeMultiplier,
    autoRegimeWindow,
    setAutoRegimeWindow,
    autoRegimeThreshold,
    setAutoRegimeThreshold,
    useFixedSeed,
    setUseFixedSeed,
    randomSeed,
    setRandomSeed,
    nSimulations,
    setNSimulations,
    startingCapital,
    setStartingCapital,
    ruinThreshold,
    setRuinThreshold,
    propPreset,
    applyPropPreset,
    propFirmRulesEnabled,
    setPropFirmRulesEnabled,
    propTarget,
    setPropTarget,
    propMaxDrawdown,
    setPropMaxDrawdown,
    propConsistencyPercent,
    setPropConsistencyPercent,
    dailyLossLimitEnabled,
    setDailyLossLimitEnabled,
    dailyMaxLosses,
    setDailyMaxLosses,
    dailyMaxLossDollars,
    setDailyMaxLossDollars,
    tradesPerSession,
    setTradesPerSession,
    portfolioStrategies,
    setPortfolioStrategies,
    enabledPortfolioCount,
    setEqualPortfolioWeights,
    normalizePortfolioWeights,
    handleFileUpload,
    handleRun,
    handleCancel,
  } = props;

  return (
    <aside
      className={cn(
        'w-[280px] bg-[var(--bg-secondary)] border-r flex flex-col p-5 overflow-y-auto shrink-0 z-10 custom-scrollbar transition-all duration-500',
        isLoading
          ? 'border-[var(--accent-mint)]/60'
          : 'border-[var(--border)]',
      )}
    >
      <div className="flex items-center gap-3 mb-8 mt-2">
        <div className="brand-mark w-8 h-8 bg-[var(--accent-mint)] rounded-lg flex items-center justify-center font-bold text-[var(--bg-primary)] text-xs">EC</div>
        <h1 className="font-display text-lg font-semibold tracking-tight text-[var(--text-primary)]">Edge<span className="text-[var(--accent-mint)]">Check</span></h1>
        <button
          type="button"
          onClick={onOpenHistory}
          aria-label="Open run history"
          title="Run history"
          className="btn-press ml-auto p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
            <path d="M12 7v5l3 2" />
          </svg>
        </button>
      </div>

      <div className="space-y-6 flex-1 pr-1">
        {/* File Upload section */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold mb-2 block">Data Input</label>
          <label className="file-drop border-2 border-dashed border-[var(--border)] rounded-lg p-4 text-center cursor-pointer flex flex-col items-center justify-center w-full">
            <Upload className="w-4 h-4 text-[var(--text-secondary)] mb-1" />
            <span className="text-xs text-[var(--text-secondary)]">Drop CSV or Excel here</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
          {csvData.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-[#238636] font-medium flex items-center justify-center">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Loaded {csvData.length} records
              </p>
              {ninjaTraderMode && (
                <p className="text-[10px] text-[var(--accent-blue)] text-center leading-tight">
                  NinjaTrader export detected — PnL: Profit · Portfolio sleeves: Instrument
                </p>
              )}
            </div>
          )}
        </div>

        <div className="divider-gradient" />

        {/* Column Mapping */}
        <div className="space-y-4">
          <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold block">
            {activeTab === 'portfolio' ? 'Portfolio Sleeves' : 'Column Mapping'}
          </h3>

          {activeTab === 'portfolio' ? (
            <div className="space-y-3">
              {portfolioStrategies.length < 2 && (
                <p className="text-[10px] text-[var(--accent-red)]">
                  {ninjaTraderMode
                    ? 'Need 2+ instruments in the file (e.g. MNQ, NQ, MGC).'
                    : 'Upload a CSV with 2+ numeric PnL columns (one per strategy), aligned by row.'}
                </p>
              )}
              {ninjaTraderMode && portfolioStrategies.length >= 2 && (
                <p className="text-[10px] text-[var(--text-secondary)] leading-tight">
                  Sleeves group trades by Instrument. Horizon uses the shortest sleeve.
                </p>
              )}
              {portfolioStrategies.map((st) => (
                <div key={st.column} className="border border-[var(--border)] rounded-lg p-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={st.enabled}
                      onChange={() =>
                        setPortfolioStrategies((prev) =>
                          prev.map((p) =>
                            p.column === st.column ? { ...p, enabled: !p.enabled } : p
                          )
                        )
                      }
                      className="accent-[#238636]"
                    />
                    <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {st.groupByInstrument ? `${st.name} (${csvData.filter((r) => String(r[ntInstrumentCol]) === st.column).length} trades)` : st.column}
                    </span>
                  </label>
                  {st.enabled && (
                    <>
                      <input
                        type="text"
                        value={st.name}
                        onChange={(e) =>
                          setPortfolioStrategies((prev) =>
                            prev.map((p) =>
                              p.column === st.column ? { ...p, name: e.target.value } : p
                            )
                          )
                        }
                        placeholder="Display name"
                        className="w-full text-xs p-2 border border-[var(--border)] rounded bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                      />
                      <div className="flex justify-between text-[10px]">
                        <span className="text-[var(--text-secondary)]">Weight</span>
                        <span className="text-[var(--accent-blue)] font-mono">{(st.weight * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(st.weight * 100)}
                        onChange={(e) =>
                          setPortfolioStrategies((prev) =>
                            prev.map((p) =>
                              p.column === st.column
                                ? { ...p, weight: Number(e.target.value) / 100 }
                                : p
                            )
                          )
                        }
                        className="w-full accent-[#238636]"
                      />
                    </>
                  )}
                </div>
              ))}
              {portfolioStrategies.length >= 2 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={setEqualPortfolioWeights}
                    className="flex-1 text-[10px] py-1.5 border border-[var(--border)] rounded hover:bg-[var(--border)] text-[#c9d1d9]"
                  >
                    Equal weight
                  </button>
                  <button
                    type="button"
                    onClick={normalizePortfolioWeights}
                    className="flex-1 text-[10px] py-1.5 border border-[var(--border)] rounded hover:bg-[var(--border)] text-[#c9d1d9]"
                  >
                    Normalize
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-1">Trade PnL Column</label>
              <select
                value={pnlCol}
                onChange={(e) => setPnlCol(e.target.value)}
                className="w-full text-sm p-2 outline-none border border-[var(--border)] rounded bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:border-[var(--accent-blue)] transition-colors"
              >
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#c9d1d9] mb-1">Row Frequency</label>
            <select
              value={rowFrequency}
              onChange={(e) => setRowFrequency(e.target.value as 'trade' | 'day')}
              className="w-full text-sm p-2 outline-none border border-[var(--border)] rounded bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:border-[var(--accent-blue)] transition-colors"
            >
              <option value="trade">Per trade (annualize by min(252, N))</option>
              <option value="day">Per trading day (252 periods/year)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#c9d1d9] mb-1">Data Format</label>
            <select
              value={dataFormat}
              onChange={(e) => setDataFormat(e.target.value as 'pct' | 'mult' | 'absolute')}
              className="w-full text-sm p-2 outline-none border border-[var(--border)] rounded bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:border-[var(--accent-blue)] transition-colors"
            >
              <option value="absolute">Absolute PnL (e.g. $150 or -$20)</option>
              <option value="pct">Percentage Returns (e.g. 1.5 for 1.5%)</option>
              <option value="mult">Decimal Returns (e.g. 0.015)</option>
            </select>
          </div>

          {activeTab !== 'portfolio' && (
            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-1">Regime Tag (Optional)</label>
              <select
                value={regimeCol}
                onChange={(e) => setRegimeCol(e.target.value)}
                className="w-full text-sm p-2 outline-none border border-[var(--border)] rounded bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:border-[var(--accent-blue)] transition-colors"
              >
                <option value="None">None (Default)</option>
                <option value="AUTO">Auto-Detect (Rolling Win-Rate)</option>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {regimeCol === 'AUTO' && (
                <div className="mt-3 p-3 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg space-y-3 animate-in fade-in">
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-[var(--text-secondary)]">Rolling Window (Trades)</span>
                      <span className="text-[var(--accent-blue)]">{autoRegimeWindow}</span>
                    </div>
                    <input
                      type="range" min="3" max="50" step="1"
                      value={autoRegimeWindow}
                      onChange={(e) => setAutoRegimeWindow(Number(e.target.value))}
                      className="w-full accent-[var(--accent-blue)]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-[var(--text-secondary)]">Threshold Percentile</span>
                      <span className="text-[var(--accent-blue)]">{autoRegimeThreshold}%</span>
                    </div>
                    <input
                      type="range" min="10" max="90" step="1"
                      value={autoRegimeThreshold}
                      onChange={(e) => setAutoRegimeThreshold(Number(e.target.value))}
                      className="w-full accent-[var(--accent-blue)]"
                    />
                    <p className="text-[9px] text-[var(--text-secondary)] mt-1 leading-tight">
                      Balances Clustered vs Dispersed ratio. Target 30-50% clustered.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab !== 'portfolio' && (
            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-1">Timestamp Column (Optional)</label>
              <select
                value={timestampCol}
                onChange={(e) => setTimestampCol(e.target.value)}
                className="w-full text-sm p-2 outline-none border border-[var(--border)] rounded bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:border-[var(--accent-blue)] transition-colors"
              >
                <option value="None">None</option>
                {columns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-tight">
                Enables calendar-aware analytics: daily Sharpe, worst day, day-of-week, daily-loss breach count.
              </p>
            </div>
          )}

          {activeTab !== 'portfolio' && (
            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-1">Benchmark Return Column (Optional)</label>
              <select
                value={benchmarkCol}
                onChange={(e) => setBenchmarkCol(e.target.value)}
                className="w-full text-sm p-2 outline-none border border-[var(--border)] rounded bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:border-[var(--accent-blue)] transition-colors"
              >
                <option value="None">None</option>
                {columns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {benchmarkCol !== 'None' && (
                <select
                  value={benchmarkFormat}
                  onChange={(e) => setBenchmarkFormat(e.target.value as 'pct' | 'mult')}
                  className="mt-2 w-full text-sm p-2 outline-none border border-[var(--border)] rounded bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:border-[var(--accent-blue)] transition-colors"
                >
                  <option value="pct">Percent (e.g. 1.5 means 1.5%)</option>
                  <option value="mult">Decimal (e.g. 0.015 means 1.5%)</option>
                </select>
              )}
              <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-tight">
                Enables alpha/beta, R², tracking error, information ratio, up/down capture with HC0 std errors.
              </p>
            </div>
          )}

          {activeTab !== 'portfolio' && (
            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-1">Factor Columns (Optional)</label>
              <input
                type="text"
                value={factorCols}
                onChange={(e) => setFactorCols(e.target.value)}
                placeholder="e.g. Mkt-RF, SMB, HML"
                className="w-full text-xs p-2 outline-none border border-[var(--border)] rounded bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:border-[var(--accent-blue)] transition-colors"
              />
              <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-tight">
                Comma-separated CSV column names. Adds a multi-factor regression panel (e.g. Fama-French 3-factor)
                with HC0 robust SEs. Uses the same pct/decimal format as benchmark.
              </p>
            </div>
          )}
        </div>

        <div className="divider-gradient" />

        {/* Simulation Settings */}
        <div className="space-y-4">
          <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold block">Sim Settings</h3>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#c9d1d9]">Simulations (N)</span>
              <span className="text-[var(--accent-blue)] font-mono">{nSimulations.toLocaleString()}</span>
            </div>
            <input
              type="range" min="1000" max="50000" step="1000"
              value={nSimulations}
              onChange={(e) => setNSimulations(Number(e.target.value))}
              className="w-full accent-[#238636]"
            />
          </div>

          {(activeTab === 'basic' || activeTab === 'portfolio') && (
            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-1">Sampling Method</label>
              <select
                value={samplingMode}
                onChange={(e) => setSamplingMode(e.target.value as SamplingMode)}
                className="w-full text-sm p-2 outline-none border border-[var(--border)] rounded bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:border-[var(--accent-blue)] transition-colors"
              >
                <option value="permutation">Permutation (drawdown / sequence risk)</option>
                <option value="bootstrap">Bootstrap (terminal PnL + drawdown)</option>
                <option value="block_bootstrap">Block Bootstrap (preserves volatility clustering)</option>
              </select>
              {activeTab === 'basic' && samplingMode === 'permutation' && (
                <p className="text-[10px] text-[#d29922] mt-1 leading-tight">
                  Permutation fixes total PnL under absolute $ — VaR/CVaR suppressed; use drawdown charts.
                </p>
              )}
              {activeTab === 'basic' && samplingMode === 'block_bootstrap' && (
                <p className="text-[10px] text-[var(--accent-blue)] mt-1 leading-tight">
                  Stationary block bootstrap preserves autocorrelation (volatility clustering). Block length auto-estimated from lag-1 autocorrelation.
                </p>
              )}
            </div>
          )}

          {activeTab === 'portfolio' && (
            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-1">Portfolio resampling</label>
              <select
                value={portfolioResampling}
                onChange={(e) =>
                  setPortfolioResampling(e.target.value as PortfolioResampling)
                }
                className="w-full text-sm p-2 outline-none border border-[var(--border)] rounded bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:border-[var(--accent-blue)] transition-colors"
              >
                <option value="gaussian_copula">Gaussian copula (correlated)</option>
                <option value="student_t_copula">Student-t copula (tail dependence)</option>
                <option value="dynamic_copula">Dynamic Copula (Regime-Switching)</option>
                <option value="independent">Independent sleeves</option>
              </select>
              {(portfolioResampling === 'student_t_copula' || portfolioResampling === 'dynamic_copula') && (
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-[var(--text-secondary)]">Copula df (tail heaviness)</span>
                    <span className="text-[var(--accent-blue)]">{copulaDf}</span>
                  </div>
                  <input
                    type="range" min="2" max="30" step="1"
                    value={copulaDf}
                    onChange={(e) => setCopulaDf(Number(e.target.value))}
                    className="w-full accent-[var(--accent-blue)]"
                  />
                  <p className="text-[9px] text-[var(--text-secondary)] mt-1 leading-tight">
                    Lower df → heavier tails → more synchronized crashes. df=5 is a common institutional default.
                  </p>
                </div>
              )}
              <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-tight">
                {portfolioResampling === 'student_t_copula'
                  ? 'Student-t copula captures tail dependence: strategies crash together during black swans.'
                  : portfolioResampling === 'dynamic_copula'
                    ? 'Dynamic copula builds unique correlation matrices per regime and simulates Markov transitions.'
                    : 'Copula bootstrap draws with replacement (terminal PnL varies). Permutation in single-strategy tabs only.'}
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs text-[#c9d1d9] mb-1">Commission / Trade ($)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={commissionPerTrade}
              onChange={(e) => setCommissionPerTrade(Number(e.target.value))}
              className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-3 py-2 font-mono text-sm text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none w-full"
            />
          </div>

          <div>
            <label className="block text-xs text-[#c9d1d9] mb-1">Slippage Model</label>
            <select
              value={slippageModel}
              onChange={(e) => setSlippageModel(e.target.value as SlippageModel)}
              className="w-full text-sm p-2 outline-none border border-[var(--border)] rounded bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:border-[var(--accent-blue)] transition-colors"
            >
              <option value="none">None</option>
              <option value="fixed">Fixed (commission only)</option>
              <option value="sqrt_impact">√-Impact (dynamic market impact)</option>
            </select>
            {slippageModel === 'sqrt_impact' && (
              <p className="text-[9px] text-[#d29922] mt-1 leading-tight">
                Slippage scales with √(position size) × volatility. Larger positions incur non-linear market impact.
              </p>
            )}
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#c9d1d9]">Position Size Multiplier</span>
              <span className="text-[var(--accent-blue)] font-mono">{positionSizeMultiplier.toFixed(2)}x</span>
            </div>
            <input
              type="range" min="0.1" max="3.0" step="0.1"
              value={positionSizeMultiplier}
              onChange={(e) => setPositionSizeMultiplier(Number(e.target.value))}
              className="w-full accent-[#238636]"
            />
            <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-tight">
              Scale trade PnL to test risk of ruin (e.g. 0.5x halves contract size)
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#c9d1d9]">Reproducible seed</label>
              <input
                type="checkbox"
                checked={useFixedSeed}
                onChange={() => setUseFixedSeed(!useFixedSeed)}
                className="accent-[#238636]"
              />
            </div>
            {useFixedSeed && (
              <input
                type="number"
                value={randomSeed}
                onChange={(e) => setRandomSeed(Number(e.target.value))}
                className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-3 py-2 font-mono text-sm text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none w-full"
              />
            )}
          </div>

          <div>
            <label className="block text-xs text-[#c9d1d9] mb-1">Starting Capital</label>
            <input
              type="number"
              value={startingCapital}
              onChange={(e) => setStartingCapital(Number(e.target.value))}
              className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-3 py-2 font-mono text-sm text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none w-full"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#c9d1d9]">Ruin Threshold</span>
              <span className="text-[var(--accent-blue)] font-mono">{ruinThreshold}%</span>
            </div>
            <input
              type="range" min="10" max="100" step="5"
              value={ruinThreshold}
              onChange={(e) => setRuinThreshold(Number(e.target.value))}
              className="w-full accent-[#238636]"
            />
          </div>
        </div>

        <div className="divider-gradient" />

        {/* Prop Firm Eval Settings — single-strategy modes only */}
        {activeTab !== 'portfolio' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold block">Prop Firm Rules</h3>
              <label className="flex items-center cursor-pointer">
                <div className="relative">
                  <input type="checkbox" className="sr-only" checked={propFirmRulesEnabled} onChange={() => setPropFirmRulesEnabled(!propFirmRulesEnabled)} />
                  <div className={cn('block w-8 h-4 rounded-full transition-colors', propFirmRulesEnabled ? 'bg-[#238636]' : 'bg-[var(--border)]')}></div>
                  <div className={cn('dot absolute left-1 top-1 bg-white w-2 h-2 rounded-full transition-transform', propFirmRulesEnabled && 'transform translate-x-4')}></div>
                </div>
              </label>
            </div>

            <div>
              <label className="block text-xs text-[#c9d1d9] mb-1">Firm Preset</label>
              <select
                value={propPreset}
                onChange={(e) => applyPropPreset(e.target.value)}
                className="w-full text-sm p-2 outline-none border border-[var(--border)] rounded bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:border-[var(--accent-blue)] transition-colors"
              >
                <option value="">Custom / manual</option>
                {PROP_FIRM_PRESETS.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>

            {propFirmRulesEnabled && (
              <div className="space-y-3 pt-1 animate-in fade-in duration-300">
                <div>
                  <label className="block text-xs text-[#c9d1d9] mb-1">Profit Target ($)</label>
                  <input
                    type="number"
                    value={propTarget}
                    onChange={(e) => setPropTarget(Number(e.target.value))}
                    className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-3 py-2 text-sm font-mono text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none w-full"
                  />
                  <div className="text-[10px] text-[var(--text-secondary)] mt-1 leading-tight">TopOneFutures default: $3,000</div>
                </div>
                <div>
                  <label className="block text-xs text-[#c9d1d9] mb-1">Max Trailing DD ($)</label>
                  <input
                    type="number"
                    placeholder="e.g. 1500"
                    value={propMaxDrawdown}
                    onChange={(e) => setPropMaxDrawdown(Number(e.target.value))}
                    className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-3 py-2 text-sm font-mono text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none w-full"
                  />
                  <div className="text-[10px] text-[var(--text-secondary)] mt-1 leading-tight">Enter as absolute dollar amount. TopOneFutures default: $1,500</div>
                  {propMaxDrawdown > startingCapital && (
                    <div className="text-[10px] text-[var(--accent-red)] mt-1 leading-tight flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      DD limit exceeds starting capital — check your values
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#c9d1d9]">Consistency Rule</span>
                    <span className="text-[var(--accent-blue)] font-mono">{propConsistencyPercent}%</span>
                  </div>
                  <input
                    type="range" min="10" max="100" step="5"
                    value={propConsistencyPercent}
                    onChange={(e) => setPropConsistencyPercent(Number(e.target.value))}
                    className="w-full accent-[#238636]"
                  />
                  <div className="text-[10px] text-[var(--text-secondary)] mt-1 leading-tight">No single trade can exceed {propConsistencyPercent}% of total profit</div>
                </div>

                <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold block">Daily Loss Limit</h4>
                    <label className="flex items-center cursor-pointer">
                      <div className="relative">
                        <input type="checkbox" className="sr-only" checked={dailyLossLimitEnabled} onChange={() => setDailyLossLimitEnabled(!dailyLossLimitEnabled)} />
                        <div className={cn('block w-6 h-3 rounded-full transition-colors', dailyLossLimitEnabled ? 'bg-[#238636]' : 'bg-[var(--border)]')}></div>
                        <div className={cn('dot absolute left-1 top-0.5 bg-white w-2 h-2 rounded-full transition-transform', dailyLossLimitEnabled && 'transform translate-x-3')}></div>
                      </div>
                    </label>
                  </div>
                  {dailyLossLimitEnabled && (
                    <div className="space-y-3 animate-in fade-in duration-300">
                      <div>
                        <label className="block text-xs text-[#c9d1d9] mb-1">Max Losses Per Session</label>
                        <input
                          type="number"
                          value={dailyMaxLosses}
                          onChange={(e) => setDailyMaxLosses(Number(e.target.value))}
                          className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-3 py-2 text-sm font-mono text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#c9d1d9] mb-1">Max Daily Loss ($)</label>
                        <input
                          type="number"
                          value={dailyMaxLossDollars}
                          onChange={(e) => setDailyMaxLossDollars(Number(e.target.value))}
                          className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-3 py-2 text-sm font-mono text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none w-full"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#c9d1d9]">Trades Per Session</span>
                          <span className="text-[var(--accent-blue)] font-mono">{tradesPerSession}</span>
                        </div>
                        <input
                          type="range" min="1" max="10" step="1"
                          value={tradesPerSession}
                          onChange={(e) => setTradesPerSession(Number(e.target.value))}
                          className="w-full accent-[#238636]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg flex items-start text-[var(--accent-red)] text-sm mt-4">
            <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="pt-4 pb-4 space-y-2">
          <button
            onClick={handleRun}
            disabled={
              isLoading ||
              !csvData.length ||
              (activeTab === 'portfolio' && enabledPortfolioCount < 2)
            }
            className={cn(
              'btn-press w-full bg-gradient-to-r from-[#238636] to-[#2ea043] hover:from-[#2ea043] hover:to-[var(--accent-green)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--text-primary)] py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#238636]/30 hover:shadow-[#238636]/50',
              isLoading && 'animate-pulse',
            )}
          >
            {isLoading ? (
              <span className="tabular">RUNNING... {progress}%</span>
            ) : (
              <span>RUN SIMULATIONS</span>
            )}
          </button>
          {isLoading && (
            <>
              <div className="w-full h-1 rounded-full overflow-hidden bg-[var(--bg-card)]">
                <div className="h-full progress-gradient rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <button
                onClick={handleCancel}
                className="w-full bg-transparent border border-[var(--border)] hover:bg-[var(--bg-card)] hover:border-[var(--accent-red)] text-[var(--text-primary)] py-2 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <X className="w-3 h-3" />
                CANCEL
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-[var(--border)]/30 flex items-center justify-between">
        <span className="text-[10px] font-mono text-[var(--text-secondary)] opacity-40">v4.0.0-INST</span>
        <span className={cn('text-[10px] font-mono flex items-center gap-1.5', isLoading ? 'text-[var(--accent-blue)]' : 'text-[var(--text-secondary)] opacity-40')}>
          <span className={cn('w-1.5 h-1.5 rounded-full', isLoading ? 'bg-[var(--accent-blue)] animate-live-pulse' : 'bg-[var(--accent-green)]')} />
          {isLoading ? 'SIMULATING' : 'READY'}
        </span>
      </div>
    </aside>
  );
}
