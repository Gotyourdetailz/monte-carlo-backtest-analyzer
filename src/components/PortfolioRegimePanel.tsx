import { PortfolioRegimeBreakdown } from '../types';

type Props = {
  breakdown: PortfolioRegimeBreakdown[];
};

export function PortfolioRegimePanel({ breakdown }: Props) {
  if (!breakdown.length) return null;

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[#30363d]">
        <span className="text-[10px] text-[#58a6ff] uppercase font-bold tracking-wider">
          Portfolio regime breakdown
        </span>
        <p className="text-[10px] text-[#8b949e] mt-1">
          Separate Gaussian-copula runs per segment (full portfolio run above unchanged).
        </p>
      </div>
      <div className="p-6 overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-[#8b949e] text-left border-b border-[#30363d]">
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
              <tr key={row.segmentId} className="border-b border-[#30363d]/50 text-[#c9d1d9]">
                <td className="py-2 pr-4">{row.label}</td>
                <td className="py-2 pr-4">{row.tradeCount}</td>
                <td className={`py-2 pr-4 ${row.meanPnL >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
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
    </div>
  );
}
