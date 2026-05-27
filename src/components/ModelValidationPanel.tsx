import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { ReactElement } from 'react';
import type {
  ModelValidationReport,
  TestVerdict,
} from '../modelValidation';

type Props = {
  validation: ModelValidationReport;
};

const VERDICT_STYLE: Record<TestVerdict, { badge: string; icon: ReactElement; label: string }> = {
  pass: {
    badge: 'badge-green',
    icon: <CheckCircle2 className="w-3 h-3" />,
    label: 'Pass',
  },
  warn: {
    badge: 'badge-amber',
    icon: <AlertTriangle className="w-3 h-3" />,
    label: 'Warning',
  },
  fail: {
    badge: 'badge-red',
    icon: <XCircle className="w-3 h-3" />,
    label: 'Fail',
  },
};

function fmtP(p?: number): string {
  if (p == null || !isFinite(p)) return '—';
  if (p < 0.001) return '<0.001';
  return p.toFixed(3);
}

function fmtNum(v?: number, d = 2): string {
  if (v == null || !isFinite(v)) return '—';
  return v.toFixed(d);
}

function VerdictBadge({ v }: { v: TestVerdict }) {
  const s = VERDICT_STYLE[v];
  return (
    <span className={`badge ${s.badge} inline-flex items-center gap-1`}>
      {s.icon}
      {s.label}
    </span>
  );
}

export function ModelValidationPanel({ validation }: Props) {
  const { goodnessOfFit, serialDependence, varBacktest, pitCalibration, overallVerdict, headline } =
    validation;

  return (
    <div className="glass-card animate-fade-in-up overflow-hidden">
      <div className="px-6 py-4 border-b border-[#30363d]/50 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[var(--accent-blue)] uppercase font-bold tracking-wider">
            Model Validation (SR 11-7 style)
          </span>
          <VerdictBadge v={overallVerdict} />
        </div>
        <span className="text-[10px] text-[var(--text-secondary)] opacity-60 max-w-[60%] text-right">
          {headline}
        </span>
      </div>

      <div className="p-6 space-y-5">
        {goodnessOfFit && (
          <Block
            title="Goodness-of-fit (simulator vs empirical bootstrap)"
            verdict={goodnessOfFit.verdict}
            note={goodnessOfFit.note}
            rows={[
              { k: 'Kolmogorov–Smirnov D', v: fmtNum(goodnessOfFit.ksStatistic, 3) },
              { k: 'KS p-value', v: fmtP(goodnessOfFit.ksPValue) },
              { k: 'Anderson–Darling A²', v: fmtNum(goodnessOfFit.adStatistic, 3) },
              { k: 'AD p-value (approx)', v: fmtP(goodnessOfFit.adPValue) },
            ]}
          />
        )}

        {serialDependence && (
          <Block
            title={`Serial dependence (Ljung–Box, ${serialDependence.lags} lags)`}
            verdict={serialDependence.verdict}
            note={serialDependence.note}
            rows={[
              {
                k: 'Empirical Q',
                v: `${fmtNum(serialDependence.empiricalQ, 2)}  (p=${fmtP(serialDependence.empiricalPValue)})`,
              },
              {
                k: 'Simulated Q',
                v: `${fmtNum(serialDependence.simulatedQ, 2)}  (p=${fmtP(serialDependence.simulatedPValue)})`,
              },
            ]}
          />
        )}

        {varBacktest && (
          <Block
            title={`VaR backtest @ ${(varBacktest.confidence * 100).toFixed(0)}% (rolling, 100-obs window)`}
            verdict={varBacktest.verdict}
            note={varBacktest.note}
            rows={[
              {
                k: 'Breaches',
                v: `${varBacktest.breaches} of ${varBacktest.observations}  (expected ${fmtNum(varBacktest.expectedBreaches, 1)})`,
              },
              {
                k: 'Kupiec POF LR',
                v: `${fmtNum(varBacktest.kupiecStatistic, 2)}  (p=${fmtP(varBacktest.kupiecPValue)})`,
              },
              {
                k: 'Christoffersen indep. LR',
                v: `${fmtNum(varBacktest.christoffersenStatistic, 2)}  (p=${fmtP(varBacktest.christoffersenPValue)})`,
              },
            ]}
          />
        )}

        {pitCalibration && (
          <Block
            title={`PIT calibration (chi-square, ${pitCalibration.bins} bins)`}
            verdict={pitCalibration.verdict}
            note={pitCalibration.note}
            rows={[
              { k: 'Chi-square', v: fmtNum(pitCalibration.chiSqStatistic, 2) },
              { k: 'p-value', v: fmtP(pitCalibration.pValue) },
            ]}
          />
        )}

        {!goodnessOfFit && !serialDependence && !varBacktest && !pitCalibration && (
          <p className="text-xs text-[var(--text-secondary)]">
            Insufficient data for model validation. Need ≥130 historical observations and a non-degenerate terminal-PnL distribution.
          </p>
        )}
      </div>
    </div>
  );
}

function Block({
  title,
  verdict,
  note,
  rows,
}: {
  title: string;
  verdict: TestVerdict;
  note: string;
  rows: { k: string; v: string }[];
}) {
  return (
    <div className="border border-[#30363d]/60 rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs text-[var(--text-primary)] font-semibold">{title}</span>
        <VerdictBadge v={verdict} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px] mb-2">
        {rows.map((r) => (
          <div key={r.k} className="flex justify-between">
            <span className="text-[var(--text-secondary)]">{r.k}</span>
            <span className="metric-value text-[var(--text-primary)]">{r.v}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--text-secondary)] opacity-80 leading-snug">{note}</p>
    </div>
  );
}
