import { AlertTriangle } from 'lucide-react';
import { InstitutionalRiskMetrics } from '../riskMetrics';
import { MetricsValidity, SimulationRunMeta } from '../types';
import { useTerm } from '../lang/LanguageProvider';
import { cn } from '../lib/utils';

type Props = {
  metrics: InstitutionalRiskMetrics;
  runMeta: SimulationRunMeta;
  metricsValidity: MetricsValidity;
};

export function InstitutionalMetricsPanel({ metrics, runMeta, metricsValidity }: Props) {
  const showTerminal = metricsValidity.terminalPnL;
  const t = useTerm();

  return (
    <div className="glass-card animate-fade-in-up overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--border)]/50 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', showTerminal ? 'bg-[var(--accent-green)] animate-live-pulse' : 'bg-[var(--accent-amber)] animate-live-pulse')} />
          <span className="text-[10px] text-[var(--accent-blue)] uppercase font-bold tracking-wider">
            {t('instSummary').label}
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
            <Metric label={t('var95').label} value={`$${metrics.var95.toFixed(0)}`} hint={t('var95').hint} negative={metrics.var95 < 0} stagger={1} />
            <Metric label={t('var99').label} value={`$${metrics.var99.toFixed(0)}`} hint={t('var99').hint} negative={metrics.var99 < 0} stagger={2} />
            <Metric label={t('cvar95').label} value={`$${metrics.cvar95.toFixed(0)}`} hint={t('cvar95').hint} negative={metrics.cvar95 < 0} stagger={3} />
            <Metric label={t('cvar99').label} value={`$${metrics.cvar99.toFixed(0)}`} hint={t('cvar99').hint} negative={metrics.cvar99 < 0} stagger={4} />
            <Metric label={t('probLoss').label} value={`${metrics.probabilityOfLoss.toFixed(1)}%`} hint={t('probLoss').hint} negative={metrics.probabilityOfLoss > 50} stagger={5} />
            <Metric label={t('medianTerminal').label} value={`$${Math.round(metrics.medianFinalBalance).toLocaleString()}`} hint={t('medianTerminal').hint} negative={metrics.medianFinalBalance < 0} stagger={6} />
          </>
        ) : (
          <>
            <Metric label={t('var95').label} value="N/A" hint="Invalid under permutation sampling" muted stagger={1} />
            <Metric label={t('cvar95').label} value="N/A" hint="Invalid under permutation sampling" muted stagger={2} />
            <Metric label="Terminal metrics" value="N/A" hint="See drawdown distribution below" muted stagger={3} />
          </>
        )}
        <Metric label={t('medianMaxDd').label} value={`${(metrics.medianMaxDrawdown * 100).toFixed(1)}%`} hint={t('medianMaxDd').hint} stagger={showTerminal ? 7 : 4} />
        {showTerminal && (
          <>
            <Metric label={t('calmar').label} value={metrics.calmarRatio.toFixed(2)} hint={t('calmar').hint} stagger={8} />
            <Metric label={t('skewness').label} value={metrics.skewness.toFixed(2)} hint={t('skewness').hint} negative={metrics.skewness < -0.5} stagger={8} />
            <Metric label={t('kurtosis').label} value={metrics.excessKurtosis.toFixed(2)} hint={t('kurtosis').hint} stagger={8} />
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
  // NOTE: This panel intentionally keeps a local <Metric> instead of using the shared
  // <Stat> from `_shared/Stat.tsx`. The Institutional Risk Summary is the page-level
  // KPI strip and uses a different visual treatment: larger 2xl light typography,
  // staggered count-up animations, a `muted` state for N/A under permutation
  // sampling, and a hover background. None of those fit the shared Stat shape, and
  // collapsing them would either inflate the shared component's surface area or
  // dilute this panel's hero-row look.
  const staggerClass = stagger > 0 ? `stagger-${Math.min(stagger, 8)}` : '';
  const valueColor = muted
    ? 'text-[var(--text-secondary)]'
    : negative
      ? 'text-[var(--accent-red)]'
      : 'text-[var(--text-primary)]';

  return (
    <div className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02] cursor-default">
      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">{label}</div>
      <div className={cn('text-2xl font-light metric-value animate-count-up', staggerClass, valueColor)}>{value}</div>
      {hint && <div className="text-[10px] text-[var(--text-secondary)] mt-1 opacity-60">{hint}</div>}
    </div>
  );
}
