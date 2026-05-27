import type { AttributionReport } from '../benchmarkAttribution';

type Props = {
  attribution: AttributionReport;
};

function pct(v: number, d = 2): string {
  if (!isFinite(v)) return '—';
  return `${(v * 100).toFixed(d)}%`;
}

function num(v: number, d = 2): string {
  if (!isFinite(v)) return '—';
  return v.toFixed(d);
}

export function AttributionPanel({ attribution }: Props) {
  const sig = attribution.alphaPValue != null && attribution.alphaPValue < 0.05;

  return (
    <div className="glass-card panel-enter overflow-hidden">
      <div className="px-6 py-4 border-b border-[#30363d]/50 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[var(--accent-blue)] uppercase font-bold tracking-wider">
            Benchmark Attribution
          </span>
          <span className={`badge ${sig ? 'badge-green' : 'badge-amber'}`}>
            {sig ? 'Alpha statistically significant' : 'Alpha not significant'}
          </span>
        </div>
        <span className="text-[10px] text-[var(--text-secondary)] opacity-60">
          n = {attribution.observations.toLocaleString()} · {attribution.periodsPerYear}/yr
        </span>
      </div>

      <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          label="Alpha (annualised)"
          value={pct(attribution.alphaAnnualized, 2)}
          hint={`per-period α = ${pct(attribution.alpha, 3)}`}
        />
        <Stat
          label="Beta"
          value={num(attribution.beta, 3)}
          hint={`R² = ${num(attribution.rSquared, 3)}`}
        />
        <Stat
          label="α t-stat (HC0)"
          value={num(attribution.alphaT, 2)}
          hint={`p = ${attribution.alphaPValue < 0.001 ? '<0.001' : num(attribution.alphaPValue, 3)}`}
        />
        <Stat
          label="β t-stat (HC0)"
          value={num(attribution.betaT, 2)}
        />
        <Stat
          label="Tracking error (ann.)"
          value={pct(attribution.trackingError, 2)}
          hint="std dev of active return"
        />
        <Stat
          label="Information ratio"
          value={num(attribution.informationRatio, 2)}
        />
        <Stat
          label="Up capture"
          value={num(attribution.upCapture, 2)}
          hint="strategy / benchmark on up days"
        />
        <Stat
          label="Down capture"
          value={num(attribution.downCapture, 2)}
          hint="lower is better"
        />
      </div>

      <div className="px-6 pb-5 -mt-1 text-[10px] text-[var(--text-secondary)] opacity-70 leading-snug">
        Standard errors are White / HC0 heteroskedasticity-robust. p-values use a normal approximation (large-sample).
        Treat α with non-significant t as noise. Capture ratios are computed only on periods with non-zero benchmark returns.
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-1">{label}</div>
      <div className="metric-value text-[var(--text-primary)] text-base">{value}</div>
      {hint && <div className="text-[10px] text-[var(--text-secondary)] opacity-60 mt-0.5">{hint}</div>}
    </div>
  );
}
