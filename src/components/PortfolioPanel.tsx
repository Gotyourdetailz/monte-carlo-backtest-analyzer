import { PortfolioStrategyMeta } from '../types';
import { cn } from '../lib/utils';

/**
 * The correlation heatmap dual-encodes the sign and magnitude of each
 * correlation cell so it remains legible to red/green colorblind users:
 *
 *   - sign  → leading glyph (`+` for r ≥ 0.05, `−` for r ≤ −0.05, `≈` for ~0)
 *   - magnitude → font weight (bold for |r| ≥ 0.5)
 *   - background palette is also extended with amber and blue shades so the
 *     color cue is more than just red vs green.
 *
 * This is a baseline accessibility pass only. Full WCAG 2.1 AA validation
 * requires manual testing with assistive technologies and is out of scope
 * here (see Requirement 24 in `.kiro/specs/code-review-remediation`).
 */

type Props = {
  meta: PortfolioStrategyMeta;
};

function corrColor(r: number): string {
  if (r >= 0.7) return 'bg-[var(--accent-red)]';
  if (r >= 0.3) return 'bg-[#d29922]';
  if (r >= -0.3) return 'bg-[var(--border)]';
  if (r >= -0.7) return 'bg-[#388bfd]';
  return 'bg-[var(--accent-blue)]';
}

/** Sign glyph that survives a red/green colorblind filter. */
function corrSignGlyph(r: number): string {
  if (r >= 0.05) return '+';
  if (r <= -0.05) return '−';
  return '≈';
}

/** Bold cells whose absolute correlation is large enough to matter. */
function corrFontWeight(r: number): string {
  return Math.abs(r) >= 0.5 ? 'font-bold' : 'font-normal';
}

export function PortfolioCorrelationMatrix({ meta }: Props) {
  const { strategyNames, correlationMatrix } = meta;

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--border)]">
        <span className="text-[10px] text-[var(--accent-blue)] uppercase font-bold tracking-wider">
          Strategy correlation (aligned trade PnL)
        </span>
        <p className="text-[10px] text-[var(--text-secondary)] mt-1">
          Horizon: {meta.horizonTrades} trades · Resampling:{' '}
          <span className="text-[#c9d1d9] font-mono">
            {meta.resampling === 'gaussian_copula' ? 'Gaussian copula' : 'Independent'}
          </span>
          {' · '}Diversification ratio:{' '}
          <span className="text-[var(--accent-green)] font-mono">{meta.diversificationRatio.toFixed(2)}×</span>
        </p>
      </div>
      <div className="p-6 overflow-x-auto">
        <table className="text-xs font-mono w-full max-w-lg">
          <thead>
            <tr>
              <th className="p-2 text-[var(--text-secondary)] text-left" />
              {strategyNames.map((n) => (
                <th key={n} className="p-2 text-[var(--text-secondary)] text-center truncate max-w-[80px]">
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strategyNames.map((rowName, i) => (
              <tr key={rowName}>
                <td className="p-2 text-[#c9d1d9] truncate max-w-[100px]">{rowName}</td>
                {strategyNames.map((_, j) => {
                  const r = correlationMatrix[i][j];
                  const glyph = corrSignGlyph(r);
                  const weight = corrFontWeight(r);
                  return (
                    <td key={j} className="p-1">
                      <div
                        className={cn('rounded px-2 py-1 text-center text-white', weight, corrColor(r))}
                        title={`${rowName} vs ${strategyNames[j]}: ${glyph}${Math.abs(r).toFixed(2)}`}
                        aria-label={`${rowName} vs ${strategyNames[j]} correlation ${r.toFixed(2)}`}
                      >
                        <span aria-hidden="true">{glyph}</span>
                        {Math.abs(r).toFixed(2)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PortfolioStrategyBreakdown({ meta }: Props) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--border)]">
        <span className="text-[10px] text-[var(--accent-blue)] uppercase font-bold tracking-wider">
          Sleeve allocation & solo risk
        </span>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {meta.strategies.map((s) => (
          <div key={s.id} className="border border-[var(--border)] rounded-xl p-4">
            <div className="flex justify-between items-start mb-2">
              <span className="text-sm font-semibold text-white truncate">{s.name}</span>
              <span className="text-[var(--accent-blue)] font-mono text-sm">{(s.weight * 100).toFixed(0)}%</span>
            </div>
            <div className="space-y-1 text-[10px] text-[var(--text-secondary)]">
              <div>Allocated: <span className="text-white font-mono">${Math.round(s.allocatedCapital).toLocaleString()}</span></div>
              <div>Solo max DD: <span className="text-[var(--accent-red)] font-mono">{(s.soloMaxDrawdown * 100).toFixed(1)}%</span></div>
              <div>Solo net PnL: <span className={cn('font-mono', s.soloNetPnL >= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]')}>${Math.round(s.soloNetPnL).toLocaleString()}</span></div>
              <div>Win rate: <span className="text-white font-mono">{s.historicalStats.winRate.toFixed(1)}%</span></div>
              <div>Profit factor: <span className="text-white font-mono">{s.historicalStats.profitFactor === Infinity ? '∞' : s.historicalStats.profitFactor.toFixed(2)}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
