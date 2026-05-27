import { HistoricalStats } from '../types';

type Props = {
  stats: HistoricalStats;
  title?: string;
};

export function HistoricalStatsPanel({ stats, title = 'Empirical Backtest Metrics' }: Props) {
  const items = [
    { label: 'Trades', value: stats.totalTrades.toLocaleString() },
    { label: 'Win Rate', value: `${stats.winRate.toFixed(1)}%`, color: stats.winRate >= 50 ? 'text-[var(--accent-green)]' : stats.winRate >= 30 ? 'text-[var(--accent-amber)]' : 'text-[var(--accent-red)]' },
    { label: 'Profit Factor', value: stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2), color: stats.profitFactor >= 1.5 ? 'text-[var(--accent-green)]' : stats.profitFactor >= 1.0 ? 'text-[var(--accent-amber)]' : 'text-[var(--accent-red)]' },
    { label: 'Expectancy', value: `$${stats.expectancy.toFixed(2)}`, color: stats.expectancy > 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]' },
    { label: 'Sharpe (ann.)', value: stats.sharpeRatio.toFixed(2) },
    { label: 'Sortino (ann.)', value: stats.sortinoRatio.toFixed(2) },
    { label: 'Max Consec. Losses', value: String(stats.maxConsecutiveLosses), color: stats.maxConsecutiveLosses > 10 ? 'text-[var(--accent-red)]' : undefined },
    { label: 'Kelly Fraction', value: `${(stats.kellyCriterion * 100).toFixed(1)}%` },
    { label: 'Recovery Factor', value: stats.recoveryFactor.toFixed(2) },
  ];

  const winRateColor = (wr: number) =>
    wr >= 50 ? 'text-[var(--accent-green)]' : wr >= 30 ? 'text-[var(--accent-amber)]' : 'text-[var(--accent-red)]';

  return (
    <div className="glass-card animate-fade-in-up overflow-hidden">
      <div className="px-6 py-4 border-b border-[#30363d]/50">
        <span className="text-[10px] text-[var(--accent-blue)] uppercase font-bold tracking-wider">{title}</span>
      </div>
      <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {items.map((item, i) => (
          <div key={item.label} className="group rounded-lg p-3 -m-3 transition-colors duration-150 hover:bg-white/[0.02] cursor-default">
            <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 font-semibold">{item.label}</div>
            <div className={`text-lg metric-value animate-count-up stagger-${Math.min(i + 1, 8)} ${item.color || 'text-[var(--text-primary)]'}`}>{item.value}</div>
          </div>
        ))}
      </div>
      
      {stats.byRegime && Object.keys(stats.byRegime).length > 0 && (
        <div className="border-t border-[#30363d]/50 overflow-x-auto">
          <table className="w-full text-left text-sm text-[var(--text-primary)]">
            <thead className="bg-[var(--bg-elevated)] text-[10px] uppercase text-[var(--text-secondary)]">
              <tr>
                <th className="px-6 py-3 font-semibold">Regime</th>
                <th className="px-6 py-3 font-semibold text-right">Trades (N)</th>
                <th className="px-6 py-3 font-semibold text-right">Win Rate</th>
                <th className="px-6 py-3 font-semibold text-right">Expectancy</th>
                <th className="px-6 py-3 font-semibold text-right">Profit Factor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]/30">
              {Object.entries(stats.byRegime).map(([regime, rStats]) => (
                <tr key={regime} className="hover:bg-white/[0.02] transition-colors duration-150">
                  <td className="px-6 py-3 font-medium text-[var(--text-primary)]">
                    <span className="badge badge-blue mr-2">{regime}</span>
                  </td>
                  <td className="px-6 py-3 metric-value text-right">{rStats.totalTrades}</td>
                  <td className={`px-6 py-3 metric-value text-right ${winRateColor(rStats.winRate)}`}>{rStats.winRate.toFixed(1)}%</td>
                  <td className={`px-6 py-3 metric-value text-right ${rStats.expectancy > 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>${rStats.expectancy.toFixed(2)}</td>
                  <td className="px-6 py-3 metric-value text-right">{rStats.profitFactor === Infinity ? '∞' : rStats.profitFactor.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
