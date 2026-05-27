import { PortfolioResampling, SamplingMode } from '../types';

type Props = {
  modelType: 'basic' | 'regime' | 'parametric' | 'portfolio' | 'garch';
  samplingMode: SamplingMode;
  portfolioResampling?: PortfolioResampling;
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

export function MethodologyPanel({ modelType, samplingMode, portfolioResampling }: Props) {
  const modelDesc =
    modelType === 'portfolio'
      ? portfolioResampling === 'independent'
        ? 'Independent portfolio bootstrap: each sleeve draws trades with replacement per step, then sleeves are summed. Correlation matrix is descriptive only.'
        : portfolioResampling === 'student_t_copula'
          ? 'Portfolio Student-t copula bootstrap: synchronized tail events via shared chi-squared factor across strategy sleeves.'
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

  const model = MODEL_LABELS[modelType] || MODEL_LABELS.basic;
  const sampling = SAMPLING_LABELS[samplingMode] || SAMPLING_LABELS.bootstrap;

  return (
    <div className="glass-card animate-slide-in p-5 text-xs text-[var(--text-secondary)] leading-relaxed">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[var(--text-primary)] font-semibold text-sm">Methodology</span>
        <span className={`badge ${model.color}`}>{model.label}</span>
        <span className={`badge ${sampling.color}`}>{sampling.label}</span>
        {modelType === 'portfolio' && portfolioResampling && (
          <span className="badge badge-purple">
            {portfolioResampling === 'student_t_copula' ? 'Student-t Copula' : portfolioResampling === 'gaussian_copula' ? 'Gaussian Copula' : 'Independent'}
          </span>
        )}
      </div>
      <p className="mb-2 text-[var(--text-secondary)]">{modelDesc}</p>
      <ul className="list-disc pl-4 space-y-1 opacity-70">
        <li>Results describe distribution of outcomes under the chosen resampling assumptions — not forecasts.</li>
        <li>Fixed seeds enable reproducible runs for audit and allocator review.</li>
        <li>VaR/CVaR are computed on simulated terminal PnL, consistent with buy-side risk reporting conventions.</li>
        <li>Daily loss limits use synthetic sessions unless trade timestamps are provided (calendar mode planned).</li>
      </ul>
    </div>
  );
}
