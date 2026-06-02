import { Upload, Trophy, Target, LineChart, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils';
import { EARLY_ACCESS_URL, isEarlyAccessEnabled, trackEvent } from '../config';
import { useTheme } from '../theme/ThemeProvider';
import { EdgeScopeHero } from './bench/EdgeScopeHero';

type Props = {
  hasFile: boolean;
  isPortfolio: boolean;
};

const FEATURES = [
  {
    icon: Target,
    title: 'Pass probability',
    body: 'Monte-Carlo your own trade tape through thousands of simulated challenges — see your odds of hitting target before max drawdown trips you out.',
    accent: 'blue',
  },
  {
    icon: LineChart,
    title: 'Edge reality check',
    body: 'A walk-forward out-of-sample test on a 70/30 holdout answers the only question that matters: is your edge real, or did your backtest just get lucky?',
    accent: 'magenta',
  },
  {
    icon: ShieldAlert,
    title: 'Tail & ruin risk',
    body: 'EVT tail extrapolation and probability-of-ruin show how bad an unseen losing streak could really get — beyond your worst historical day.',
    accent: 'amber',
  },
];

const ACCENT: Record<string, { border: string; text: string }> = {
  blue:    { border: 'border-[rgba(70,230,200,0.30)]', text: 'text-[var(--accent-mint)]' },
  magenta: { border: 'border-[rgba(95,243,214,0.30)]', text: 'text-[var(--accent-mint-bright)]' },
  amber:   { border: 'border-[rgba(205,161,60,0.30)]', text: 'text-[var(--accent-amber)]' },
};

export function EmptyHero({ hasFile, isPortfolio }: Props) {
  const { resolved } = useTheme();
  return (
    <div className="relative min-h-[80vh] flex flex-col items-center justify-center px-6 overflow-hidden">
      <div className="relative z-10 flex flex-col items-center text-center max-w-3xl">
        <div className="badge badge-blue panel-enter panel-enter-1 inline-flex items-center gap-1.5 mb-6">
          <Trophy className="w-3 h-3" />
          FOR FUNDED & PROP-CHALLENGE TRADERS
        </div>

        <h1 className="panel-enter panel-enter-2 font-display text-4xl sm:text-5xl font-semibold tracking-tight mb-4 leading-tight">
          <span className="gradient-text">Will you pass</span>
          <span className="text-[var(--text-primary)]"> your prop challenge?</span>
        </h1>

        <p className="panel-enter panel-enter-3 text-base text-[var(--text-secondary)] max-w-2xl mb-8 leading-relaxed">
          And is your edge real — or just luck? Upload your trade tape and find out.
          {hasFile
            ? isPortfolio
              ? ' Configure your sleeves and weights, then run to see correlated portfolio paths, EVT tails, and walk-forward validation.'
              : ' Configure simulation settings in the sidebar, then run to see VaR/CVaR, model validation, EVT loss-tail, walk-forward OOS scoring, and multi-factor attribution.'
            : isPortfolio
              ? ' Drop in a CSV with one numeric PnL column per strategy (rows aligned by trade index).'
              : ''}
        </p>

        <div className="panel-enter panel-enter-4 flex flex-col items-center gap-4 mb-12">
          <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
            <Upload className="w-4 h-4 text-[var(--accent-blue)]" />
            <span>Drop your CSV in the sidebar or click the upload area</span>
          </div>

          {isEarlyAccessEnabled && (
            <a
              href={EARLY_ACCESS_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('reserve_click', { source: 'hero' })}
              className="panel-enter panel-enter-4 inline-flex items-center gap-2 rounded-lg bg-[var(--accent-mint)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-primary)] transition-colors hover:bg-[var(--accent-mint-bright)]"
            >
              Reserve early access →
            </a>
          )}
        </div>

        {/* The live instrument — the cockpit's signature display. */}
        <div className="panel-enter panel-enter-5 mb-12 w-full">
          <div
            className="bench-root"
            data-bench-theme={resolved}
            style={{ background: 'transparent' }}
          >
            <EdgeScopeHero />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
          {FEATURES.map((f, i) => {
            const a = ACCENT[f.accent];
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className={cn(
                  'glass-card lift-on-hover panel-enter p-5 text-left border',
                  `panel-enter-${5 + i}`,
                  a.border,
                )}
              >
                <Icon className={cn('w-5 h-5 mb-3', a.text)} />
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
