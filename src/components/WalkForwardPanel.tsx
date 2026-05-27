import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { ReactElement } from 'react';
import type { WalkForwardReport } from '../walkForward';
import type { TestVerdict } from '../modelValidation';

type Props = {
  report: WalkForwardReport;
};

const VERDICT_STYLE: Record<TestVerdict, { badge: string; icon: ReactElement; label: string }> = {
  pass: { badge: 'badge-green', icon: <CheckCircle2 className="w-3 h-3" />, label: 'Pass' },
  warn: { badge: 'badge-amber', icon: <AlertTriangle className="w-3 h-3" />, label: 'Warning' },
  fail: { badge: 'badge-red',   icon: <XCircle className="w-3 h-3" />,        label: 'Fail' },
};

function fmtP(p: number): string {
  if (!isFinite(p)) return '—';
  if (p < 0.001) return '<0.001';
  return p.toFixed(3);
}

function fmtPct(v: number, d = 1): string {
  if (!isFinite(v)) return '—';
  return `${(v * 100).toFixed(d)}%`;
}

function fmtNum(v: number, d = 2): string {
  if (!isFinite(v)) return '—';
  return v.toFixed(d);
}

export function WalkForwardPanel({ report }: Props) {
  const v = VERDICT_STYLE[report.verdict];
  return (
    <div className="glass-card panel-enter overflow-hidden">
      <div className="px-6 py-4 border-b border-[#30363d]/50 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[var(--accent-blue)] uppercase font-bold tracking-wider">
            Walk-Forward / Out-of-Sample Validation
          </span>
          <span className={`badge ${v.badge} inline-flex items-center gap-1`}>
            {v.icon}
            {v.label}
          </span>
        </div>
        <span className="text-[10px] text-[var(--text-secondary)] opacity-60 max-w-[60%] text-right">
          Train {report.trainSize} → Test {report.oosSize}
        </span>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat
            label="OOS breach rate"
            value={fmtPct(report.breachRate, 1)}
            hint={`expected ${fmtPct(report.expectedBreachRate, 1)}`}
            negative={Math.abs(report.breachRate - report.expectedBreachRate) > 0.03}
          />
          <Stat
            label="Kupiec POF p"
            value={fmtP(report.kupiecPValue)}
            hint={`LR = ${fmtNum(report.kupiecLR, 2)}`}
            negative={report.kupiecPValue < 0.05}
          />
          <Stat
            label="PIT chi-square p"
            value={fmtP(report.pitPValue)}
            hint={`χ² = ${fmtNum(report.pitChiSq, 2)}`}
            negative={report.pitPValue < 0.05}
          />
          <Stat
            label="KS train vs OOS p"
            value={fmtP(report.ksPValue)}
            hint={`D = ${fmtNum(report.ksD, 3)}`}
            negative={report.ksPValue < 0.05}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-[#30363d]/40">
          <Stat label="Train mean" value={`$${report.trainMean.toFixed(0)}`} />
          <Stat label="OOS mean" value={`$${report.oosMean.toFixed(0)}`} />
          <Stat label="Train σ" value={`$${report.trainStd.toFixed(0)}`} />
          <Stat label="OOS σ" value={`$${report.oosStd.toFixed(0)}`} />
        </div>

        <p className="text-[10px] text-[var(--text-secondary)] opacity-80 leading-snug">{report.note}</p>
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
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-1">
        {label}
      </div>
      <div
        className={`metric-value text-base ${
          negative ? 'text-[var(--accent-amber)]' : 'text-[var(--text-primary)]'
        }`}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-[var(--text-secondary)] opacity-60 mt-0.5">{hint}</div>}
    </div>
  );
}
