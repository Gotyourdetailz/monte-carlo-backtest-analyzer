import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { previewHistoricalStats } from './simulationEngine';
import {
  DailyData,
  PortfolioResampling,
  PROP_FIRM_PRESETS,
  SamplingMode,
  SimulationResults,
  SlippageModel,
  SingleStrategyConfig,
  PortfolioConfig,
  StrategyAllocation,
} from './types';
import { HistoricalStatsPanel } from './components/HistoricalStatsPanel';
import { RunHistoryPanel } from './components/RunHistoryPanel';
import { EmptyHero } from './components/EmptyHero';
import { ResultsView } from './components/ResultsView';
import { Sidebar, type PortfolioStrategyConfig } from './components/Sidebar';
import { MainHeader, type ModelTab } from './components/MainHeader';
import { hashSeries, recordRun } from './runHistory';
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
  RegimeSegmentId,
} from './regimeSegmentation';
import { parseFinancialNumber, buildDailyData, buildPortfolioStrategySleeves, detectNumericColumns } from './csvIngest';
import { buildResultsCsvBlob, buildResultsCsvFilename } from './csvExport';
import { buildSingleRunRequest, buildPortfolioRunRequest } from './runDispatch';
import { useCsvIngest } from './hooks/useCsvIngest';
import { useSimulationRunner } from './hooks/useSimulationRunner';

/**
 * `App` — top-level orchestration.
 *
 * Decomposed per Requirement 10 (task 5.13). The presentational sidebar lives
 * in `src/components/Sidebar.tsx`; CSV parsing and the financial-string
 * coercion live in `src/csvIngest.ts`; the worker payload builders live in
 * `src/runDispatch.ts`; the worker lifecycle is owned by
 * `useSimulationRunner`; and the audit-CSV blob builder is in
 * `src/csvExport.ts`. This file holds the cross-cutting state, the single
 * canonical `parsedData: DailyData[]` memo (Requirement 10.9), and the JSX
 * that stitches the result panels into the main column.
 *
 * NOTE: `useSimulationRunner` and `simulationWorker.ts` both speak the typed
 * `WorkerRequest` / `WorkerResponse` discriminated unions (task 9.2). The
 * hook still tolerates the legacy `{ type, ... }` envelope as a defensive
 * bridge against a stale cached worker bundle, but on a fresh build there
 * is no legacy traffic. The `transfer` list returned by `runDispatch` is
 * forwarded into the worker via postMessage with a transfer list (task 5.17,
 * see `simulationWorker.ts` for the full transferable-buffer contract).
 */
