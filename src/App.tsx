import React, { useState, useRef, useMemo } from 'react';
import Papa from 'papaparse';
import { Upload, AlertTriangle, CheckCircle2, Download, X } from 'lucide-react';
import { previewHistoricalStats } from './simulationEngine';
import {
  DailyData,
  PortfolioResampling,
  PROP_FIRM_PRESETS,
  SamplingMode,
  SimulationResults,
  SlippageModel,
} from './types';
import { SpaghettiPlot, Histogram } from './components/Plots';
import { HistoricalStatsPanel } from './components/HistoricalStatsPanel';
import { InstitutionalMetricsPanel } from './components/InstitutionalMetricsPanel';
import { MethodologyPanel } from './components/MethodologyPanel';
import { PortfolioCorrelationMatrix, PortfolioStrategyBreakdown } from './components/PortfolioPanel';
import { PortfolioRegimePanel } from './components/PortfolioRegimePanel';
import { PositionSizingPanel } from './components/PositionSizingPanel';
import { ConvergencePanel } from './components/ConvergencePanel';
import { StressTestPanel } from './components/StressTestPanel';
import { ModelValidationPanel } from './components/ModelValidationPanel';
import { EVTPanel } from './components/EVTPanel';
import { AttributionPanel } from './components/AttributionPanel';
import { TimestampAnalyticsPanel } from './components/TimestampAnalyticsPanel';
import { WalkForwardPanel } from './components/WalkForwardPanel';
import { MultiFactorPanel } from './components/MultiFactorPanel';
import { RunHistoryPanel } from './components/RunHistoryPanel';
import { EmptyHero } from './components/EmptyHero';
import { hashSeries, recordRun } from './runHistory';
import SimWorker from './simulationWorker?worker';
import { exportToVectorPDF } from './reportGenerator';
import { ExportModal } from './components/ExportModal';
import { HiddenChartCapture } from './components/HiddenChartCapture';
import {
  findColumn,
  isNinjaTraderGrid,
  listInstrumentSleeves,
  NINJATRADER_NON_SLEEVE_COLUMNS,
} from './ninjaTraderImport';
import {
  assignPortfolioRegimeSegments,
  findInRegimeColumn,
} from './regimeSegmentation';
import { PERMUTATION_TERMINAL_WARNING } from './metricsValidity';

type PortfolioStrategyConfig = {
  column: string;
  name: string;
  weight: number;
  enabled: boolean;
  /** NinjaTrader: sleeve = all trades for this Instrument value */
  groupByInstrument?: boolean;
};

