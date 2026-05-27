import type { TimestampAnalyticsReport } from '../timestampAnalytics';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type Props = {
  report: TimestampAnalyticsReport;
  /** Optional dollar daily-loss limit (e.g. prop-firm rule) to estimate breach count. */
  dailyLossLimit?: number;
};

function $fmt(v: number): string {
  if (!isFinite(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

export function TimestampAnalyticsPanel({ report, dailyLossLimit }: Props) {
  const breaches =
    dailyLossLimit && dailyLossLimit > 0
      ? report.estimatedDailyLimitBreaches(dailyLossLimit)
      : null;

  const dowData = report.byDayOfWeek.map((d) => ({
    label: d.label,
    avgPnL: Math.round(d.avgPnL),
    winRate: d.winRate,
    days: d.days,
  }));

  return (
    <div className="glass-card animate-fade-in-up overflow-hidden">
      <div className="px-6 py-4 border-b border-[#30363d]/50 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[var(--accent-blue)] uppercase font-bold tracking-wider">
            Calendar-aware Analytics
          </span>
          <span className="badge badge-blue">{report.tradingDays.toLocaleString()} trading days</span>
        </div>
        <span className="text-[10px] text-[var(--text-secondary)] opacity-60">
          Daily Sharpe (annualised): {report.dailySharpe.toFixed(2)}
        </span>
      </div>

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Win days" value={`${report.winDays} / ${report.tradingDays}`} />
          <Stat label="Loss days" value={`${report.lossDays} / ${report.tradingDays}`} />
          <Stat label="Best day" value={$fmt(report.bestDay?.pnl ?? 0)} hint={report.bestDay?.date} />
          <Stat
            label="Worst day"
            value={$fmt(report.worstDay?.pnl ?? 0)}
            hint={report.worstDay?.date}
            negative
          />
          <Stat label="Daily mean" value={$fmt(report.dailyMean)} />
          <Stat label="Daily σ" value={$fmt(report.dailyStd)} />
          <Stat label="Max losing streak" value={`${report.maxLosingDayStreak} days`} negative={report.maxLosingDayStreak >= 5} />
          <Stat label="Max winning streak" value={`${report.maxWinningDayStreak} days`} />
        </div>

        {breaches != null && (
          <div className="border border-[#30363d]/60 rounded-lg p-3 text-xs flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">
              Days that would breach a ${dailyLossLimit!.toLocaleString()} daily-loss limit
            </span>
            <span
              className={`metric-value ${
                breaches > 0 ? 'text-[var(--accent-red)]' : 'text-[var(--accent-green)]'
              }`}
            >
              {breaches}
            </span>
          </div>
        )}

        {dowData.length > 0 && (
          <div>
            <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-3 font-semibold">
              Day-of-week PnL (avg per day)
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dowData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.4)" />
                  <XAxis dataKey="label" stroke="#8b949e" fontSize={10} />
                  <YAxis stroke="#8b949e" fontSize={10} tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip
                    contentStyle={{
                      background: '#161b22',
                      border: '1px solid #30363d',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                    formatter={(v: number, _name, item) => {
                      const payload = (item as { payload?: { days: number; winRate: number } })
                        .payload;
                      if (!payload) return [`$${v.toLocaleString()}`, 'Avg PnL'];
                      return [
                        `$${v.toLocaleString()} (n=${payload.days}, win ${payload.winRate.toFixed(0)}%)`,
                        'Avg PnL',
                      ];
                    }}
                  />
                  <Bar dataKey="avgPnL">
                    {dowData.map((d) => (
                      <Cell key={d.label} fill={d.avgPnL >= 0 ? '#3fb950' : '#f85149'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  negative,
}: {
  label: string;
  value: string;
  hint?: string;
  negative?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-1">{label}</div>
      <div className={`metric-value text-base ${negative ? 'text-[var(--accent-red)]' : 'text-[var(--text-primary)]'}`}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-[var(--text-secondary)] opacity-60 mt-0.5">{hint}</div>}
    </div>
  );
}