export default function App() {
  // CSV ingest (parsed rows + sidecar regime-segment map)
  const {
    rows: ingestedRows,
    fields: ingestedFields,
    parseProgress,
    ingest,
    reset: resetIngest,
  } = useCsvIngest();
  const csvData: Record<string, unknown>[] = useMemo(
    () => ingestedRows ?? [],
    [ingestedRows],
  );
  const [columns, setColumns] = useState<string[]>([]);
  const [regimeSegments, setRegimeSegments] =
    useState<Map<number, RegimeSegmentId> | null>(null);

  // Mappings
  const [pnlCol, setPnlCol] = useState<string>('');
  const [regimeCol, setRegimeCol] = useState<string>('None');
  const [timestampCol, setTimestampCol] = useState<string>('None');
  const [benchmarkCol, setBenchmarkCol] = useState<string>('None');
  const [benchmarkFormat, setBenchmarkFormat] = useState<'pct' | 'mult'>('pct');
  const [factorCols, setFactorCols] = useState<string>('');
  const [dataFormat, setDataFormat] =
    useState<'pct' | 'mult' | 'absolute'>('absolute');
  const [rowFrequency, setRowFrequency] = useState<'trade' | 'day'>('trade');
  const [samplingMode, setSamplingMode] = useState<SamplingMode>('bootstrap');
  const [portfolioResampling, setPortfolioResampling] =
    useState<PortfolioResampling>('gaussian_copula');
  const [commissionPerTrade, setCommissionPerTrade] = useState(0);
  const [useFixedSeed, setUseFixedSeed] = useState(true);
  const [randomSeed, setRandomSeed] = useState(42);

  /** Narrow union: empty (no preset) or one of the configured prop-firm preset names. */
  type PropPreset = '' | (typeof PROP_FIRM_PRESETS)[number]['name'];
  const [propPreset, setPropPreset] = useState<PropPreset>('TopOneFutures 50k');

  // Position Sizing, Slippage & Auto Regime
  const [positionSizeMultiplier, setPositionSizeMultiplier] = useState(1.0);
  const [slippageModel, setSlippageModel] = useState<SlippageModel>('fixed');
  const [copulaDf, setCopulaDf] = useState(5);
  const [autoRegimeWindow, setAutoRegimeWindow] = useState(10);
  const [autoRegimeThreshold, setAutoRegimeThreshold] = useState(50);

  // Settings
  const [nSimulations, setNSimulations] = useState(10000);
  const [startingCapital, setStartingCapital] = useState(50000);
  const [ruinThreshold, setRuinThreshold] = useState(50);

  // Prop Firm Settings
  const [propFirmRulesEnabled, setPropFirmRulesEnabled] = useState(true);
  const [propTarget, setPropTarget] = useState(3000);
  const [propMaxDrawdown, setPropMaxDrawdown] = useState(1500);
  const [propConsistencyPercent, setPropConsistencyPercent] = useState(30);
  const [dailyLossLimitEnabled, setDailyLossLimitEnabled] = useState(false);
  const [dailyMaxLosses, setDailyMaxLosses] = useState(2);
  const [dailyMaxLossDollars, setDailyMaxLossDollars] = useState(500);
  const [tradesPerSession, setTradesPerSession] = useState(3);

  // Portfolio sleeves / NinjaTrader detection
  const [portfolioStrategies, setPortfolioStrategies] =
    useState<PortfolioStrategyConfig[]>([]);
  const [ninjaTraderMode, setNinjaTraderMode] = useState(false);
  const [ntProfitCol, setNtProfitCol] = useState('Profit');
  const [ntInstrumentCol, setNtInstrumentCol] = useState('Instrument');

  const [activeTab, setActiveTab] = useState<ModelTab>('basic');
  const [resultsHistory, setResultsHistory] =
    useState<Record<string, SimulationResults>>({});
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [error, setError] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Worker lifecycle is owned by the hook
  const {
    isLoading,
    progress: simProgress,
    error: simError,
    results: simResults,
    run: runSimulation,
    cancel: cancelSimulation,
  } = useSimulationRunner();

  // Surface the hook's error string into the existing inline error banner.
  useEffect(() => {
    if (simError) setError(simError);
  }, [simError]);

  const progress = simProgress ? Math.round(simProgress.pct * 100) : 0;
  const results: SimulationResults | null =
    resultsHistory[activeTab] ?? null;

  /**
   * Single canonical `DailyData[]` derivation (Requirement 10.9).
   *
   * Both the preview-stats memo and the worker dispatch path consume this
   * — there is no second pass through `csvData` to re-coerce financial
   * strings or re-resolve column mappings.
   */
  const factorNames = useMemo(
    () =>
      factorCols
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    [factorCols],
  );

  const segmentsAsString = useMemo(
    () =>
      regimeSegments != null
        ? new Map<number, string>(
            Array.from(regimeSegments, ([k, v]) => [k, String(v)]),
          )
        : null,
    [regimeSegments],
  );

  /**
   * Run `buildDailyData` once. Typed parse errors are surfaced into the
   * inline banner via the effect below rather than swallowed silently
   * (Requirement 25.2).
   */
  const { data: parsedData, errors: parseErrors } = useMemo(() => {
    if (!csvData.length || !pnlCol) return { data: [] as DailyData[], errors: [] };
    return buildDailyData({
      rows: csvData, pnlCol,
      regimeCol: regimeCol !== 'None' ? regimeCol : undefined,
      timestampCol: timestampCol !== 'None' ? timestampCol : undefined,
      benchmarkCol: benchmarkCol !== 'None' ? benchmarkCol : undefined,
      benchmarkFormat, factorCols: factorNames,
      segments: segmentsAsString ?? undefined,
    });
  }, [csvData, pnlCol, regimeCol, timestampCol, benchmarkCol, benchmarkFormat, factorNames, segmentsAsString]);

  const previewStats = useMemo(() => {
    if (!parsedData.length) return null;
    try {
      return previewHistoricalStats(parsedData, dataFormat, startingCapital, commissionPerTrade, rowFrequency);
    } catch (err) {
      setError(`Preview stats failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }, [parsedData, dataFormat, startingCapital, commissionPerTrade, rowFrequency]);

  // Surface the first typed parse error from buildDailyData (Requirement 25.2).
  useEffect(() => {
    if (parseErrors.length === 0) return;
    const f = parseErrors[0];
    const more = parseErrors.length > 1 ? ` (+${parseErrors.length - 1} more)` : '';
    setError(`CSV parse error on row ${f.row + 1}, column "${f.column}": ${f.reason}${more}`);
  }, [parseErrors]);

  const applyPropPreset = (name: string) => {
    setPropPreset(name as PropPreset);
    const preset = PROP_FIRM_PRESETS.find((p) => p.name === name);
    if (!preset) return;
    setPropFirmRulesEnabled(true);
    setPropTarget(preset.target);
    setPropMaxDrawdown(preset.maxDrawdown);
    setPropConsistencyPercent(preset.consistencyPercent);
    setStartingCapital(preset.accountSize);
    setRuinThreshold(50); // ruin at 50% of account base
    if (preset.dailyLossLimit) {
      setDailyLossLimitEnabled(true);
      setDailyMaxLossDollars(preset.dailyLossLimit);
    }
  };

  // Memoize expensive 95th-percentile computation — sorted lazily per result.
  const p95MaxDrawdown = useMemo(() => {
    if (!results) return 0;
    const sorted = [...results.maxDrawdowns].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)] || 0;
  }, [results]);

  const applyNinjaTraderImport = (
    data: Record<string, unknown>[],
    fields: string[],
  ) => {
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
      })),
    );
  };

  const initPortfolioFromColumns = (
    data: Record<string, unknown>[],
    fields: string[],
  ) => {
    const numericCols = detectNumericColumns(data, fields, NINJATRADER_NON_SLEEVE_COLUMNS);
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
      })),
    );
  };

  const enabledPortfolioCount = portfolioStrategies.filter((s) => s.enabled).length;

  const normalizePortfolioWeights = () => {
    const enabled = portfolioStrategies.filter((s) => s.enabled);
    const sum = enabled.reduce((s, st) => s + st.weight, 0) || 1;
    setPortfolioStrategies((prev) =>
      prev.map((st) => (st.enabled ? { ...st, weight: st.weight / sum } : st)),
    );
  };

  const setEqualPortfolioWeights = () => {
    const n = portfolioStrategies.filter((s) => s.enabled).length || 1;
    setPortfolioStrategies((prev) =>
      prev.map((st) => (st.enabled ? { ...st, weight: 1 / n } : st)),
    );
  };

  // Wire the CSV ingest hook to the existing column / segment / sleeve setup.
  useEffect(() => {
    if (!ingestedRows || !ingestedFields) return;
    setColumns(ingestedFields);
    if (isNinjaTraderGrid(ingestedFields)) {
      applyNinjaTraderImport(ingestedRows, ingestedFields);
    } else {
      setNinjaTraderMode(false);
      setPnlCol(ingestedFields[0] || '');
      initPortfolioFromColumns(ingestedRows, ingestedFields);
    }
    const profitForSeg = findColumn(ingestedFields, 'Profit') ?? ingestedFields[0];
    const inRegime = findInRegimeColumn(ingestedFields);
    const segments = assignPortfolioRegimeSegments(
      ingestedRows,
      profitForSeg,
      parseFinancialNumber,
      inRegime,
    );
    setRegimeSegments(segments);
    setResultsHistory({});
    setError('');
    // Intentionally not depending on the imperative setters — they're stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingestedRows, ingestedFields]);

  // Surface CSV parse errors into the error banner.
  useEffect(() => {
    if (parseProgress.state === 'error' && parseProgress.message) {
      setError(`Failed to parse CSV: ${parseProgress.message}`);
    }
  }, [parseProgress.state, parseProgress.message]);

  // Snapshot of the PnL series that was last dispatched. The post-run
  // `useEffect` reads this to compute `hashSeries` without re-parsing
  // `csvData` (Requirement 10.10).
  const lastDispatchedPnls = useRef<number[]>([]);

  // When the worker returns a result, file it under the active tab and persist
  // for audit (Requirement 9 / 15: hashSeries → recordRun, best-effort).
  useEffect(() => {
    if (!simResults) return;
    setResultsHistory((prev) => ({ ...prev, [simResults.modelType]: simResults }));
    hashSeries(lastDispatchedPnls.current)
      .then((digest) => recordRun(simResults, digest))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simResults]);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    resetIngest();
    setError('');
    void ingest(file);
  };

  const handleCancel = () => {
    cancelSimulation();
  };

  const handleRun = () => {
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

    setError('');

    const commonRun = {
      nSimulations,
      startingCapital,
      ruinThreshold,
      commissionPerTrade,
      randomSeed: useFixedSeed ? randomSeed : null,
      rowFrequency,
      positionSizeMultiplier,
      slippageModel,
      impactCoefficient: 0.1,
      dataFormat,
    };
    const factorNamesOpt = factorNames.length > 0 ? factorNames : undefined;

    try {
      if (activeTab === 'portfolio') {
        const enabled = portfolioStrategies.filter((s) => s.enabled);
        const strategies: StrategyAllocation[] = buildPortfolioStrategySleeves({
          rows: csvData,
          sleeves: enabled,
          instrumentCol: ntInstrumentCol,
          profitCol: ntProfitCol,
          segments: segmentsAsString,
        });
        const horizon = Math.max(...strategies.map((s) => s.data.length));
        lastDispatchedPnls.current = strategies.flatMap((s) => s.data.map((d) => d.pnl));
        const config: PortfolioConfig = {
          ...commonRun,
          modelType: 'portfolio',
          nTrades: horizon,
          samplingMode,
          periodsPerYear: rowFrequency === 'day' ? 252 : Math.min(252, horizon),
          strategies,
          copulaDf,
          portfolioResampling,
          portfolioAlignedRows: !enabled.some((s) => s.groupByInstrument),
          enablePortfolioRegimeBreakdown: true,
          factorNames: factorNamesOpt,
        };
        const { request, transfer } = buildPortfolioRunRequest(config, strategies);
        runSimulation(request, transfer);
        return;
      }

      if (parsedData.length === 0) {
        throw new Error('No valid numeric data found in the selected column.');
      }
      const modelType = activeTab as 'basic' | 'regime' | 'parametric' | 'garch';
      lastDispatchedPnls.current = parsedData.map((d) => d.pnl);
      const config: SingleStrategyConfig = {
        ...commonRun,
        modelType,
        nTrades: parsedData.length,
        samplingMode: modelType === 'basic' ? samplingMode : 'bootstrap',
        periodsPerYear: rowFrequency === 'day' ? 252 : Math.min(252, parsedData.length),
        data: parsedData,
        factorNames: factorNamesOpt,
        regimeSource: regimeCol,
        autoRegimeWindow,
        autoRegimeThreshold,
        propFirmRulesEnabled,
        propTarget,
        propMaxDrawdown,
        propConsistencyPercent,
        dailyLossLimitEnabled,
        dailyMaxLosses,
        dailyMaxLossDollars,
        tradesPerSession,
      };
      const { request, transfer } = buildSingleRunRequest(config, parsedData, {
        computePositionSizing: modelType === 'parametric',
      });
      runSimulation(request, transfer);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error running simulation';
      setError(message);
    }
  };

  const handleDownload = () => {
    if (!results) return;
    const blob = buildResultsCsvBlob(results, { activeTab, startingCapital });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', buildResultsCsvFilename(activeTab));
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
        dailyLossLimitEnabled ? dailyMaxLossDollars : undefined,
      );
      setIsExportModalOpen(false);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setError(`PDF export failed: ${message}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="flex h-screen text-[var(--text-primary)] font-sans overflow-hidden">
      <Sidebar
        csvData={csvData}
        columns={columns}
        ninjaTraderMode={ninjaTraderMode}
        ntInstrumentCol={ntInstrumentCol}
        activeTab={activeTab}
        isLoading={isLoading}
        progress={progress}
        error={error}
        onOpenHistory={() => setIsHistoryOpen(true)}
        pnlCol={pnlCol} setPnlCol={setPnlCol}
        regimeCol={regimeCol} setRegimeCol={setRegimeCol}
        timestampCol={timestampCol} setTimestampCol={setTimestampCol}
        benchmarkCol={benchmarkCol} setBenchmarkCol={setBenchmarkCol}
        benchmarkFormat={benchmarkFormat} setBenchmarkFormat={setBenchmarkFormat}
        factorCols={factorCols} setFactorCols={setFactorCols}
        dataFormat={dataFormat} setDataFormat={setDataFormat}
        rowFrequency={rowFrequency} setRowFrequency={setRowFrequency}
        samplingMode={samplingMode} setSamplingMode={setSamplingMode}
        portfolioResampling={portfolioResampling} setPortfolioResampling={setPortfolioResampling}
        copulaDf={copulaDf} setCopulaDf={setCopulaDf}
        commissionPerTrade={commissionPerTrade} setCommissionPerTrade={setCommissionPerTrade}
        slippageModel={slippageModel} setSlippageModel={setSlippageModel}
        positionSizeMultiplier={positionSizeMultiplier} setPositionSizeMultiplier={setPositionSizeMultiplier}
        autoRegimeWindow={autoRegimeWindow} setAutoRegimeWindow={setAutoRegimeWindow}
        autoRegimeThreshold={autoRegimeThreshold} setAutoRegimeThreshold={setAutoRegimeThreshold}
        useFixedSeed={useFixedSeed} setUseFixedSeed={setUseFixedSeed}
        randomSeed={randomSeed} setRandomSeed={setRandomSeed}
        nSimulations={nSimulations} setNSimulations={setNSimulations}
        startingCapital={startingCapital} setStartingCapital={setStartingCapital}
        ruinThreshold={ruinThreshold} setRuinThreshold={setRuinThreshold}
        propPreset={propPreset} applyPropPreset={applyPropPreset}
        propFirmRulesEnabled={propFirmRulesEnabled} setPropFirmRulesEnabled={setPropFirmRulesEnabled}
        propTarget={propTarget} setPropTarget={setPropTarget}
        propMaxDrawdown={propMaxDrawdown} setPropMaxDrawdown={setPropMaxDrawdown}
        propConsistencyPercent={propConsistencyPercent} setPropConsistencyPercent={setPropConsistencyPercent}
        dailyLossLimitEnabled={dailyLossLimitEnabled} setDailyLossLimitEnabled={setDailyLossLimitEnabled}
        dailyMaxLosses={dailyMaxLosses} setDailyMaxLosses={setDailyMaxLosses}
        dailyMaxLossDollars={dailyMaxLossDollars} setDailyMaxLossDollars={setDailyMaxLossDollars}
        tradesPerSession={tradesPerSession} setTradesPerSession={setTradesPerSession}
        portfolioStrategies={portfolioStrategies} setPortfolioStrategies={setPortfolioStrategies}
        enabledPortfolioCount={enabledPortfolioCount}
        setEqualPortfolioWeights={setEqualPortfolioWeights}
        normalizePortfolioWeights={normalizePortfolioWeights}
        handleFileUpload={handleFileUpload}
        handleRun={handleRun}
        handleCancel={handleCancel}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <MainHeader
          activeTab={activeTab} setActiveTab={setActiveTab}
          hasResults={!!results} isExportingPdf={isExportingPdf}
          onExportPdf={handleExportPdf} onDownloadCsv={handleDownload}
        />

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar results-backdrop">
          {!results && !isLoading ? (
            <EmptyHero hasFile={csvData.length > 0} isPortfolio={activeTab === 'portfolio'} />
          ) : results ? (
            <ResultsView
              results={results} activeTab={activeTab} regimeCol={regimeCol}
              autoRegimeWindow={autoRegimeWindow} autoRegimeThreshold={autoRegimeThreshold}
              startingCapital={startingCapital} ruinThreshold={ruinThreshold}
              samplingMode={samplingMode} p95MaxDrawdown={p95MaxDrawdown}
              dailyLossLimitEnabled={dailyLossLimitEnabled} dailyMaxLossDollars={dailyMaxLossDollars}
            />
          ) : previewStats ? (
            <div className="max-w-4xl mx-auto space-y-4 animate-in fade-in duration-300">
              <HistoricalStatsPanel stats={previewStats} title="Upload Preview — Empirical Metrics" />
              <p className="text-sm text-[var(--text-secondary)] text-center">
                Run simulations to generate VaR, CVaR, and path distributions.
              </p>
            </div>
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-[var(--border)] px-8 py-2 text-center text-[10px] text-[var(--text-secondary)]">
          Modeled from Monte Carlo resampling of your own past trades. Not a prediction of future results and not financial advice.
        </footer>
      </main>

      <ExportModal
        isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)}
        resultsHistory={resultsHistory} onExport={handleGeneratePdf}
        isExportingPdf={isExportingPdf}
      />
      <RunHistoryPanel open={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
      <HiddenChartCapture resultsHistory={resultsHistory} />
    </div>
  );
}

