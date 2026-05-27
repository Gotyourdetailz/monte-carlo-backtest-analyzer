import { PositionSizingRecommendation } from '../types';

type Props = {
  recommendation: PositionSizingRecommendation;
  startingCapital: number;
};

export function PositionSizingPanel({ recommendation, startingCapital }: Props) {
  const r = recommendation;
  const pct = (r.recommendedScale * 100).toFixed(1);
  const proj = r.projectedAtRecommended;
  const base = r.baselineAtScale1;
  const isOptimal = r.recommendedScale >= 0.9 && r.recommendedScale <= 1.1;

  return (
    <div className={`glass-card animate-fade-in-up overflow-hidden ${isOptimal ? 'glow-border-green' : ''}`}>
      <div className="px-6 py-4 border-b border-[#30363d]/50">
        <span className="text-[10px] text-[var(--accent-green)] uppercase font-bold tracking-wider">
          Position sizing guardrails (parametric)
        </span>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap gap-6 items-baseline">
          <div>
            <div className="text-[10px] text-[var(--text-secondary)] uppercase mb-1">Recommended scale</div>
            <div className={`text-3xl metric-value animate-count-up ${isOptimal ? 'gradient-text-green' : 'text-[var(--accent-amber)]'}`}>{pct}%</div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-secondary)] uppercase mb-1">At 100% (baseline)</div>
            <div className="text-sm text-[var(--text-primary)] metric-value animate-count-up stagger-2">
              Ruin {base.ruinProbability.toFixed(2)}% · CVaR ${Math.round(base.cvar95).toLocaleString()} · σ $
              {Math.round(base.stdTerminalPnL).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-secondary)] uppercase mb-1">At recommended scale</div>
            <div className="text-sm text-[var(--accent-blue)] metric-value animate-count-up stagger-3">
              Ruin {proj.ruinProbability.toFixed(2)}% · CVaR ${Math.round(proj.cvar95).toLocaleString()} · σ $
              {Math.round(proj.stdTerminalPnL).toLocaleString()} · mean $
              {Math.round(proj.meanTerminalPnL).toLocaleString()}
            </div>
          </div>
        </div>
        <p className="text-xs text-[var(--text-primary)] leading-relaxed border-l-2 border-[var(--accent-green)] pl-3">
          {r.summary}
        </p>
        <p className="text-[10px] text-[var(--text-secondary)] opacity-60">
          Targets: ruin &lt; 2%, CVaR 95% better than −{Math.round(0.3 * startingCapital).toLocaleString()} (30%
          of ${startingCapital.toLocaleString()} account), σ(terminal PnL) &lt; 1.5× |mean|.
        </p>
      </div>
    </div>
  );
}
