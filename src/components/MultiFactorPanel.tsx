import type { MultiFactorReport } from '../benchmarkAttribution';

type Props = {
  report: MultiFactorReport;
};

function pct(v: number, d = 2): string {
  if (!isFinite(v)) return '—';
  return `${(v * 100).toFixed(d)}%`;
}

function num(v: number, d = 3): string {
  if (!isFinite(v)) return '—';
  return v.toFixed(d);
}

function fmtP(v: number): string {
  if (!isFinite(v)) return '—';
  if (v < 0.001) return '<0.001';
  return v.toFixed(3);
}

export function MultiFactorPanel({ report }: Props) {
  const alphaSig = report.alphaPValue != null && report.alphaPValue < 0.05;
  return (
    <div className="glass-card panel-enter overflow-hidden">
      <div className="px-6 py-4 border-b border-[#30363d]/50 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[var(--accent-blue)] uppercase font-bold tracking-wider">
            Multi-Factor Attribution
          </span>
          <span className={`badge ${alphaSig ? 'badge-green' : 'badge-amber'}`}>
            {alphaSig ? 'α significant' : 'α not significant'}
          </span>
        </div>
        <span className="text-[10px] text-[var(--text-secondary)] opacity-60">
          n = {report.observations.toLocaleString()} · {report.factors.length} factors · HC0 robust SE
        </span>
      </div>

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Alpha (annualised)" value={pct(report.alphaAnnualized, 2)} hint={`per-period α = ${pct(report.alpha, 4)}`} />
          <Stat label="α t-stat" value={num(report.alphaT, 2)} hint={`p = ${fmtP(report.alphaPValue)}`} />
          <Stat label="R²" value={num(report.rSquared, 3)} hint={`adj R² = ${num(report.adjRSquared, 3)}`} />
          <Stat label="Residual vol (ann.)" value={pct(report.residualVolAnnualized, 2)} hint="factor-neutral risk" />
        </div>

        <div className="border border-[#30363d]/60 rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold border-b border-[#30363d]/60 px-4 py-2">
            <div className="col-span-3">Factor</div>
            <div className="col-span-3 text-right">Coefficient</div>
            <div className="col-span-2 text-right">Std Err (HC0)</div>
            <div className="col-span-2 text-right">t-stat</div>
            <div className="col-span-2 text-right">p-value</div>
          </div>
          {report.factors.map((f) => {
            const sig = f.pValue < 0.05;
            return (
              <div
                key={f.name}
                className="grid grid-cols-12 px-4 py-2 text-xs border-b border-[#30363d]/30 last:border-b-0"
              >
                <div className="col-span-3 text-[var(--text-primary)]">{f.name}</div>
                <div className={`col-span-3 text-right metric-value ${sig ? 'text-[var(--accent-blue)]' : 'text-[var(--text-primary)]'}`}>
                  {num(f.coefficient, 4)}
                </div>
                <div className="col-span-2 text-right metric-value text-[var(--text-secondary)]">{num(f.stdErr, 4)}</div>
                <div className={`col-span-2 text-right metric-value ${Math.abs(f.tStat) >= 2 ? 'text-[var(--accent-blue)]' : 'text-[var(--text-primary)]'}`}>
                  {num(f.tStat, 2)}
                </div>
                <div className={`col-span-2 text-right metric-value ${sig ? 'text-[var(--accent-green)]' : 'text-[var(--text-secondary)]'}`}>
                  {fmtP(f.pValue)}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-[var(--text-secondary)] opacity-70 leading-snug">
          Coefficients are exposures to each factor. |t| ≥ 2 (highlighted) suggests statistically significant
          loading at the 5% level under HC0 standard errors. Alpha is the unexplained per-period excess return
          after factor exposures are accounted for.
        </p>
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
