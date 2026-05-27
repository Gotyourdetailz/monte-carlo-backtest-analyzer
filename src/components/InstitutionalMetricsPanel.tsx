import { AlertTriangle } from 'lucide-react';
import { InstitutionalRiskMetrics } from '../riskMetrics';
import { MetricsValidity, SimulationRunMeta } from '../types';

type Props = {
  metrics: InstitutionalRiskMetrics;
  runMeta: SimulationRunMeta;
  metricsValidity: MetricsValidity;
};

export function InstitutionalMetricsPanel({ metrics, runMeta, metricsValidity }: Props) {
  const showTerminal = metricsValidity.terminalPnL;

  return (
    <div className="glass-card animate-fade-in-up overflow-hidden">
      <div className="px-6 py-4 border-b border-[#30363d]/50 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${showTerminal ? 'bg-[var(--accent-green)] animate-live-pulse' : 'bg-[var(--accent-amber)] animate-live-pulse'}`} />
          <span className="text-[10px] text-[var(--accent-blue)] uppercase font-bold tracking-wider">
            Institutional Risk Summary
          </span>
        </div>
        <span className="text-[10px] font-mono text-[var(--text-secondary)] opacity-60">
          {runMeta.runId} · seed {runMeta.randomSeed ?? 'non-deterministic'} · {runMeta.samplingMode}
        </span>
      </div>
      {!showTerminal && metricsValidity.warning && (
        <div className="mx-6 mt-4 p-3 bg-[#d29922]/10 border border-[#d29922]/40 rounded-lg flex gap-2 text-xs text-[#f2cc60] animate-fade-in-up">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{metricsValidity.warning}</span>
        </div>
      )}
      <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        {showTerminal ? (
          <>
            <Metric label="VaR 95% (PnL)" value={`$${metrics.var95.toFixed(0)}`} hint="5th percentile terminal PnL" negative={metrics.var95 < 0} stagger={1} />
            <Metric label="VaR 99% (PnL)" value={`$${metrics.var99.toFixed(0)}`} hint="1st percentile terminal PnL" negative={metrics.var99 < 0} stagger={2} />
            <Metric label="CVaR 95%" value={`$${metrics.cvar95.toFixed(0)}`} hint="Expected shortfall, worst 5%" negative={metrics.cvar95 < 0} stagger={3} />
            <Metric label="CVaR 99%" value={`$${metrics.cvar99.toFixed(0)}`} hint="Expected shortfall, worst 1%" negative={metrics.cvar99 < 0} stagger={4} />
            <Metric label="Prob. of Loss" value={`${metrics.probabilityOfLoss.toFixed(1)}%`} negative={metrics.probabilityOfLoss > 50} stagger={5} />
            <Metric label="Median Terminal" value={`$${Math.round(metrics.medianFinalBalance).toLocaleString()}`} negative={metrics.medianFinalBalance < 0} stagger={6} />
          </>
        ) : (
          <>
            <Metric label="VaR 95% (PnL)" value="N/A" hint="Invalid under permutation sampling" muted stagger={1} />
            <Metric label="CVaR 95%" value="N/A" hint="Invalid under permutation sampling" muted stagger={2} />
            <Metric label="Terminal metrics" value="N/A" hint="See drawdown distribution below" muted stagger={3} />
          </>
        )}
        <Metric label="Median Max DD" value={`${(metrics.medianMaxDrawdown * 100).toFixed(1)}%`} hint="Valid for all sampling modes" stagger={showTerminal ? 7 : 4} />
        {showTerminal && (
          <>
            <Metric label="Calmar (median)" value={metrics.calmarRatio.toFixed(2)} stagger={8} />
            <Metric label="Skewness" value={metrics.skewness.toFixed(2)} negative={metrics.skewness < -0.5} stagger={8} />
            <Metric label="Excess Kurtosis" value={metrics.excessKurtosis.toFixed(2)} stagger={8} />
          </>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  muted,
  negative,
  stagger = 0,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
  negative?: boolean;
  stagger?: number;
}) {
  const staggerClass = stagger > 0 ? `stagger-${Math.min(stagger, 8)}` : '';
  const valueColor = muted
    ? 'text-[var(--text-secondary)]'
    : negative
      ? 'text-[var(--accent-red)]'
      : 'text-[var(--text-primary)]';

  return (
    <div className={`group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02] cursor-default`}>
      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">{label}</div>
      <div className={`text-2xl font-light metric-value animate-count-up ${staggerClass} ${valueColor}`}>{value}</div>
      {hint && <div className="text-[10px] text-[var(--text-secondary)] mt-1 opacity-60">{hint}</div>}
    </div>
  );
}
