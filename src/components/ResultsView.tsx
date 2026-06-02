/**
 * ResultsView — the model-result column rendered when a simulation has
 * finished. Extracted from `App.tsx` so the top-level orchestration file
 * stays under the 600-line cap mandated by Requirement 10.7.
 *
 * Pure presentational: receives the run's `SimulationResults` plus a few
 * UI-only knobs (sampling mode, regime source, daily-loss-limit context)
 * via props and renders the panel stack. No state, no side effects.
 */

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { SamplingMode, SimulationResults } from '../types';
import { SpaghettiPlot, Histogram } from './Plots';
import { HistoricalStatsPanel } from './HistoricalStatsPanel';
import { InstitutionalMetricsPanel } from './InstitutionalMetricsPanel';
import { MethodologyPanel } from './MethodologyPanel';
import {
  PortfolioCorrelationMatrix,
  PortfolioStrategyBreakdown,
} from './PortfolioPanel';
import { PortfolioRegimePanel } from './PortfolioRegimePanel';
import { PositionSizingPanel } from './PositionSizingPanel';
import { ConvergencePanel } from './ConvergencePanel';
import { StressTestPanel } from './StressTestPanel';
import { ModelValidationPanel } from './ModelValidationPanel';
import { EVTPanel } from './EVTPanel';
import { AttributionPanel } from './AttributionPanel';
import { TimestampAnalyticsPanel } from './TimestampAnalyticsPanel';
import { WalkForwardPanel } from './WalkForwardPanel';
import { MultiFactorPanel } from './MultiFactorPanel';
import { MetricCard } from './MetricCard';
import { ChallengeVerdict } from './ChallengeVerdict';
import { PERMUTATION_TERMINAL_WARNING } from '../metricsValidity';
import { cn } from '../lib/utils';

export interface ResultsViewProps {
  results: SimulationResults;
  activeTab: 'basic' | 'regime' | 'parametric' | 'portfolio' | 'garch';
  regimeCol: string;
  autoRegimeWindow: number;
  autoRegimeThreshold: number;
  startingCapital: number;
  ruinThreshold: number;
  samplingMode: SamplingMode;
  p95MaxDrawdown: number;
  dailyLossLimitEnabled: boolean;
  dailyMaxLossDollars: number;
}

export function ResultsView({
  results,
  activeTab,
  regimeCol,
  autoRegimeWindow,
  autoRegimeThreshold,
  startingCapital,
  ruinThreshold,
  samplingMode,
  p95MaxDrawdown,
  dailyLossLimitEnabled,
  dailyMaxLossDollars,
}: ResultsViewProps) {
  return (
    <div id="report-container" className="space-y-6">
      <ChallengeVerdict results={results} />
      <MethodologyPanel
        modelType={results.modelType}
        samplingMode={results.runMeta.samplingMode}
        portfolioResampling={results.portfolioMeta?.resampling}
        regimeSource={regimeCol}
        autoRegimeWindow={autoRegimeWindow}
        autoRegimeThreshold={autoRegimeThreshold}
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
        title={
          results.modelType === 'portfolio'
            ? 'Combined Portfolio — Empirical Metrics'
            : undefined
        }
      />
      {results.distributionFit && <DistributionFitCard fit={results.distributionFit} />}
      {results.portfolioMeta && (
        <>
          <PortfolioStrategyBreakdown meta={results.portfolioMeta} />
          <PortfolioCorrelationMatrix meta={results.portfolioMeta} />
          {(results.portfolioMeta.regimeBreakdown ||
            (results.portfolioMeta.dynamicCopulaFallbackRegimes &&
              results.portfolioMeta.dynamicCopulaFallbackRegimes.length > 0)) && (
            <PortfolioRegimePanel
              breakdown={results.portfolioMeta.regimeBreakdown ?? []}
              fallbackRegimes={results.portfolioMeta.dynamicCopulaFallbackRegimes}
            />
          )}
        </>
      )}
      {activeTab === 'basic' && samplingMode === 'permutation' && !results.metricsValidity.terminalPnL && (
        <div className="p-3 bg-[#d29922]/10 border border-[#d29922]/40 rounded-lg text-xs text-[#f2cc60] flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{PERMUTATION_TERMINAL_WARNING}</span>
        </div>
      )}
      <KpiRow
        results={results}
        startingCapital={startingCapital}
        ruinThreshold={ruinThreshold}
        p95MaxDrawdown={p95MaxDrawdown}
      />
      {results.propEvalStats && <PropEvalCard results={results} />}
      <SpaghettiCard results={results} />
      <DistributionCards results={results} />
      {results.garchFit && <GarchCard fit={results.garchFit} />}
      {results.drawdownDuration && (
        <DrawdownDurationCard duration={results.drawdownDuration} />
      )}
      {results.stressTest && (
        <StressTestPanel stressResult={results.stressTest} startingCapital={startingCapital} />
      )}
      {results.convergence && <ConvergencePanel convergence={results.convergence} />}
      {results.modelValidation && <ModelValidationPanel validation={results.modelValidation} />}
      {results.evt && <EVTPanel evt={results.evt} />}
      {results.walkForward && <WalkForwardPanel report={results.walkForward} />}
      {results.attribution && <AttributionPanel attribution={results.attribution} />}
      {results.multiFactor && <MultiFactorPanel report={results.multiFactor} />}
      {results.timestampAnalytics && (
        <TimestampAnalyticsPanel
          report={results.timestampAnalytics}
          dailyLossLimit={dailyLossLimitEnabled ? dailyMaxLossDollars : undefined}
        />
      )}
    </div>
  );
}

