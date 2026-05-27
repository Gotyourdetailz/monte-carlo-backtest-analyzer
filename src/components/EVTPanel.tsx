import type { EVTReport } from '../evt';

type Props = {
  evt: EVTReport;
};

function $fmt(v: number): string {
  if (!isFinite(v)) return '—';
  return `$${Math.round(v).toLocaleString()}`;
}

export function EVTPanel({ evt }: Props) {
  const { hill, gpd, heavyTail, note } = evt;

  return (
    <div className="glass-card panel-enter overflow-hidden">
      <div className="px-6 py-4 border-b border-[#30363d]/50 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[var(--accent-blue)] uppercase font-bold tracking-wider">
            Extreme Value Theory — Loss Tail
          </span>
          <span className={`badge ${heavyTail ? 'badge-amber' : 'badge-green'}`}>
            {heavyTail ? 'Heavy tail' : 'Tail behaved'}
          </span>
        </div>
        <span className="text-[10px] text-[var(--text-secondary)] opacity-60 max-w-[60%] text-right">
          {note}
        </span>
      </div>

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat
            label="Hill α (tail index)"
            value={isFinite(hill.alpha) ? hill.alpha.toFixed(2) : '—'}
            hint={`upper ${hill.k} order stats`}
          />
          <Stat
            label="GPD ξ (shape)"
            value={gpd ? gpd.xi.toFixed(3) : '—'}
            hint={gpd ? `${gpd.nu} exceedances` : 'insufficient losses'}
          />
          <Stat
            label="GPD β (scale)"
            value={gpd ? `$${gpd.beta.toFixed(0)}` : '—'}
            hint={gpd ? `threshold $${gpd.threshold.toFixed(0)}` : ''}
          />
          <Stat
            label="Threshold quantile"
            value={gpd ? `${(gpd.thresholdQuantile * 100).toFixed(0)}%` : '—'}
            hint="of loss distribution"
          />
        </div>

        <div className="border border-[#30363d]/60 rounded-lg overflow-hidden">
          <div className="grid grid-cols-3 text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold border-b border-[#30363d]/60 px-4 py-2">
            <div>Confidence</div>
            <div>Empirical</div>
            <div>EVT (POT-GPD)</div>
          </div>
          <Row label="VaR 95%" emp={evt.varEmpirical95} ev={evt.varEvt95} />
          <Row label="CVaR 95%" emp={evt.cvarEmpirical95} ev={evt.cvarEvt95} />
          <Row label="VaR 99%" emp={evt.varEmpirical99} ev={evt.varEvt99} />
          <Row label="CVaR 99%" emp={evt.cvarEmpirical99} ev={evt.cvarEvt99} last />
        </div>

        <p className="text-[10px] text-[var(--text-secondary)] opacity-70 leading-snug">
          Extreme losses can be heavier than the empirical sample suggests. EVT extrapolates beyond the worst observed
          loss using a parametric model fit to peaks above a high threshold. Wide gaps between Empirical and EVT in the
          99% column indicate that historical worst-case is an underestimate.
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

function Row({ label, emp, ev, last = false }: { label: string; emp: number; ev: number; last?: boolean }) {
  return (
    <div className={`grid grid-cols-3 px-4 py-2 text-xs ${!last ? 'border-b border-[#30363d]/40' : ''}`}>
      <div className="text-[var(--text-secondary)]">{label}</div>
      <div className="metric-value text-[var(--accent-red)]">{$fmt(emp)}</div>
      <div className="metric-value text-[var(--accent-amber)]">{$fmt(ev)}</div>
    </div>
  );
}
