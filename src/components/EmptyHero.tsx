import { Upload, ShieldCheck, Activity, BarChart3, Sparkles } from 'lucide-react';

type Props = {
  hasFile: boolean;
  isPortfolio: boolean;
};

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'SR 11-7 Validation',
    body: 'KS, Anderson-Darling, Ljung-Box, Kupiec, Christoffersen, PIT — every diagnostic a model-risk validator asks for.',
    accent: 'green',
  },
  {
    icon: Activity,
    title: 'Walk-Forward & EVT',
    body: 'Out-of-sample scoring on a 70/30 holdout. Hill α + GPD tail extrapolation past the worst observed loss.',
    accent: 'blue',
  },
  {
    icon: BarChart3,
    title: 'Multi-Factor Attribution',
    body: 'Fama-French style regression with HC0 robust SEs. Per-factor t-stats, p-values, and residual volatility.',
    accent: 'purple',
  },
];

const ACCENT: Record<string, { glow: string; border: string; text: string }> = {
  green:  { glow: 'shadow-[0_0_30px_rgba(63,185,80,0.18)]',  border: 'border-[rgba(63,185,80,0.25)]',  text: 'text-[var(--accent-green)]' },
  blue:   { glow: 'shadow-[0_0_30px_rgba(88,166,255,0.18)]', border: 'border-[rgba(88,166,255,0.25)]', text: 'text-[var(--accent-blue)]' },
  purple: { glow: 'shadow-[0_0_30px_rgba(210,168,255,0.18)]', border: 'border-[rgba(210,168,255,0.25)]', text: 'text-[var(--accent-purple)]' },
};

export function EmptyHero({ hasFile, isPortfolio }: Props) {
  return (
    <div className="relative min-h-[80vh] flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="hero-orbs" aria-hidden="true">
        <span className="hero-orb hero-orb-blue" />
        <span className="hero-orb hero-orb-green" />
        <span className="hero-orb hero-orb-purple" />
      </div>

      {/* Subtle dotted grid */}
      <div className="hero-grid" aria-hidden="true" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-3xl">
        <div className="badge badge-blue panel-enter panel-enter-1 inline-flex items-center gap-1.5 mb-6">
          <Sparkles className="w-3 h-3" />
          INSTITUTIONAL-GRADE MONTE CARLO
        </div>

        <h1 className="panel-enter panel-enter-2 text-4xl sm:text-5xl font-semibold tracking-tight mb-4 leading-tight">
          <span className="gradient-text">Risk diagnostics</span>
          <span className="text-[var(--text-primary)]"> for trading backtests</span>
        </h1>

        <p className="panel-enter panel-enter-3 text-base text-[var(--text-secondary)] max-w-2xl mb-8 leading-relaxed">
          {hasFile
            ? isPortfolio
              ? 'Configure your sleeves and weights, then run the simulation to see correlated portfolio paths, EVT tails, and walk-forward validation.'
              : 'Configure simulation settings in the sidebar, then run to see VaR/CVaR, model validation, EVT loss-tail, walk-forward OOS scoring, and multi-factor attribution.'
            : isPortfolio
              ? 'Upload a CSV with one numeric PnL column per strategy (rows aligned by trade index).'
              : 'Upload a backtest CSV with a numeric PnL column to begin.'}
        </p>

        <div className="panel-enter panel-enter-4 flex items-center gap-3 mb-12 text-xs text-[var(--text-secondary)]">
          <Upload className="w-4 h-4 text-[var(--accent-blue)]" />
          <span>Drop your CSV in the sidebar or click the upload area</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
          {FEATURES.map((f, i) => {
            const a = ACCENT[f.accent];
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className={`glass-card lift-on-hover panel-enter panel-enter-${5 + i} p-5 text-left border ${a.border} ${a.glow}`}
              >
                <Icon className={`w-5 h-5 mb-3 ${a.text}`} />
                <div className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">{f.title}</div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{f.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
