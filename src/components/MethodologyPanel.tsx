import { PortfolioResampling, SamplingMode } from '../types';
import { cn } from '../lib/utils';

type Props = {
  modelType: 'basic' | 'regime' | 'parametric' | 'portfolio' | 'garch';
  samplingMode: SamplingMode;
  portfolioResampling?: PortfolioResampling;
  /** Regime tag source: 'None', 'AUTO', or a CSV column name. Used to disclose AUTO classifier methodology. */
  regimeSource?: string;
  /** Rolling window length (trades) for the AUTO classifier. */
  autoRegimeWindow?: number;
  /** Percentile cutoff (0-100) for the AUTO classifier. */
  autoRegimeThreshold?: number;
};

const MODEL_LABELS: Record<string, { label: string; color: string }> = {
  basic: { label: 'Trade Sequence MC', color: 'badge-blue' },
  regime: { label: 'Regime-Switching', color: 'badge-amber' },
  parametric: { label: 'Parametric (Student-t)', color: 'badge-purple' },
  portfolio: { label: 'Multi-Strategy Portfolio', color: 'badge-green' },
  garch: { label: 'GARCH(1,1)', color: 'badge-amber' },
};

const SAMPLING_LABELS: Record<string, { label: string; color: string }> = {
  permutation: { label: 'Permutation', color: 'badge-amber' },
  bootstrap: { label: 'Bootstrap', color: 'badge-blue' },
  block_bootstrap: { label: 'Block Bootstrap', color: 'badge-purple' },
};

export function MethodologyPanel({
  modelType,
  samplingMode,
  portfolioResampling,
  regimeSource,
  autoRegimeWindow,
  autoRegimeThreshold,
}: Props) {
  const modelDesc =
    modelType === 'portfolio'
      ? portfolioResampling === 'independent'
        ? 'Independent portfolio bootstrap: each sleeve draws trades with replacement per step, then sleeves are summed. Correlation matrix is descriptive only.'
        : portfolioResampling === 'student_t_copula'
          ? 'Portfolio Student-t copula bootstrap: synchronized tail events via shared chi-squared factor across strategy sleeves.'
          : portfolioResampling === 'dynamic_copula'
            ? 'Portfolio dynamic copula: per-regime correlation matrices with Markov transitions across regimes. The regime label at each step is taken from the FIRST sleeve\'s `data[t].segment` value as a proxy for a portfolio-level regime — the transition matrix and Cholesky factors are then conditioned on that proxy label.'
            : 'Portfolio Gaussian copula bootstrap: each step draws correlated trade scenarios (Cholesky of the empirical correlation matrix) with replacement, so terminal wealth varies across simulations.'
      : modelType === 'basic'
      ? samplingMode === 'permutation'
        ? 'Permutation Monte Carlo preserves the exact trade multiset and reorders sequence risk.'
        : samplingMode === 'block_bootstrap'
          ? 'Block bootstrap resamples contiguous blocks to preserve volatility clustering (autocorrelation).'
          : 'Bootstrap resampling draws trades with replacement, widening tail outcomes versus permutation.'
      : modelType === 'regime'
        ? 'Regime-switching Markov model samples returns conditional on regime state and empirical transitions.'
        : modelType === 'garch'
          ? 'GARCH(1,1) models time-varying volatility: σ²_t = ω + α·ε²_{t-1} + β·σ²_{t-1}. Parameters fitted via MLE. Innovations can be Gaussian or Student-t based on BIC selection.'
          : 'Parametric MLE-fitted distribution models fat tails from maximum likelihood estimation of the empirical distribution.';

  const showAutoRegimeNote = modelType === 'regime' && regimeSource === 'AUTO';
  const autoRegimeDesc = showAutoRegimeNote
    ? `AUTO regime classifier: each trade is tagged by the rolling raw win rate over the previous ${
        autoRegimeWindow ?? '—'
      } trades (no z-score, no expectancy term). Trades with a rolling win rate at or above the ${
        autoRegimeThreshold ?? '—'
      }th percentile are labeled "Clustered"; the rest are "Dispersed".`
    : null;

  const model = MODEL_LABELS[modelType] || MODEL_LABELS.basic;
  const sampling = SAMPLING_LABELS[samplingMode] || SAMPLING_LABELS.bootstrap;

  return (
    <div className="glass-card animate-slide-in p-5 text-xs text-[var(--text-secondary)] leading-relaxed">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[var(--text-primary)] font-semibold text-sm">Methodology</span>
        <span className={cn('badge', model.color)}>{model.label}</span>
        {/*
          For portfolio mode, the resampling scheme is fully described by
          `portfolioResampling` (Independent / Gaussian / Student-t / Dynamic
          copula). The single-strategy `samplingMode` value is persisted on
          runMeta for audit but has no effect on the portfolio path
          construction, so we don't render it here — that was the unreachable
          "portfolio + permutation" branch noted in F-CQ-32 / Requirement 25.6.
        */}
        {modelType !== 'portfolio' && (
          <span className={cn('badge', sampling.color)}>{sampling.label}</span>
        )}
        {modelType === 'portfolio' && portfolioResampling && (
          <span className="badge badge-purple">
            {portfolioResampling === 'student_t_copula'
              ? 'Student-t Copula'
              : portfolioResampling === 'gaussian_copula'
                ? 'Gaussian Copula'
                : portfolioResampling === 'dynamic_copula'
                  ? 'Dynamic Copula'
                  : 'Independent'}
          </span>
        )}
      </div>
      <p className="mb-2 text-[var(--text-secondary)]">{modelDesc}</p>
      {modelType === 'portfolio' && portfolioResampling === 'dynamic_copula' && (
        <p className="mb-2 text-[var(--text-secondary)] opacity-80">
          Follow-up (planned): replace the first-sleeve proxy with a true portfolio-level regime label — for example, a cross-sectional dispersion / volatility regime computed on the equally-weighted sleeve PnL, or a Markov chain fitted directly to the portfolio return series. Until then, treat the dynamic regime breakdown as conditional on the first sleeve's segmentation.
        </p>
      )}
      {autoRegimeDesc && (
        <p className="mb-2 text-[var(--text-secondary)]">{autoRegimeDesc}</p>
      )}
      <ul className="list-disc pl-4 space-y-1 opacity-70">
        <li>Results describe distribution of outcomes under the chosen resampling assumptions — not forecasts.</li>
        <li>Fixed seeds enable reproducible runs for audit. Note: Core engine uses Rust's StdRng (ChaCha12). Seeded paths will cleanly reproduce in v2.0, but diverge from legacy v1.0 TypeScript paths.</li>
        <li>VaR/CVaR are computed on simulated terminal PnL, consistent with buy-side risk reporting conventions.</li>
        <li>Daily loss limits use synthetic sessions unless trade timestamps are provided (calendar mode planned).</li>
      </ul>
    </div>
  );
}