function DistributionFitCard({
  fit,
}: {
  fit: NonNullable<SimulationResults['distributionFit']>;
}) {
  return (
    <div className="glass-card animate-fade-in-up overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--border)]/50 flex items-center gap-2">
        <span className="badge badge-purple">MLE</span>
        <span className="text-[10px] text-[var(--accent-purple)] uppercase font-bold tracking-wider">
          Distribution Fit
        </span>
      </div>
      <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <DistFitTile
          label="Best Fit"
          value={fit.type === 'student_t' ? `Student-t (df=${fit.df?.toFixed(1)})` : 'Normal'}
          gradient
        />
        <DistFitTile label="Location (μ)" value={`$${fit.mu.toFixed(2)}`} stagger={2} />
        <DistFitTile label="Scale (σ)" value={`$${fit.sigma.toFixed(2)}`} stagger={3} />
        <DistFitTile label="BIC" value={fit.bic.toFixed(1)} stagger={4} />
      </div>
    </div>
  );
}

function DistFitTile({
  label,
  value,
  gradient,
  stagger,
}: {
  label: string;
  value: string;
  gradient?: boolean;
  stagger?: number;
}) {
  const staggerCls = stagger ? `stagger-${stagger}` : '';
  const valueCls = gradient ? 'gradient-text' : 'text-[var(--text-primary)]';
  return (
    <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">
        {label}
      </div>
      <div className={cn('text-lg metric-value animate-count-up', staggerCls, valueCls)}>
        {value}
      </div>
    </div>
  );
}

function KpiRow({
  results,
  startingCapital,
  ruinThreshold,
  p95MaxDrawdown,
}: {
  results: SimulationResults;
  startingCapital: number;
  ruinThreshold: number;
  p95MaxDrawdown: number;
}) {
  return (
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
        subtitle="95th percentile risk"
        highlight={p95MaxDrawdown > results.originalMaxDrawdown * 1.5 ? 'red' : 'white'}
      />
      <MetricCard
        title="Historical Max DD"
        value={`${((results.originalMaxDrawdown || 0) * 100).toFixed(1)}%`}
        subtitle="Empirical Drawdown"
        highlight="green"
      />
    </div>
  );
}

function PropEvalCard({ results }: { results: SimulationResults }) {
  const stats = results.propEvalStats;
  if (!stats) return null;
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl overflow-hidden relative">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-transparent">
        <span className="text-[10px] text-[#238636] uppercase font-bold tracking-wider flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#238636]" />
          Prop Firm Evaluation Results (N = {results.paths.length})
        </span>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
        <PropEvalTile label="Pass Rate" value={stats.passRate} valueClass="text-white" />
        <PropEvalTile label="Failed: Max DD" value={stats.failDrawdown} valueClass="text-[var(--accent-red)]" />
        <PropEvalTile label="Failed: Consistency" value={stats.failConsistency} valueClass="text-[#f2cc60]" />
        <PropEvalTile label="Failed: Time/No Target" value={stats.failTime} valueClass="text-[var(--text-secondary)]" />
      </div>
    </div>
  );
}

function PropEvalTile({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: number;
  valueClass: string;
}) {
  return (
    <div>
      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-2 font-semibold">{label}</div>
      <div className={cn('text-3xl font-light', valueClass)}>
        {value.toFixed(1)}
        <span className="text-lg text-[var(--text-secondary)]">%</span>
      </div>
    </div>
  );
}

function SpaghettiCard({ results }: { results: SimulationResults }) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl flex flex-col overflow-hidden relative">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-transparent">
        <div className="flex gap-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[var(--accent-blue)] opacity-20 rounded-full"></div>
            <span className="text-[10px] text-[var(--text-secondary)]">Simulated Paths</span>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <div className="w-3 h-0.5 bg-[#f2cc60]"></div>
            <span className="text-[10px] text-[var(--text-secondary)]">Historical Curve</span>
          </div>
        </div>
      </div>
      <div className="p-6">
        <SpaghettiPlot results={results} />
      </div>
    </div>
  );
}