export default function App() {
  const [csvData, setCsvData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  
  // Mappings
  const [pnlCol, setPnlCol] = useState<string>('');
  const [regimeCol, setRegimeCol] = useState<string>('None');
  const [timestampCol, setTimestampCol] = useState<string>('None');
  const [benchmarkCol, setBenchmarkCol] = useState<string>('None');
  const [benchmarkFormat, setBenchmarkFormat] = useState<'pct' | 'mult'>('pct');
  /** Comma-separated factor column names (e.g. "Mkt-RF, SMB, HML") */
  const [factorCols, setFactorCols] = useState<string>('');
  const [dataFormat, setDataFormat] = useState<'pct' | 'mult' | 'absolute'>('absolute');
  const [rowFrequency, setRowFrequency] = useState<'trade' | 'day'>('trade');
  const [samplingMode, setSamplingMode] = useState<SamplingMode>('bootstrap');
  const [portfolioResampling, setPortfolioResampling] =
    useState<PortfolioResampling>('gaussian_copula');
  const [commissionPerTrade, setCommissionPerTrade] = useState(0);
  const [useFixedSeed, setUseFixedSeed] = useState(true);
  const [randomSeed, setRandomSeed] = useState(42);
  const [propPreset, setPropPreset] = useState('');

  // Position Sizing, Slippage & Auto Regime
  const [positionSizeMultiplier, setPositionSizeMultiplier] = useState(1.0);
  const [slippageModel, setSlippageModel] = useState<SlippageModel>('fixed');
  const [copulaDf, setCopulaDf] = useState(5);
  const [autoRegimeWindow, setAutoRegimeWindow] = useState(10);
  const [autoRegimeThreshold, setAutoRegimeThreshold] = useState(50);

  // Settings
  const [nSimulations, setNSimulations] = useState(10000);
  const [startingCapital, setStartingCapital] = useState(10000);
  const [ruinThreshold, setRuinThreshold] = useState(50);
  
  // Prop Firm Settings
  const [propFirmRulesEnabled, setPropFirmRulesEnabled] = useState(false);
  const [propTarget, setPropTarget] = useState(3000);
  const [propMaxDrawdown, setPropMaxDrawdown] = useState(1500);
  const [propConsistencyPercent, setPropConsistencyPercent] = useState(30);
  const [dailyLossLimitEnabled, setDailyLossLimitEnabled] = useState(false);
  const [dailyMaxLosses, setDailyMaxLosses] = useState(2);
  const [dailyMaxLossDollars, setDailyMaxLossDollars] = useState(500);
  const [tradesPerSession, setTradesPerSession] = useState(3);
  
  // State
  const [portfolioStrategies, setPortfolioStrategies] = useState<PortfolioStrategyConfig[]>([]);
  const [ninjaTraderMode, setNinjaTraderMode] = useState(false);
  const [ntProfitCol, setNtProfitCol] = useState('Profit');
  const [ntInstrumentCol, setNtInstrumentCol] = useState('Instrument');
  const [activeTab, setActiveTab] = useState<'basic' | 'regime' | 'parametric' | 'portfolio' | 'garch'>('basic');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultsHistory, setResultsHistory] = useState<Record<string, SimulationResults>>({});
  const results = resultsHistory[activeTab] || null;
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [error, setError] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  
  const workerRef = useRef<Worker | null>(null);

  const parseFinancialNumber = (val: unknown): number => {
    if (typeof val === 'number') return val;
    if (typeof val !== 'string') return NaN;
    let clean = val.replace(/[$,\s]/g, '');
    if (clean.startsWith('(') && clean.endsWith(')')) {
      clean = '-' + clean.slice(1, -1);
    }
    return Number(clean);
  };

  const previewStats = useMemo(() => {
    if (!csvData.length || !pnlCol) return null;
    try {
      const parsed: DailyData[] = csvData
        .filter((row) => {
          if (row[pnlCol] === null || row[pnlCol] === undefined || row[pnlCol] === '') return false;
          return !isNaN(parseFinancialNumber(row[pnlCol]));
        })
        .map((row) => {
          const benchRaw = benchmarkCol !== 'None' ? parseFinancialNumber(row[benchmarkCol]) : NaN;
          const benchmarkReturn =
            isFinite(benchRaw)
              ? benchmarkFormat === 'pct'
                ? benchRaw / 100
                : benchRaw
              : undefined;
          const factorNames = factorCols
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          let factorRow: number[] | undefined;
          if (factorNames.length > 0) {
            const vals = factorNames.map((n) => parseFinancialNumber(row[n]));
            if (vals.every((v) => isFinite(v))) {
              factorRow = benchmarkFormat === 'pct' ? vals.map((v) => v / 100) : vals;
            }
          }
          return {
            pnl: parseFinancialNumber(row[pnlCol]),
            regime: regimeCol !== 'None' ? String(row[regimeCol]) : undefined,
            timestamp: timestampCol !== 'None' && row[timestampCol] != null ? String(row[timestampCol]) : undefined,
            benchmarkReturn,
            factorRow,
          };
        });
      if (!parsed.length) return null;
      return previewHistoricalStats(
        parsed,
        dataFormat,
        startingCapital,
        commissionPerTrade,
        rowFrequency
      );
    } catch {
      return null;
    }
  }, [csvData, pnlCol, regimeCol, dataFormat, startingCapital, commissionPerTrade, rowFrequency, timestampCol, benchmarkCol, benchmarkFormat, factorCols]);

  const applyPropPreset = (name: string) => {
    setPropPreset(name);
    const preset = PROP_FIRM_PRESETS.find((p) => p.name === name);
    if (!preset) return;
    setPropFirmRulesEnabled(true);
    setPropTarget(preset.target);
    setPropMaxDrawdown(preset.maxDrawdown);
    setPropConsistencyPercent(preset.consistencyPercent);
    if (preset.dailyLossLimit) {
      setDailyLossLimitEnabled(true);
      setDailyMaxLossDollars(preset.dailyLossLimit);
    }
  };

  // Memoize expensive 95th percentile computation to avoid sorting 50k items every render
  const p95MaxDrawdown = useMemo(() => {
    if (!results) return 0;
    const sorted = [...results.maxDrawdowns].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)] || 0;
  }, [results]);

  const detectNumericColumns = (data: Record<string, unknown>[], fields: string[]) => {
    return fields.filter((col) => {
      if (NINJATRADER_NON_SLEEVE_COLUMNS.has(col.trim().toLowerCase())) return false;
      const sample = data.slice(0, Math.min(50, data.length));
      if (!sample.length) return false;
      const numericCount = sample.filter(
        (row) => !isNaN(parseFinancialNumber(row[col]))
      ).length;
      return numericCount >= sample.length * 0.7;
    });
  };

  const applyNinjaTraderImport = (data: Record<string, unknown>[], fields: string[]) => {
    const profitCol = findColumn(fields, 'Profit') ?? 'Profit';
    const instrumentCol = findColumn(fields, 'Instrument') ?? 'Instrument';
    setNinjaTraderMode(true);
    setNtProfitCol(profitCol);
    setNtInstrumentCol(instrumentCol);
    setPnlCol(profitCol);
    setRegimeCol(instrumentCol);
    setDataFormat('absolute');
    setCommissionPerTrade(0);
    const sleeves = listInstrumentSleeves(data, instrumentCol, profitCol, parseFinancialNumber);
    setPortfolioStrategies(
      sleeves.map((s) => ({
        column: s.id,
        name: s.name,
        weight: s.weight,
        enabled: true,
        groupByInstrument: true,
      }))
    );
  };

  const initPortfolioFromColumns = (data: Record<string, unknown>[], fields: string[]) => {
    const numericCols = detectNumericColumns(data, fields);
    if (numericCols.length < 2) {
      setPortfolioStrategies([]);
      return;
    }
    const w = 1 / numericCols.length;
    setPortfolioStrategies(
      numericCols.map((col, i) => ({
        column: col,
        name: col,
        weight: w,
        enabled: numericCols.length <= 8 || i < 4,
        groupByInstrument: false,
      }))
    );
  };

  const enabledPortfolioCount = portfolioStrategies.filter((s) => s.enabled).length;

  const normalizePortfolioWeights = () => {
    const enabled = portfolioStrategies.filter((s) => s.enabled);
    const sum = enabled.reduce((s, st) => s + st.weight, 0) || 1;
    setPortfolioStrategies((prev) =>
      prev.map((st) =>
        st.enabled ? { ...st, weight: st.weight / sum } : st
      )
    );
  };

  const setEqualPortfolioWeights = () => {
    const n = portfolioStrategies.filter((s) => s.enabled).length || 1;
    setPortfolioStrategies((prev) =>
      prev.map((st) => (st.enabled ? { ...st, weight: 1 / n } : st))
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          setCsvData(results.data);
          if (results.meta.fields) {
            const rows = results.data as Record<string, unknown>[];
            setColumns(results.meta.fields);
            if (isNinjaTraderGrid(results.meta.fields)) {
              applyNinjaTraderImport(rows, results.meta.fields);
            } else {
              setNinjaTraderMode(false);
              setPnlCol(results.meta.fields[0] || '');
              initPortfolioFromColumns(rows, results.meta.fields);
            }
            const profitForSeg = findColumn(results.meta.fields, 'Profit') ?? results.meta.fields[0];
            const inRegime = findInRegimeColumn(results.meta.fields);
            const segments = assignPortfolioRegimeSegments(
              rows,
              profitForSeg,
              parseFinancialNumber,
              inRegime
            );
            setCsvData(rows.map((row, i) => ({ ...row, __segment: segments[i] })));
          }
          setResultsHistory({});
          setError('');
        },
        error: (error) => {
          setError('Failed to parse CSV: ' + error.message);
        }
      });
    }
  };

  const handleCancel = () => {
    if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
    }
    setIsLoading(false);
    setProgress(0);
  };

  const handleRun = async () => {
    if (!csvData.length) {
      setError('Please upload a CSV file.');
      return;
    }
    if (activeTab === 'portfolio') {
      if (enabledPortfolioCount < 2) {
        setError('Portfolio mode requires at least 2 enabled strategy columns.');
        return;
      }
      if (dataFormat !== 'absolute') {
        setError('Portfolio mode currently requires Absolute PnL format per strategy column.');
        return;
      }
    } else if (!pnlCol) {
      setError('Please upload data and select PnL column.');
      return;
    }
    if (activeTab === 'regime' && (!regimeCol || regimeCol === 'None')) {
      setError('Regime-Switching requires a Regime Tag column.');
      return;
    }

    if (workerRef.current) {
        workerRef.current.terminate();
    }

    setIsLoading(true);
    setProgress(0);
    setError('');

    try {
      const worker = new SimWorker();
      workerRef.current = worker;

      worker.onmessage = (e) => {
          const msg = e.data;
          if (msg.type === 'progress') {
              setProgress(Math.round((msg.completed / msg.total) * 100));
          } else if (msg.type === 'result') {
              setResultsHistory(prev => ({ ...prev, [msg.data.modelType]: msg.data }));
              // Persist for audit / reproducibility (best-effort, non-blocking)
              const inputForHash =
                activeTab === 'portfolio'
                  ? csvData.flatMap((row) =>
                      portfolioStrategies
                        .filter((s) => s.enabled)
                        .map((s) => parseFinancialNumber(s.groupByInstrument ? row[ntProfitCol] : row[s.column]))
                        .filter((v) => !isNaN(v))
                    )
                  : csvData
                      .map((row) => parseFinancialNumber(row[pnlCol]))
                      .filter((v) => !isNaN(v));
              hashSeries(inputForHash)
                .then((digest) => recordRun(msg.data, digest))
                .catch(() => {});
              setIsLoading(false);
              worker.terminate();
          } else if (msg.type === 'error') {
              setError(msg.error);
              setIsLoading(false);
              worker.terminate();
          }
      };

      if (activeTab === 'portfolio') {
        const enabled = portfolioStrategies.filter((s) => s.enabled);
        const strategies = enabled.map((st) => {
          const data: DailyData[] = csvData
            .filter((row) => {
              if (st.groupByInstrument) {
                return String(row[ntInstrumentCol] ?? '').trim() === st.column;
              }
              const v = row[st.column];
              if (v === null || v === undefined || v === '') return false;
              return !isNaN(parseFinancialNumber(v));
            })
            .map((row) => ({
              pnl: parseFinancialNumber(
                st.groupByInstrument ? row[ntProfitCol] : row[st.column]
              ),
              segment: row.__segment != null ? String(row.__segment) : undefined,
            }))
            .filter((d) => !isNaN(d.pnl));
          if (!data.length) {
            throw new Error(`No valid trades in column "${st.column}".`);
          }
          return { id: st.column, name: st.name, weight: st.weight, data };
        });

        const horizon = Math.max(...strategies.map(s => s.data.length));

        worker.postMessage({
          nSimulations,
          nTrades: horizon,
          startingCapital,
          ruinThreshold,
          modelType: 'portfolio',
          strategies,
          dataFormat,
          commissionPerTrade,
          randomSeed: useFixedSeed ? randomSeed : null,
          samplingMode,
          portfolioResampling,
          portfolioAlignedRows: !enabled.some((s) => s.groupByInstrument),
          enablePortfolioRegimeBreakdown: true,
          rowFrequency,
          periodsPerYear: rowFrequency === 'day' ? 252 : Math.min(252, horizon),
          propFirmRulesEnabled: false,
          propTarget: 0,
          propMaxDrawdown: 0,
          propConsistencyPercent: 0,
          dailyLossLimitEnabled: false,
          dailyMaxLosses: 0,
          dailyMaxLossDollars: 0,
          tradesPerSession: 1,
          positionSizeMultiplier,
          slippageModel,
          impactCoefficient: 0.1,
          copulaDf,
        });
      } else {
        const parsedData: DailyData[] = csvData
          .filter((row) => {
            if (row[pnlCol] === null || row[pnlCol] === undefined || row[pnlCol] === '') return false;
            return !isNaN(parseFinancialNumber(row[pnlCol]));
          })
          .map((row) => {
            const benchRaw = benchmarkCol !== 'None' ? parseFinancialNumber(row[benchmarkCol]) : NaN;
            const benchmarkReturn =
              isFinite(benchRaw)
                ? benchmarkFormat === 'pct'
                  ? benchRaw / 100
                  : benchRaw
                : undefined;
            const factorNames = factorCols
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            let factorRow: number[] | undefined;
            if (factorNames.length > 0) {
              const vals = factorNames.map((n) => parseFinancialNumber(row[n]));
              if (vals.every((v) => isFinite(v))) {
                factorRow = benchmarkFormat === 'pct' ? vals.map((v) => v / 100) : vals;
              }
            }
            return {
              pnl: parseFinancialNumber(row[pnlCol]),
              regime: regimeCol !== 'None' ? String(row[regimeCol]) : undefined,
              timestamp:
                timestampCol !== 'None' && row[timestampCol] != null
                  ? String(row[timestampCol])
                  : undefined,
              benchmarkReturn,
              factorRow,
            };
          });

        if (parsedData.length === 0) {
          throw new Error('No valid numeric data found in the selected column.');
        }

        worker.postMessage({
          nSimulations,
          nTrades: parsedData.length,
          startingCapital,
          ruinThreshold,
          modelType: activeTab,
          data: parsedData,
          dataFormat,
          commissionPerTrade,
          randomSeed: useFixedSeed ? randomSeed : null,
          samplingMode: activeTab === 'basic' || activeTab === 'portfolio' ? samplingMode : 'bootstrap',
          rowFrequency,
          periodsPerYear: rowFrequency === 'day' ? 252 : Math.min(252, parsedData.length),
          propFirmRulesEnabled,
          propTarget,
          propMaxDrawdown,
          propConsistencyPercent,
          dailyLossLimitEnabled,
          dailyMaxLosses,
          dailyMaxLossDollars,
          tradesPerSession,
          computePositionSizing: activeTab === 'parametric',
          positionSizeMultiplier,
          regimeSource: regimeCol,
          autoRegimeWindow,
          autoRegimeThreshold,
          slippageModel,
          impactCoefficient: 0.1,
          copulaDf,
          factorNames: factorCols
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
        });
      }

    } catch (err: any) {
      setError(err.message || 'Error running simulation');
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!results) return;
    
    const dataToExport = [];
    for (let i = 0; i < results.finalBalances.length; i++) {
        dataToExport.push({
            'Simulation Path': i + 1,
            'Final Balance': results.finalBalances[i],
            'Max Drawdown': results.maxDrawdowns[i],
            'Terminal PnL': results.finalBalances[i] - startingCapital,
        });
    }

    const metaRows = [
      { Field: 'run_id', Value: results.runMeta.runId },
      { Field: 'timestamp', Value: results.runMeta.timestamp },
      { Field: 'model', Value: results.runMeta.modelType },
      { Field: 'sampling', Value: results.runMeta.samplingMode },
      {
        Field: 'portfolio_resampling',
        Value: results.portfolioMeta?.resampling ?? '',
      },
      { Field: 'seed', Value: String(results.runMeta.randomSeed ?? '') },
      { Field: 'n_simulations', Value: String(results.runMeta.nSimulations) },
      {
        Field: 'terminal_pnl_metrics_valid',
        Value: String(results.metricsValidity.terminalPnL),
      },
      {
        Field: 'var_95',
        Value: results.metricsValidity.terminalPnL
          ? String(results.institutionalMetrics.var95)
          : 'N/A',
      },
      {
        Field: 'cvar_95',
        Value: results.metricsValidity.terminalPnL
          ? String(results.institutionalMetrics.cvar95)
          : 'N/A',
      },
      { Field: 'ruin_probability_pct', Value: String(results.ruinProbability) },
    ];

    if (results.positionSizing) {
      metaRows.push(
        { Field: 'position_scale_recommended', Value: String(results.positionSizing.recommendedScale) },
        { Field: 'position_scale_ruin_pct', Value: String(results.positionSizing.projectedAtRecommended.ruinProbability) },
        { Field: 'position_scale_cvar_95', Value: String(results.positionSizing.projectedAtRecommended.cvar95) }
      );
    }

    if (results.portfolioMeta?.regimeBreakdown?.length) {
      metaRows.push({ Field: 'regime_breakdown', Value: 'see below' });
    }

    let csv =
      '# Run metadata\n' +
      Papa.unparse(metaRows) +
      '\n\n# Simulation paths\n' +
      Papa.unparse(dataToExport);

    if (results.portfolioMeta?.regimeBreakdown?.length) {
      csv +=
        '\n\n# Portfolio regime breakdown\n' +
        Papa.unparse(
          results.portfolioMeta.regimeBreakdown.map((r) => ({
            regime: r.label,
            segment_id: r.segmentId,
            trades: r.tradeCount,
            mean_pnl: r.meanPnL,
            win_rate_pct: r.winRate,
            var_95: r.var95,
            cvar_95: r.cvar95,
            ruin_pct: r.ruinProbability,
          }))
        );
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `monte_carlo_results_${activeTab}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    setIsExportModalOpen(true);
  };

  const handleGeneratePdf = async (selectedModels: string[]) => {
    setIsExportingPdf(true);
    try {
      await exportToVectorPDF(
        selectedModels,
        resultsHistory,
        'Institutional_Report.pdf',
        dailyLossLimitEnabled ? dailyMaxLossDollars : undefined
      );
      setIsExportModalOpen(false);
    } catch (err) {
      console.error(err);
      setError('Failed to generate PDF. Check console for details.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const currentSettingsCount = enabledPortfolioCount;

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className={`w-[280px] bg-[var(--bg-secondary)] border-r flex flex-col p-5 overflow-y-auto shrink-0 z-10 custom-scrollbar transition-all duration-500 ${isLoading ? 'border-[var(--accent-blue)]/50 shadow-[var(--glow-blue)]' : 'border-[var(--border)]'}`}>
        <div className="flex items-center gap-3 mb-8 mt-2">
          <div className="brand-mark w-8 h-8 bg-gradient-to-br from-[var(--accent-green)] to-[#238636] rounded-lg flex items-center justify-center font-bold text-white text-xs shadow-lg">MC</div>
          <h1 className="text-lg font-semibold tracking-tight gradient-text">MC Risk Desk</h1>
          <button
            type="button"
            onClick={() => setIsHistoryOpen(true)}
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
            <label className="text-[10px] uppercase tracking-wider text-[#8b949e] font-bold mb-2 block">Data Input</label>
            <label className="file-drop border-2 border-dashed border-[#30363d] rounded-lg p-4 text-center cursor-pointer flex flex-col items-center justify-center w-full">
              <Upload className="w-4 h-4 text-[#8b949e] mb-1" />
              <span className="text-xs text-[#8b949e]">Drop CSV or Excel here</span>
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
            {csvData.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-[#238636] font-medium flex items-center justify-center">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Loaded {csvData.length} records
                </p>
                {ninjaTraderMode && (
                  <p className="text-[10px] text-[#58a6ff] text-center leading-tight">
                    NinjaTrader export detected — PnL: Profit · Portfolio sleeves: Instrument
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="divider-gradient" />

          {/* Column Mapping */}
          <div className="space-y-4">
            <h3 className="text-[10px] uppercase tracking-wider text-[#8b949e] font-bold block">
              {activeTab === 'portfolio' ? 'Portfolio Sleeves' : 'Column Mapping'}
            </h3>

            {activeTab === 'portfolio' ? (
              <div className="space-y-3">
                {portfolioStrategies.length < 2 && (
                  <p className="text-[10px] text-[#f85149]">
                    {ninjaTraderMode
                      ? 'Need 2+ instruments in the file (e.g. MNQ, NQ, MGC).'
                      : 'Upload a CSV with 2+ numeric PnL columns (one per strategy), aligned by row.'}
                  </p>
                )}
                {ninjaTraderMode && portfolioStrategies.length >= 2 && (
                  <p className="text-[10px] text-[#8b949e] leading-tight">
                    Sleeves group trades by Instrument. Horizon uses the shortest sleeve.
                  </p>
                )}
                {portfolioStrategies.map((st) => (
                  <div key={st.column} className="border border-[#30363d] rounded-lg p-3 space-y-2">
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
                      <span className="text-xs font-medium text-white truncate">
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
                          className="w-full text-xs p-2 border border-[#30363d] rounded bg-[#161b22] text-white"
                        />
                        <div className="flex justify-between text-[10px]">
                          <span className="text-[#8b949e]">Weight</span>
                          <span className="text-[#58a6ff] font-mono">{(st.weight * 100).toFixed(0)}%</span>
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
                      className="flex-1 text-[10px] py-1.5 border border-[#30363d] rounded hover:bg-[#30363d] text-[#c9d1d9]"
                    >
                      Equal weight
                    </button>
                    <button
                      type="button"
                      onClick={normalizePortfolioWeights}
                      className="flex-1 text-[10px] py-1.5 border border-[#30363d] rounded hover:bg-[#30363d] text-[#c9d1d9]"
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
                className="w-full text-sm p-2 outline-none border border-[#30363d] rounded bg-[#161b22] text-white focus:border-[#58a6ff] transition-colors"
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
                className="w-full text-sm p-2 outline-none border border-[#30363d] rounded bg-[#161b22] text-white focus:border-[#58a6ff] transition-colors"
              >
                <option value="trade">Per trade (annualize by min(252, N))</option>
                <option value="day">Per trading day (252 periods/year)</option>
              </select>
            </div>

            <div>
               <label className="block text-xs font-medium text-[#c9d1d9] mb-1">Data Format</label>
               <select value={dataFormat} onChange={(e) => setDataFormat(e.target.value as any)} className="w-full text-sm p-2 outline-none border border-[#30363d] rounded bg-[#161b22] text-white focus:border-[#58a6ff] transition-colors">
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
                className="w-full text-sm p-2 outline-none border border-[#30363d] rounded bg-[#161b22] text-white focus:border-[#58a6ff] transition-colors"
              >
                <option value="None">None (Default)</option>
                <option value="AUTO">Auto-Detect (Rolling Win-Rate)</option>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>{regimeCol === 'AUTO' && (
                <div className="mt-3 p-3 bg-[#161b22] border border-[#30363d] rounded-lg space-y-3 animate-in fade-in">
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-[#8b949e]">Rolling Window (Trades)</span>
                      <span className="text-[#58a6ff]">{autoRegimeWindow}</span>
                    </div>
                    <input 
                      type="range" min="3" max="50" step="1"
                      value={autoRegimeWindow}
                      onChange={(e) => setAutoRegimeWindow(Number(e.target.value))}
                      className="w-full accent-[#58a6ff]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-[#8b949e]">Threshold Percentile</span>
                      <span className="text-[#58a6ff]">{autoRegimeThreshold}%</span>
                    </div>
                    <input 
                      type="range" min="10" max="90" step="1"
                      value={autoRegimeThreshold}
                      onChange={(e) => setAutoRegimeThreshold(Number(e.target.value))}
                      className="w-full accent-[#58a6ff]"
                    />
                    <p className="text-[9px] text-[#8b949e] mt-1 leading-tight">
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
                  className="w-full text-sm p-2 outline-none border border-[#30363d] rounded bg-[#161b22] text-white focus:border-[#58a6ff] transition-colors"
                >
                  <option value="None">None</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <p className="text-[10px] text-[#8b949e] mt-1 leading-tight">
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
                  className="w-full text-sm p-2 outline-none border border-[#30363d] rounded bg-[#161b22] text-white focus:border-[#58a6ff] transition-colors"
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
                    className="mt-2 w-full text-sm p-2 outline-none border border-[#30363d] rounded bg-[#161b22] text-white focus:border-[#58a6ff] transition-colors"
                  >
                    <option value="pct">Percent (e.g. 1.5 means 1.5%)</option>
                    <option value="mult">Decimal (e.g. 0.015 means 1.5%)</option>
                  </select>
                )}
                <p className="text-[10px] text-[#8b949e] mt-1 leading-tight">
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
                  className="w-full text-xs p-2 outline-none border border-[#30363d] rounded bg-[#161b22] text-white focus:border-[#58a6ff] transition-colors"
                />
                <p className="text-[10px] text-[#8b949e] mt-1 leading-tight">
                  Comma-separated CSV column names. Adds a multi-factor regression panel (e.g. Fama-French 3-factor)
                  with HC0 robust SEs. Uses the same pct/decimal format as benchmark.
                </p>
              </div>
            )}
          </div>

          <div className="divider-gradient" />

          {/* Simulation Settings */}
          <div className="space-y-4">
            <h3 className="text-[10px] uppercase tracking-wider text-[#8b949e] font-bold block">Sim Settings</h3>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#c9d1d9]">Simulations (N)</span>
                <span className="text-[#58a6ff] font-mono">{nSimulations.toLocaleString()}</span>
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
                  className="w-full text-sm p-2 outline-none border border-[#30363d] rounded bg-[#161b22] text-white focus:border-[#58a6ff] transition-colors"
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
                  <p className="text-[10px] text-[#58a6ff] mt-1 leading-tight">
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
                  className="w-full text-sm p-2 outline-none border border-[#30363d] rounded bg-[#161b22] text-white focus:border-[#58a6ff] transition-colors"
                >
                  <option value="gaussian_copula">Gaussian copula (correlated)</option>
                  <option value="student_t_copula">Student-t copula (tail dependence)</option>
                  <option value="dynamic_copula">Dynamic Copula (Regime-Switching)</option>
                  <option value="independent">Independent sleeves</option>
                </select>
                {(portfolioResampling === 'student_t_copula' || portfolioResampling === 'dynamic_copula') && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-[#8b949e]">Copula df (tail heaviness)</span>
                      <span className="text-[#58a6ff]">{copulaDf}</span>
                    </div>
                    <input 
                      type="range" min="2" max="30" step="1"
                      value={copulaDf}
                      onChange={(e) => setCopulaDf(Number(e.target.value))}
                      className="w-full accent-[#58a6ff]"
                    />
                    <p className="text-[9px] text-[#8b949e] mt-1 leading-tight">
                      Lower df → heavier tails → more synchronized crashes. df=5 is a common institutional default.
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-[#8b949e] mt-1 leading-tight">
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
                className="bg-[#161b22] border border-[#30363d] rounded px-3 py-2 font-mono text-sm text-white focus:border-[#58a6ff] outline-none w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-[#c9d1d9] mb-1">Slippage Model</label>
              <select
                value={slippageModel}
                onChange={(e) => setSlippageModel(e.target.value as SlippageModel)}
                className="w-full text-sm p-2 outline-none border border-[#30363d] rounded bg-[#161b22] text-white focus:border-[#58a6ff] transition-colors"
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
                <span className="text-[#58a6ff] font-mono">{positionSizeMultiplier.toFixed(2)}x</span>
              </div>
              <input 
                type="range" min="0.1" max="3.0" step="0.1"
                value={positionSizeMultiplier}
                onChange={(e) => setPositionSizeMultiplier(Number(e.target.value))}
                className="w-full accent-[#238636]"
              />
              <p className="text-[10px] text-[#8b949e] mt-1 leading-tight">
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
                  className="bg-[#161b22] border border-[#30363d] rounded px-3 py-2 font-mono text-sm text-white focus:border-[#58a6ff] outline-none w-full"
                />
              )}
            </div>

            <div>
              <label className="block text-xs text-[#c9d1d9] mb-1">Starting Capital</label>
              <input 
                type="number"
                value={startingCapital}
                onChange={(e) => setStartingCapital(Number(e.target.value))}
                className="bg-[#161b22] border border-[#30363d] rounded px-3 py-2 font-mono text-sm text-white focus:border-[#58a6ff] outline-none w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#c9d1d9]">Ruin Threshold</span>
                <span className="text-[#58a6ff] font-mono">{ruinThreshold}%</span>
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
              <h3 className="text-[10px] uppercase tracking-wider text-[#8b949e] font-bold block">Prop Firm Rules</h3>
              <label className="flex items-center cursor-pointer">
                <div className="relative">
                  <input type="checkbox" className="sr-only" checked={propFirmRulesEnabled} onChange={() => setPropFirmRulesEnabled(!propFirmRulesEnabled)} />
                  <div className={`block w-8 h-4 rounded-full transition-colors ${propFirmRulesEnabled ? 'bg-[#238636]' : 'bg-[#30363d]'}`}></div>
                  <div className={`dot absolute left-1 top-1 bg-white w-2 h-2 rounded-full transition-transform ${propFirmRulesEnabled ? 'transform translate-x-4' : ''}`}></div>
                </div>
              </label>
            </div>

            <div>
              <label className="block text-xs text-[#c9d1d9] mb-1">Firm Preset</label>
              <select
                value={propPreset}
                onChange={(e) => applyPropPreset(e.target.value)}
                className="w-full text-sm p-2 outline-none border border-[#30363d] rounded bg-[#161b22] text-white focus:border-[#58a6ff] transition-colors"
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
                    className="bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-sm font-mono text-white focus:border-[#58a6ff] outline-none w-full"
                  />
                  <div className="text-[10px] text-[#8b949e] mt-1 leading-tight">TopOneFutures default: $3,000</div>
                </div>
                <div>
                  <label className="block text-xs text-[#c9d1d9] mb-1">Max Trailing DD ($)</label>
                  <input 
                    type="number"
                    placeholder="e.g. 1500"
                    value={propMaxDrawdown}
                    onChange={(e) => setPropMaxDrawdown(Number(e.target.value))}
                    className="bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-sm font-mono text-white focus:border-[#58a6ff] outline-none w-full"
                  />
                  <div className="text-[10px] text-[#8b949e] mt-1 leading-tight">Enter as absolute dollar amount. TopOneFutures default: $1,500</div>
                  {propMaxDrawdown > startingCapital && (
                      <div className="text-[10px] text-[#f85149] mt-1 leading-tight flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          DD limit exceeds starting capital — check your values
                      </div>
                  )}
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#c9d1d9]">Consistency Rule</span>
                    <span className="text-[#58a6ff] font-mono">{propConsistencyPercent}%</span>
                  </div>
                  <input 
                    type="range" min="10" max="100" step="5"
                    value={propConsistencyPercent}
                    onChange={(e) => setPropConsistencyPercent(Number(e.target.value))}
                    className="w-full accent-[#238636]"
                  />
                  <div className="text-[10px] text-[#8b949e] mt-1 leading-tight">No single trade can exceed {propConsistencyPercent}% of total profit</div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-[#30363d] space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] uppercase tracking-wider text-[#8b949e] font-bold block">Daily Loss Limit</h4>
                    <label className="flex items-center cursor-pointer">
                      <div className="relative">
                        <input type="checkbox" className="sr-only" checked={dailyLossLimitEnabled} onChange={() => setDailyLossLimitEnabled(!dailyLossLimitEnabled)} />
                        <div className={`block w-6 h-3 rounded-full transition-colors ${dailyLossLimitEnabled ? 'bg-[#238636]' : 'bg-[#30363d]'}`}></div>
                        <div className={`dot absolute left-1 top-0.5 bg-white w-2 h-2 rounded-full transition-transform ${dailyLossLimitEnabled ? 'transform translate-x-3' : ''}`}></div>
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
                          className="bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-sm font-mono text-white focus:border-[#58a6ff] outline-none w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#c9d1d9] mb-1">Max Daily Loss ($)</label>
                        <input 
                          type="number"
                          value={dailyMaxLossDollars}
                          onChange={(e) => setDailyMaxLossDollars(Number(e.target.value))}
                          className="bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-sm font-mono text-white focus:border-[#58a6ff] outline-none w-full"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#c9d1d9]">Trades Per Session</span>
                          <span className="text-[#58a6ff] font-mono">{tradesPerSession}</span>
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
            <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg flex items-start text-[#f85149] text-sm mt-4">
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
              className={`btn-press w-full bg-gradient-to-r from-[#238636] to-[#2ea043] hover:from-[#2ea043] hover:to-[#3fb950] disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#238636]/30 hover:shadow-[#238636]/50 ${isLoading ? 'animate-pulse' : ''}`}
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
                  <div className="h-full progress-gradient rounded-full transition-all duration-300" style={{width: `${progress}%`}} />
                </div>
                <button
                  onClick={handleCancel}
                  className="w-full bg-transparent border border-[var(--border)] hover:bg-[var(--bg-card)] hover:border-[var(--accent-red)] text-white py-2 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
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
          <span className={`text-[10px] font-mono flex items-center gap-1.5 ${isLoading ? 'text-[var(--accent-blue)]' : 'text-[var(--text-secondary)] opacity-40'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-[var(--accent-blue)] animate-live-pulse' : 'bg-[var(--accent-green)]'}`} />
            {isLoading ? 'SIMULATING' : 'READY'}
          </span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#010409]">
        <header className="px-8 mt-6">
           {/* Model Selector Tabs */}
           <div className="flex justify-between items-end border-b border-[#30363d] w-full pb-0">
             <div className="tab-row pb-3">
              {(
                [
                  ['basic', 'Trade Sequence MC'],
                  ['regime', 'Regime-Switching'],
                  ['parametric', 'Parametric (Student-t)'],
                  ['portfolio', 'Multi-Strategy Portfolio'],
                  ['garch', 'GARCH(1,1)'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key as typeof activeTab)}
                  data-active={activeTab === key}
                  className="tab-btn"
                >
                  {label}
                </button>
              ))}
             </div>
             {results && (
               <div className="flex flex-col gap-2">
                 <button 
                    onClick={handleExportPdf}
                    disabled={isExportingPdf}
                    className="flex items-center gap-2 text-xs font-semibold text-[#8b949e] hover:text-[#c9d1d9] pb-1 transition-colors disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    {isExportingPdf ? 'Generating PDF...' : 'Export PDF Report'}
                 </button>
                 <button 
                    onClick={handleDownload}
                    className="flex items-center gap-2 text-xs font-semibold text-[#8b949e] hover:text-[#c9d1d9] pb-3 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Export Results (CSV)
                 </button>
               </div>
             )}
           </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar results-backdrop">
          {!results && !isLoading ? (
            <EmptyHero hasFile={csvData.length > 0} isPortfolio={activeTab === 'portfolio'} />
          ) : results ? (
            <div id="report-container" className="space-y-6">

              <MethodologyPanel
                modelType={results.modelType}
                samplingMode={results.runMeta.samplingMode}
                portfolioResampling={results.portfolioMeta?.resampling}
              />
              <InstitutionalMetricsPanel
                metrics={results.institutionalMetrics}
                runMeta={results.runMeta}
                metricsValidity={results.metricsValidity}
              />
              {results.positionSizing && (
                <PositionSizingPanel
                  recommendation={results.positionSizing}
                  startingCapital={startingCapital}
                />
              )}
              <HistoricalStatsPanel
                stats={results.historicalStats}
                title={results.modelType === 'portfolio' ? 'Combined Portfolio — Empirical Metrics' : undefined}
              />

              {results.distributionFit && (
                <div className="glass-card animate-fade-in-up overflow-hidden">
                  <div className="px-6 py-4 border-b border-[#30363d]/50 flex items-center gap-2">
                    <span className="badge badge-purple">MLE</span>
                    <span className="text-[10px] text-[var(--accent-purple)] uppercase font-bold tracking-wider">Distribution Fit</span>
                  </div>
                  <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">Best Fit</div>
                      <div className="text-lg metric-value animate-count-up gradient-text">
                        {results.distributionFit.type === 'student_t' ? `Student-t (df=${results.distributionFit.df?.toFixed(1)})` : 'Normal'}
                      </div>
                    </div>
                    <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">Location (μ)</div>
                      <div className="text-lg metric-value animate-count-up stagger-2 text-[var(--text-primary)]">${results.distributionFit.mu.toFixed(2)}</div>
                    </div>
                    <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">Scale (σ)</div>
                      <div className="text-lg metric-value animate-count-up stagger-3 text-[var(--text-primary)]">${results.distributionFit.sigma.toFixed(2)}</div>
                    </div>
                    <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">BIC</div>
                      <div className="text-lg metric-value animate-count-up stagger-4 text-[var(--text-primary)]">{results.distributionFit.bic.toFixed(1)}</div>
                    </div>
                  </div>
                </div>
              )}
              {results.portfolioMeta && (
                <>
                  <PortfolioStrategyBreakdown meta={results.portfolioMeta} />
                  <PortfolioCorrelationMatrix meta={results.portfolioMeta} />
                  {results.portfolioMeta.regimeBreakdown && (
                    <PortfolioRegimePanel breakdown={results.portfolioMeta.regimeBreakdown} />
                  )}
                </>
              )}

              {activeTab === 'basic' && samplingMode === 'permutation' && !results.metricsValidity.terminalPnL && (
                <div className="p-3 bg-[#d29922]/10 border border-[#d29922]/40 rounded-lg text-xs text-[#f2cc60] flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{PERMUTATION_TERMINAL_WARNING}</span>
                </div>
              )}
              
              {/* Top KPI Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {results.metricsValidity.terminalPnL && (
                  <>
                    <MetricCard 
                      title="Prob. of Ruin" 
                      value={`${results.ruinProbability.toFixed(1)}%`}
                      subtitle={`Threshold: ${ruinThreshold}% Capital`}
                      highlight={results.ruinProbability > 10 ? 'red' : 'green'}
                    />
                    <MetricCard 
                      title="Terminal Bal. EV" 
                      value={`$${Math.round(results.meanFinalBalance).toLocaleString()}`}
                      subtitle={`5th pct: $${Math.round(results.p5Balance).toLocaleString()} — 95th pct: $${Math.round(results.p95Balance).toLocaleString()}`}
                      highlight={results.p5Balance < startingCapital ? 'red' : 'blue'}
                    />
                  </>
                )}

                <MetricCard 
                  title="Simulated Max DD" 
                  value={`${(p95MaxDrawdown * 100).toFixed(1)}%`}
                  subtitle={`95th percentile risk`}
                  highlight={p95MaxDrawdown > results.originalMaxDrawdown * 1.5 ? 'red' : 'white'}
                />

                <MetricCard 
                  title="Historical Max DD" 
                  value={`${((results.originalMaxDrawdown || 0) * 100).toFixed(1)}%`}
                  subtitle={`Empirical Drawdown`}
                  highlight="green"
                />
              </div>
              
              {results.propEvalStats && (
                <div className="bg-[#0d1117] border border-[#30363d] rounded-2xl overflow-hidden relative">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363d] bg-transparent">
                    <span className="text-[10px] text-[#238636] uppercase font-bold tracking-wider flex items-center gap-2">
                       <CheckCircle2 className="w-4 h-4 text-[#238636]" />
                       Prop Firm Evaluation Results (N = {results.paths.length})
                    </span>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div>
                      <div className="text-[10px] text-[#8b949e] uppercase tracking-wider mb-2 font-semibold">Pass Rate</div>
                      <div className="text-3xl text-white font-light">{results.propEvalStats.passRate.toFixed(1)}<span className="text-lg text-[#8b949e]">%</span></div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#8b949e] uppercase tracking-wider mb-2 font-semibold">Failed: Max DD</div>
                      <div className="text-3xl text-[#f85149] font-light">{results.propEvalStats.failDrawdown.toFixed(1)}<span className="text-lg text-[#8b949e]">%</span></div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#8b949e] uppercase tracking-wider mb-2 font-semibold">Failed: Consistency</div>
                      <div className="text-3xl text-[#f2cc60] font-light">{results.propEvalStats.failConsistency.toFixed(1)}<span className="text-lg text-[#8b949e]">%</span></div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#8b949e] uppercase tracking-wider mb-2 font-semibold">Failed: Time/No Target</div>
                      <div className="text-3xl text-[#8b949e] font-light">{results.propEvalStats.failTime.toFixed(1)}<span className="text-lg text-[#8b949e]">%</span></div>
                    </div>
                    {results.propEvalStats.medianTradesToTarget > 0 && (
                      <div className="md:col-span-4 pt-2 border-t border-[#30363d]">
                        <div className="text-[10px] text-[#8b949e] uppercase tracking-wider mb-1 font-semibold">Median trades to pass (successful paths)</div>
                        <div className="text-xl text-[#3fb950] font-mono">{results.propEvalStats.medianTradesToTarget}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Spaghetti Plot */}
              <div className="bg-[#0d1117] border border-[#30363d] rounded-2xl flex flex-col overflow-hidden relative">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363d] bg-transparent">
                  <div className="flex gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-[#58a6ff] opacity-20 rounded-full"></div>
                      <span className="text-[10px] text-[#8b949e]">Simulated Paths</span>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <div className="w-3 h-0.5 bg-[#f2cc60]"></div>
                      <span className="text-[10px] text-[#8b949e]">Historical Curve</span>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <SpaghettiPlot results={results} />
                </div>
              </div>

              {/* Distributions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-12">
                <div className="bg-[#0d1117] border border-[#30363d] rounded-2xl p-6 relative">
                  <span className="text-[10px] text-[#8b949e] uppercase font-bold tracking-wider">Terminal Account Balance Distribution</span>
                  <div className="mt-4">
                    <Histogram 
                      data={results.finalBalances} 
                      color="#238636" 
                      formatter={(val) => `$${val.toFixed(0)}`}
                      referenceLine={results.originalPath[results.originalPath.length-1]}
                    />
                  </div>
                </div>

                <div className="bg-[#0d1117] border border-[#30363d] rounded-2xl p-6 relative">
                  <span className="text-[10px] text-[#8b949e] uppercase font-bold tracking-wider">Max Drawdown Distribution</span>
                  <div className="mt-4">
                    <Histogram 
                      data={results.maxDrawdowns} 
                      color="#f85149" 
                      formatter={(val) => `${(val * 100).toFixed(1)}%`}
                      referenceLine={results.originalMaxDrawdown}
                    />
                  </div>
                </div>
              </div>

              {/* GARCH Parameters Panel */}
              {results.garchFit && (
                <div className="glass-card animate-fade-in-up overflow-hidden">
                  <div className="px-6 py-4 border-b border-[#30363d]/50 flex items-center gap-2">
                    <span className="badge badge-amber">GARCH</span>
                    <span className="text-[10px] text-[var(--accent-amber)] uppercase font-bold tracking-wider">Fitted Parameters</span>
                  </div>
                  <div className="p-6 grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">\u03c9 (omega)</div>
                      <div className="text-lg metric-value animate-count-up text-[var(--text-primary)]">{results.garchFit.omega.toExponential(3)}</div>
                      <div className="text-[10px] text-[var(--text-secondary)] mt-1 opacity-60">Baseline variance</div>
                    </div>
                    <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">\u03b1 (alpha)</div>
                      <div className="text-lg metric-value animate-count-up stagger-2 text-[var(--text-primary)]">{results.garchFit.alpha.toFixed(4)}</div>
                      <div className="text-[10px] text-[var(--text-secondary)] mt-1 opacity-60">Shock sensitivity</div>
                    </div>
                    <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">\u03b2 (beta)</div>
                      <div className="text-lg metric-value animate-count-up stagger-3 text-[var(--text-primary)]">{results.garchFit.beta.toFixed(4)}</div>
                      <div className="text-[10px] text-[var(--text-secondary)] mt-1 opacity-60">Persistence</div>
                    </div>
                    <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">\u03b1+\u03b2</div>
                      <div className={`text-lg metric-value animate-count-up stagger-4 ${results.garchFit.persistence > 0.95 ? 'text-[var(--accent-red)]' : results.garchFit.persistence > 0.85 ? 'text-[var(--accent-amber)]' : 'text-[var(--accent-green)]'}`}>{results.garchFit.persistence.toFixed(4)}</div>
                      <div className="text-[10px] text-[var(--text-secondary)] mt-1 opacity-60">Vol persistence</div>
                    </div>
                    <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">BIC</div>
                      <div className="text-lg metric-value animate-count-up stagger-5 text-[var(--text-primary)]">{results.garchFit.bic.toFixed(1)}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Drawdown Duration Metrics */}
              {results.drawdownDuration && (
                <div className="glass-card animate-fade-in-up overflow-hidden">
                  <div className="px-6 py-4 border-b border-[#30363d]/50">
                    <span className="text-[10px] text-[var(--accent-blue)] uppercase font-bold tracking-wider">Drawdown Duration Analysis</span>
                  </div>
                  <div className="p-6 grid grid-cols-3 gap-6">
                    <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">Median Max Duration</div>
                      <div className="text-2xl metric-value animate-count-up text-[var(--text-primary)]">{results.drawdownDuration.medianMaxDuration} <span className="text-sm text-[var(--text-secondary)]">trades</span></div>
                    </div>
                    <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">95th Pctl Duration</div>
                      <div className={`text-2xl metric-value animate-count-up stagger-2 ${results.drawdownDuration.p95MaxDuration > 50 ? 'text-[var(--accent-red)]' : 'text-[var(--text-primary)]'}`}>{results.drawdownDuration.p95MaxDuration} <span className="text-sm text-[var(--text-secondary)]">trades</span></div>
                    </div>
                    <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">Avg % Time Underwater</div>
                      <div className={`text-2xl metric-value animate-count-up stagger-3 ${results.drawdownDuration.avgPctUnderwater > 0.5 ? 'text-[var(--accent-red)]' : results.drawdownDuration.avgPctUnderwater > 0.3 ? 'text-[var(--accent-amber)]' : 'text-[var(--accent-green)]'}`}>{(results.drawdownDuration.avgPctUnderwater * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Stress Testing */}
              {results.stressTest && (
                <StressTestPanel stressResult={results.stressTest} startingCapital={startingCapital} />
              )}

              {/* Convergence Diagnostics */}
              {results.convergence && (
                <ConvergencePanel convergence={results.convergence} />
              )}

              {/* Model Validation (SR 11-7) */}
              {results.modelValidation && (
                <ModelValidationPanel validation={results.modelValidation} />
              )}

              {/* EVT — heavy-tail loss analysis */}
              {results.evt && <EVTPanel evt={results.evt} />}

              {/* Walk-forward / out-of-sample validation */}
              {results.walkForward && <WalkForwardPanel report={results.walkForward} />}

              {/* Benchmark Attribution (only if benchmark column mapped) */}
              {results.attribution && (
                <AttributionPanel attribution={results.attribution} />
              )}

              {/* Multi-Factor Attribution (only if factor columns mapped) */}
              {results.multiFactor && <MultiFactorPanel report={results.multiFactor} />}

              {/* Calendar-aware analytics (only if timestamp column mapped) */}
              {results.timestampAnalytics && (
                <TimestampAnalyticsPanel
                  report={results.timestampAnalytics}
                  dailyLossLimit={dailyLossLimitEnabled ? dailyMaxLossDollars : undefined}
                />
              )}

            </div>
          ) : previewStats ? (
            <div className="max-w-4xl mx-auto space-y-4 animate-in fade-in duration-300">
              <HistoricalStatsPanel stats={previewStats} title="Upload Preview — Empirical Metrics" />
              <p className="text-sm text-[#8b949e] text-center">Run simulations to generate VaR, CVaR, and path distributions.</p>
            </div>
          ) : null}
        </div>
      </main>
      <ExportModal 
        isOpen={isExportModalOpen} 
        onClose={() => setIsExportModalOpen(false)}
        resultsHistory={resultsHistory}
        onExport={handleGeneratePdf}
        isExportingPdf={isExportingPdf}
      />
      <RunHistoryPanel open={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
      <HiddenChartCapture resultsHistory={resultsHistory} />
    </div>
  );
}

function MetricCard({ title, value, subtitle, highlight, suffix }: { title: string, value: string, subtitle: string, highlight: string, suffix?: string }) {
  const accentBorder =
    highlight === 'red' ? 'accent-left-red' :
    highlight === 'green' ? 'accent-left-green' :
    'accent-left-blue';

  const valueColor =
    highlight === 'red' ? 'text-[var(--accent-red)]' :
    highlight === 'green' ? 'text-[var(--accent-green)]' :
    'text-[var(--text-primary)]';

  return (
    <div className={`glass-card-hover animate-fade-in-up ${accentBorder} p-4 flex flex-col justify-between cursor-default`}>
      <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-1 tracking-widest">{title}</div>
      <div className={`text-3xl font-light py-1 metric-value animate-count-up ${valueColor}`}>
        {value}
        {suffix && <span className="text-[var(--text-secondary)] text-lg font-normal">{suffix}</span>}
      </div>
      <div className={`text-[10px] ${highlight === 'red' ? 'text-[var(--accent-red)]' : 'text-[var(--text-secondary)]'} mt-1`}>
        {subtitle}
      </div>
    </div>
  );
}

