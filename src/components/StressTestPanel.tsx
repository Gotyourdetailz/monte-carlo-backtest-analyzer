import { StressTestResult } from '../stressTesting';
import { Shield, ShieldAlert, ShieldX, Skull } from 'lucide-react';

type Props = {
  stressResult: StressTestResult;
  startingCapital: number;
};

const SEVERITY_STYLES: Record<string, { icon: typeof Shield; color: string; badgeClass: string }> = {
  low: { icon: Shield, color: 'text-[var(--accent-green)]', badgeClass: 'badge-green' },
  medium: { icon: ShieldAlert, color: 'text-[var(--accent-amber)]', badgeClass: 'badge-amber' },
  high: { icon: ShieldAlert, color: 'text-[var(--accent-red)]', badgeClass: 'badge-red' },
  extreme: { icon: Skull, color: 'text-[var(--accent-red)]', badgeClass: 'badge-red' },
};

export function StressTestPanel({ stressResult, startingCapital }: Props) {
  const { scenarios, worstSurvivable } = stressResult;
  const passCount = scenarios.filter(s => s.survives).length;
  const totalCount = scenarios.length;
  const passRate = ((passCount / totalCount) * 100).toFixed(0);

  const passColor = Number(passRate) >= 80 ? 'text-[var(--accent-green)]' :
    Number(passRate) >= 50 ? 'text-[var(--accent-amber)]' : 'text-[var(--accent-red)]';

  return (
    <div className="glass-card animate-fade-in-up overflow-hidden">
      <div className="px-6 py-4 border-b border-[#30363d]/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[var(--accent-red)] uppercase font-bold tracking-wider">
            Stress Testing
          </span>
          <span className={`badge ${Number(passRate) >= 80 ? 'badge-green' : Number(passRate) >= 50 ? 'badge-amber' : 'badge-red'}`}>
            {passCount}/{totalCount} Survived
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] text-[var(--text-secondary)] uppercase">Survival Rate</div>
            <div className={`text-lg metric-value animate-count-up ${passColor}`}>{passRate}%</div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--bg-elevated)] text-[10px] uppercase text-[var(--text-secondary)]">
            <tr>
              <th className="px-6 py-3 font-semibold">Scenario</th>
              <th className="px-6 py-3 font-semibold">Severity</th>
              <th className="px-6 py-3 font-semibold text-right">Terminal Capital</th>
              <th className="px-6 py-3 font-semibold text-right">Max DD</th>
              <th className="px-6 py-3 font-semibold text-right">PnL Impact</th>
              <th className="px-6 py-3 font-semibold text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#30363d]/30">
            {scenarios.map((scenario, i) => {
              const style = SEVERITY_STYLES[scenario.severity];
              const Icon = style.icon;
              const pnlImpact = scenario.capitalAfter - startingCapital;

              return (
                <tr
                  key={i}
                  className="hover:bg-white/[0.02] transition-colors duration-150"
                >
                  <td className="px-6 py-3">
                    <div className="text-[var(--text-primary)] font-medium">{scenario.name}</div>
                    <div className="text-[10px] text-[var(--text-secondary)] mt-0.5 max-w-xs">{scenario.description}</div>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`badge ${style.badgeClass} flex items-center gap-1 w-fit`}>
                      <Icon className="w-3 h-3" />
                      {scenario.severity}
                    </span>
                  </td>
                  <td className="px-6 py-3 metric-value text-right">
                    <span className={scenario.capitalAfter < startingCapital ? 'text-[var(--accent-red)]' : 'text-[var(--accent-green)]'}>
                      ${Math.round(scenario.capitalAfter).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-3 metric-value text-right">
                    <span className={scenario.maxDrawdown > 0.3 ? 'text-[var(--accent-red)]' : scenario.maxDrawdown > 0.15 ? 'text-[var(--accent-amber)]' : 'text-[var(--text-primary)]'}>
                      {(scenario.maxDrawdown * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-3 metric-value text-right">
                    <span className={pnlImpact < 0 ? 'text-[var(--accent-red)]' : 'text-[var(--accent-green)]'}>
                      {pnlImpact >= 0 ? '+' : ''}${Math.round(pnlImpact).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${scenario.survives ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)]' : 'bg-[var(--accent-red)]/20 text-[var(--accent-red)]'}`}>
                      {scenario.survives ? '✓' : '✗'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {worstSurvivable && (
        <div className="px-6 py-4 border-t border-[#30363d]/50 text-xs text-[var(--text-secondary)]">
          <span className="text-[var(--text-primary)] font-semibold">Worst survivable scenario:</span>{' '}
          {worstSurvivable.name} — Max DD {(worstSurvivable.maxDrawdown * 100).toFixed(1)}%, Terminal ${Math.round(worstSurvivable.capitalAfter).toLocaleString()}
        </div>
      )}
    </div>
  );
}