function DistributionCards({ results }: { results: SimulationResults }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-12">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-6 relative">
        <span className="text-[10px] text-[var(--text-secondary)] uppercase font-bold tracking-wider">
          Terminal Account Balance Distribution
        </span>
        <div className="mt-4">
          <Histogram
            data={results.finalBalances}
            color="#238636"
            formatter={(val) => `$${val.toFixed(0)}`}
            referenceLine={results.originalPath[results.originalPath.length - 1]}
          />
        </div>
      </div>
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-6 relative">
        <span className="text-[10px] text-[var(--text-secondary)] uppercase font-bold tracking-wider">
          Max Drawdown Distribution
        </span>
        <div className="mt-4">
          <Histogram
            data={results.maxDrawdowns}
            color="var(--accent-red)"
            formatter={(val) => `${(val * 100).toFixed(1)}%`}
            referenceLine={results.originalMaxDrawdown}
          />
        </div>
      </div>
    </div>
  );
}

function GarchCard({
  fit,
}: {
  fit: NonNullable<SimulationResults['garchFit']>;
}) {
  const tone =
    fit.persistence > 0.95
      ? 'red'
      : fit.persistence > 0.85
        ? 'amber'
        : 'green';
  return (
    <div className="glass-card animate-fade-in-up overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--border)]/50 flex items-center gap-2">
        <span className="badge badge-amber">GARCH</span>
        <span className="text-[10px] text-[var(--accent-amber)] uppercase font-bold tracking-wider">
          Fitted Parameters
        </span>
      </div>
      <div className="p-6 grid grid-cols-2 md:grid-cols-5 gap-4">
        <GarchStat label="ω (omega)" value={fit.omega.toExponential(3)} hint="Baseline variance" />
        <GarchStat label="α (alpha)" value={fit.alpha.toFixed(4)} hint="Shock sensitivity" />
        <GarchStat label="β (beta)" value={fit.beta.toFixed(4)} hint="Persistence" />
        <GarchStat
          label="α+β"
          value={fit.persistence.toFixed(4)}
          hint="Vol persistence"
          tone={tone}
        />
        <GarchStat label="BIC" value={fit.bic.toFixed(1)} />
      </div>
    </div>
  );
}

function GarchStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'red' | 'amber' | 'green';
}) {
  const toneClass =
    tone === 'red'
      ? 'text-[var(--accent-red)]'
      : tone === 'amber'
        ? 'text-[var(--accent-amber)]'
        : tone === 'green'
          ? 'text-[var(--accent-green)]'
          : 'text-[var(--text-primary)]';
  return (
    <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">
        {label}
      </div>
      <div className={cn('text-lg metric-value animate-count-up', toneClass)}>{value}</div>
      {hint && <div className="text-[10px] text-[var(--text-secondary)] mt-1 opacity-60">{hint}</div>}
    </div>
  );
}

function DrawdownDurationCard({
  duration,
}: {
  duration: NonNullable<SimulationResults['drawdownDuration']>;
}) {
  const p95Tone =
    duration.p95MaxDuration > 50
      ? 'text-[var(--accent-red)]'
      : 'text-[var(--text-primary)]';
  const undTone =
    duration.avgPctUnderwater > 0.5
      ? 'text-[var(--accent-red)]'
      : duration.avgPctUnderwater > 0.3
        ? 'text-[var(--accent-amber)]'
        : 'text-[var(--accent-green)]';
  return (
    <div className="glass-card animate-fade-in-up overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--border)]/50">
        <span className="text-[10px] text-[var(--accent-blue)] uppercase font-bold tracking-wider">
          Drawdown Duration Analysis
        </span>
      </div>
      <div className="p-6 grid grid-cols-3 gap-6">
        <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
          <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">
            Median Max Duration
          </div>
          <div className="text-2xl metric-value animate-count-up text-[var(--text-primary)]">
            {duration.medianMaxDuration} <span className="text-sm text-[var(--text-secondary)]">trades</span>
          </div>
        </div>
        <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
          <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">
            95th Pctl Duration
          </div>
          <div className={cn('text-2xl metric-value animate-count-up stagger-2', p95Tone)}>
            {duration.p95MaxDuration} <span className="text-sm text-[var(--text-secondary)]">trades</span>
          </div>
        </div>
        <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02]">
          <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">
            Avg % Time Underwater
          </div>
          <div className={cn('text-2xl metric-value animate-count-up stagger-3', undTone)}>
            {(duration.avgPctUnderwater * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}
