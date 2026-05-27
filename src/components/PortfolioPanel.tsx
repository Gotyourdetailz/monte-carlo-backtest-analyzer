import { PortfolioStrategyMeta } from '../types';

type Props = {
  meta: PortfolioStrategyMeta;
};

function corrColor(r: number): string {
  if (r >= 0.7) return 'bg-[#f85149]';
  if (r >= 0.3) return 'bg-[#d29922]';
  if (r >= -0.3) return 'bg-[#30363d]';
  if (r >= -0.7) return 'bg-[#388bfd]';
  return 'bg-[#58a6ff]';
}

export function PortfolioCorrelationMatrix({ meta }: Props) {
  const { strategyNames, correlationMatrix } = meta;

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[#30363d]">
        <span className="text-[10px] text-[#58a6ff] uppercase font-bold tracking-wider">
          Strategy correlation (aligned trade PnL)
        </span>
        <p className="text-[10px] text-[#8b949e] mt-1">
          Horizon: {meta.horizonTrades} trades · Resampling:{' '}
          <span className="text-[#c9d1d9] font-mono">
            {meta.resampling === 'gaussian_copula' ? 'Gaussian copula' : 'Independent'}
          </span>
          {' · '}Diversification ratio:{' '}
          <span className="text-[#3fb950] font-mono">{meta.diversificationRatio.toFixed(2)}×</span>
        </p>
      </div>
      <div className="p-6 overflow-x-auto">
        <table className="text-xs font-mono w-full max-w-lg">
          <thead>
            <tr>
              <th className="p-2 text-[#8b949e] text-left" />
              {strategyNames.map((n) => (
                <th key={n} className="p-2 text-[#8b949e] text-center truncate max-w-[80px]">
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strategyNames.map((rowName, i) => (
              <tr key={rowName}>
                <td className="p-2 text-[#c9d1d9] truncate max-w-[100px]">{rowName}</td>
                {strategyNames.map((_, j) => (
                  <td key={j} className="p-1">
                    <div
                      className={`rounded px-2 py-1 text-center text-white ${corrColor(correlationMatrix[i][j])}`}
                      title={`${rowName} vs ${strategyNames[j]}`}
                    >
                      {correlationMatrix[i][j].toFixed(2)}
                    </div>
                  </td>
                ))}
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
    <div className="bg-[#0d1117] border border-[#30363d] rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[#30363d]">
        <span className="text-[10px] text-[#58a6ff] uppercase font-bold tracking-wider">
          Sleeve allocation & solo risk
        </span>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {meta.strategies.map((s) => (
          <div key={s.id} className="border border-[#30363d] rounded-xl p-4">
            <div className="flex justify-between items-start mb-2">
              <span className="text-sm font-semibold text-white truncate">{s.name}</span>
              <span className="text-[#58a6ff] font-mono text-sm">{(s.weight * 100).toFixed(0)}%</span>
            </div>
            <div className="space-y-1 text-[10px] text-[#8b949e]">
              <div>Allocated: <span className="text-white font-mono">${Math.round(s.allocatedCapital).toLocaleString()}</span></div>
              <div>Solo max DD: <span className="text-[#f85149] font-mono">{(s.soloMaxDrawdown * 100).toFixed(1)}%</span></div>
              <div>Solo net PnL: <span className={`font-mono ${s.soloNetPnL >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>${Math.round(s.soloNetPnL).toLocaleString()}</span></div>
              <div>Win rate: <span className="text-white font-mono">{s.historicalStats.winRate.toFixed(1)}%</span></div>
              <div>Profit factor: <span className="text-white font-mono">{s.historicalStats.profitFactor === Infinity ? '∞' : s.historicalStats.profitFactor.toFixed(2)}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
