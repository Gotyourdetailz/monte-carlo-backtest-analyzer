import { AlertTriangle } from 'lucide-react';
import { PortfolioRegimeBreakdown } from '../types';
import { regimeSegmentLabel } from '../regimeSegmentation';
import { cn } from '../lib/utils';

type Props = {
  breakdown: PortfolioRegimeBreakdown[];
  /**
   * Regime IDs whose Cholesky factorization fell back to an identity matrix
   * because the regime had insufficient data (Requirement 4.8 — F-CQ-13).
   * Rendered as visible pills above the breakdown table.
   */
  fallbackRegimes?: string[];
};

export function PortfolioRegimePanel({ breakdown, fallbackRegimes }: Props) {
  const hasFallbacks = !!fallbackRegimes && fallbackRegimes.length > 0;
  if (!breakdown.length && !hasFallbacks) return null;

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--border)]">
        <span className="text-[10px] text-[var(--accent-blue)] uppercase font-bold tracking-wider">
          Portfolio regime breakdown
        </span>
        <p className="text-[10px] text-[var(--text-secondary)] mt-1">
          Separate Gaussian-copula runs per segment (full portfolio run above unchanged).
        </p>
        <p className="text-[10px] text-[var(--text-secondary)] mt-1 opacity-80">
          Note: when the &quot;Dynamic Copula&quot; portfolio resampling is selected, its regime label at each step is the first sleeve&apos;s <code>data[t].segment</code> as a proxy for a portfolio-level regime. A truer alternative — cross-sectional dispersion or a Markov chain fitted on the equally-weighted portfolio PnL — is planned.
        </p>
      </div>

      {hasFallbacks && (
        <div className="px-6 pt-4 flex flex-wrap gap-2">
          {fallbackRegimes!.map((regimeId) => {
            const label = regimeSegmentLabel(regimeId) || regimeId;
            return (
              <span
                key={regimeId}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono bg-[#d29922]/10 border border-[#d29922]/40 text-[#f2cc60]"
                title={`Regime ${label} had fewer than 2 aligned rows (or its Cholesky failed); the dynamic copula fell back to an independent (identity) correlation matrix for this regime.`}
              >
                <AlertTriangle className="w-3 h-3 shrink-0" />
                regime {label} has insufficient data, fallback to independent
              </span>
            );
          })}
        </div>
      )}

      {breakdown.length > 0 && (
        <div className="p-6 overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-[var(--text-secondary)] text-left border-b border-[var(--border)]">
                <th className="pb-2 pr-4">Regime</th>
                <th className="pb-2 pr-4">Trades</th>
                <th className="pb-2 pr-4">Mean PnL</th>
                <th className="pb-2 pr-4">Win %</th>
                <th className="pb-2 pr-4">VaR 95%</th>
                <th className="pb-2 pr-4">CVaR 95%</th>
                <th className="pb-2">Ruin %</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((row) => (
                <tr key={row.segmentId} className="border-b border-[var(--border)]/50 text-[#c9d1d9]">
                  <td className="py-2 pr-4">{row.label}</td>
                  <td className="py-2 pr-4">{row.tradeCount}</td>
                  <td className={cn('py-2 pr-4', row.meanPnL >= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]')}>
                    ${Math.round(row.meanPnL).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">{row.winRate.toFixed(1)}%</td>
                  <td className="py-2 pr-4">${Math.round(row.var95).toLocaleString()}</td>
                  <td className="py-2 pr-4">${Math.round(row.cvar95).toLocaleString()}</td>
                  <td className="py-2">{row.ruinProbability.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
