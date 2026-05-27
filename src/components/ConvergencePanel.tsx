import { ConvergenceResult } from '../convergenceDiagnostics';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

type Props = {
  convergence: ConvergenceResult;
};

const STATUS_COLORS: Record<string, { text: string; badge: string; label: string }> = {
  converged: { text: 'text-[var(--accent-green)]', badge: 'badge-green', label: 'Converged' },
  marginal: { text: 'text-[var(--accent-amber)]', badge: 'badge-amber', label: 'Marginal' },
  not_converged: { text: 'text-[var(--accent-red)]', badge: 'badge-red', label: 'Not Converged — Increase N' },
};

export function ConvergencePanel({ convergence }: Props) {
  const { checkpoints, status } = convergence;
  const statusInfo = STATUS_COLORS[status];

  if (checkpoints.length === 0) {
    return (
      <div className="glass-card animate-fade-in-up p-5 text-xs text-[var(--text-secondary)]">
        <span className="text-[var(--text-primary)] font-semibold text-sm">Convergence Diagnostics</span>
        <p className="mt-2">Insufficient simulations for convergence analysis (need ≥100).</p>
      </div>
    );
  }

  const chartData = checkpoints.map(cp => ({
    n: cp.n,
    'VaR 95%': Math.round(cp.var95),
    'CVaR 95%': Math.round(cp.cvar95),
    'Ruin %': Number(cp.ruinProb.toFixed(2)),
    'Mean Balance': Math.round(cp.meanBalance),
  }));

  // Separate data for dual Y-axis display
  const pnlData = checkpoints.map(cp => ({
    n: cp.n,
    'VaR 95%': Math.round(cp.var95),
    'CVaR 95%': Math.round(cp.cvar95),
  }));

  const ruinData = checkpoints.map(cp => ({
    n: cp.n,
    'Ruin %': Number(cp.ruinProb.toFixed(2)),
  }));

  return (
    <div className="glass-card animate-fade-in-up overflow-hidden">
      <div className="px-6 py-4 border-b border-[#30363d]/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[var(--accent-blue)] uppercase font-bold tracking-wider">
            Convergence Diagnostics
          </span>
          <span className={`badge ${statusInfo.badge}`}>{statusInfo.label}</span>
        </div>
        <span className="text-[10px] metric-value text-[var(--text-secondary)] opacity-60">
          N = {checkpoints[checkpoints.length - 1].n.toLocaleString()}
        </span>
      </div>

      <div className="p-6">
        {/* VaR / CVaR convergence chart */}
        <div className="mb-6">
          <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-3 font-semibold">
            VaR & CVaR Stability
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pnlData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.4)" />
                <XAxis
                  dataKey="n"
                  stroke="#8b949e"
                  fontSize={10}
                  tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)}
                />
                <YAxis
                  stroke="#8b949e"
                  fontSize={10}
                  tickFormatter={(v: number) => `$${v.toLocaleString()}`}
                />
                <Tooltip
                  contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', fontSize: '11px' }}
                  labelFormatter={(v: number) => `N = ${v.toLocaleString()}`}
                  formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]}
                />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Line type="monotone" dataKey="VaR 95%" stroke="#f85149" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="CVaR 95%" stroke="#f0883e" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ruin probability convergence */}
        <div>
          <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-3 font-semibold">
            Ruin Probability Stability
          </div>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ruinData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.4)" />
                <XAxis
                  dataKey="n"
                  stroke="#8b949e"
                  fontSize={10}
                  tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)}
                />
                <YAxis
                  stroke="#8b949e"
                  fontSize={10}
                  tickFormatter={(v: number) => `${v}%`}
                  domain={[0, 'auto']}
                />
                <Tooltip
                  contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', fontSize: '11px' }}
                  labelFormatter={(v: number) => `N = ${v.toLocaleString()}`}
                  formatter={(v: number) => [`${v}%`, undefined]}
                />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Line type="monotone" dataKey="Ruin %" stroke="#d2a8ff" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* SE of mean at final checkpoint */}
        <div className="mt-4 text-[10px] text-[var(--text-secondary)] opacity-60">
          Standard Error of Mean Balance: ±${Math.round(checkpoints[checkpoints.length - 1].seMean).toLocaleString()}
          ({((checkpoints[checkpoints.length - 1].seMean / Math.abs(checkpoints[checkpoints.length - 1].meanBalance)) * 100).toFixed(2)}% of mean)
        </div>
      </div>
    </div>
  );
}
