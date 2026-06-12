/**
 * src/lang/terms.ts — the plain-English ⇄ quant-term dictionary.
 *
 * Most prop-challenge traders are not quants. In `plain` mode every headline
 * label reads like a trader talks ("Odds of blowing up"), with the formal
 * term tucked into the hint so the vocabulary still teaches itself. `pro`
 * mode keeps the institutional nomenclature. Numbers, math, and exports are
 * NEVER affected — only display copy. The PDF tear sheet intentionally stays
 * in pro language regardless of mode.
 *
 * Pure module (no React) so it can be unit-tested and tree-shaken; the
 * persistence + context layer lives in src/lang/LanguageProvider.tsx.
 */

export type LangMode = 'plain' | 'pro';

export const LANG_STORAGE_KEY = 'mc-lang-mode';
export const DEFAULT_LANG_MODE: LangMode = 'plain';

export interface TermText {
  label: string;
  hint?: string;
}

interface TermDef {
  pro: TermText;
  plain: TermText;
}

const TERMS = {
  // ── Panel titles ──────────────────────────────────────────────────
  instSummary: {
    pro: { label: 'Institutional Risk Summary' },
    plain: { label: 'The risk picture' },
  },
  empiricalStats: {
    pro: { label: 'Empirical Backtest Metrics' },
    plain: { label: 'Your track record, by the numbers' },
  },
  evtPanel: {
    pro: { label: 'Extreme Value Theory — Loss Tail' },
    plain: { label: 'How bad could it really get?' },
  },
  modelValidationPanel: {
    pro: { label: 'Model Validation (SR 11-7 style)' },
    plain: { label: 'Can you trust this simulation?' },
  },
  walkForwardPanel: {
    pro: { label: 'Walk-Forward / Out-of-Sample Validation' },
    plain: { label: 'Is your edge real? — tested on trades it never saw' },
  },
  convergencePanel: {
    pro: { label: 'Convergence Diagnostics' },
    plain: { label: 'Did we run enough simulations?' },
  },
  balanceDistribution: {
    pro: { label: 'Terminal Account Balance Distribution' },
    plain: { label: 'Where the runs ended up' },
  },
  drawdownDistribution: {
    pro: { label: 'Max Drawdown Distribution' },
    plain: { label: 'How deep the dips went' },
  },
  drawdownDurationPanel: {
    pro: { label: 'Drawdown Duration Analysis' },
    plain: { label: 'Time spent in the hole' },
  },
  propEvalPanel: {
    pro: { label: 'Prop Firm Evaluation Results' },
    plain: { label: 'Your challenge, simulated' },
  },

  // ── Institutional risk metrics ────────────────────────────────────
  var95: {
    pro: { label: 'VaR 95% (PnL)', hint: '5th percentile terminal PnL' },
    plain: { label: 'Bad run (1-in-20)', hint: 'Bottom 5% of ending P&L — the quant term is VaR 95%' },
  },
  var99: {
    pro: { label: 'VaR 99% (PnL)', hint: '1st percentile terminal PnL' },
    plain: { label: 'Very bad run (1-in-100)', hint: 'Bottom 1% of ending P&L — VaR 99%' },
  },
  cvar95: {
    pro: { label: 'CVaR 95%', hint: 'Expected shortfall, worst 5%' },
    plain: { label: 'Worst 5%, averaged', hint: 'When it goes badly, this is the typical damage — CVaR 95%' },
  },
  cvar99: {
    pro: { label: 'CVaR 99%', hint: 'Expected shortfall, worst 1%' },
    plain: { label: 'Worst 1%, averaged', hint: 'The average of the very worst runs — CVaR 99%' },
  },
  probLoss: {
    pro: { label: 'Prob. of Loss' },
    plain: { label: 'Odds you end down', hint: 'Share of simulated runs that finished below break-even' },
  },
  medianTerminal: {
    pro: { label: 'Median Terminal' },
    plain: { label: 'Typical ending balance', hint: 'Half the runs ended above this, half below' },
  },
  medianMaxDd: {
    pro: { label: 'Median Max DD', hint: 'Valid for all sampling modes' },
    plain: { label: 'Typical worst dip', hint: 'The middle run’s biggest peak-to-valley drop' },
  },
  calmar: {
    pro: { label: 'Calmar (median)' },
    plain: { label: 'Return vs worst dip', hint: 'Annualised return ÷ max drawdown — the Calmar ratio' },
  },
  skewness: {
    pro: { label: 'Skewness' },
    plain: { label: 'Result lean', hint: 'Negative: a few big losers drag you. Positive: big winners carry you. (Skewness)' },
  },
  kurtosis: {
    pro: { label: 'Excess Kurtosis' },
    plain: { label: 'Freak-day factor', hint: 'Higher = more extreme days than a normal bell curve (excess kurtosis)' },
  },

  // ── Headline KPI row ──────────────────────────────────────────────
  ruinProb: {
    pro: { label: 'Prob. of Ruin' },
    plain: { label: 'Odds of blowing up' },
  },
  terminalEv: {
    pro: { label: 'Terminal Bal. EV' },
    plain: { label: 'Average ending balance' },
  },
  simMaxDd: {
    pro: { label: 'Simulated Max DD', hint: '95th percentile risk' },
    plain: { label: 'Worst dip (simulated)', hint: '19 of 20 runs stayed shallower than this' },
  },
  histMaxDd: {
    pro: { label: 'Historical Max DD', hint: 'Empirical Drawdown' },
    plain: { label: 'Worst dip (your actual tape)', hint: 'What really happened in your data' },
  },

  // ── Prop evaluation tiles ─────────────────────────────────────────
  passRate: {
    pro: { label: 'Pass Rate' },
    plain: { label: 'Passed the challenge' },
  },
  failDrawdown: {
    pro: { label: 'Failed: Max DD' },
    plain: { label: 'Busted: hit max drawdown' },
  },
  failConsistency: {
    pro: { label: 'Failed: Consistency' },
    plain: { label: 'Busted: consistency rule' },
  },
  failTime: {
    pro: { label: 'Failed: Time/No Target' },
    plain: { label: 'Never reached target' },
  },

  // ── Empirical backtest metrics ────────────────────────────────────
  expectancy: {
    pro: { label: 'Expectancy' },
    plain: { label: 'Avg $ per trade' },
  },
  sharpe: {
    pro: { label: 'Sharpe (ann.)' },
    plain: { label: 'Smoothness score (Sharpe)' },
  },
  sortino: {
    pro: { label: 'Sortino (ann.)' },
    plain: { label: 'Downside smoothness (Sortino)' },
  },
  maxConsecLosses: {
    pro: { label: 'Max Consec. Losses' },
    plain: { label: 'Longest losing streak' },
  },
  kelly: {
    pro: { label: 'Kelly Fraction' },
    plain: { label: 'Math-max bet size (Kelly)' },
  },
  recoveryFactor: {
    pro: { label: 'Recovery Factor' },
    plain: { label: 'Bounce-back ratio' },
  },

  // ── Drawdown duration tiles ───────────────────────────────────────
  medianMaxDuration: {
    pro: { label: 'Median Max Duration' },
    plain: { label: 'Typical longest slump' },
  },
  p95Duration: {
    pro: { label: '95th Pctl Duration' },
    plain: { label: 'Bad-case slump length' },
  },
  timeUnderwater: {
    pro: { label: 'Avg % Time Underwater' },
    plain: { label: 'Time below your high-water mark' },
  },

  // ── Model tabs ────────────────────────────────────────────────────
  tabBasic: {
    pro: { label: 'Trade Sequence MC' },
    plain: { label: 'Shuffle my trades' },
  },
  tabRegime: {
    pro: { label: 'Regime-Switching' },
    plain: { label: 'Market conditions' },
  },
  tabParametric: {
    pro: { label: 'Parametric (Student-t)' },
    plain: { label: 'Fat-tail model' },
  },
  tabPortfolio: {
    pro: { label: 'Multi-Strategy Portfolio' },
    plain: { label: 'Multiple strategies' },
  },
  tabGarch: {
    pro: { label: 'GARCH(1,1)' },
    plain: { label: 'Volatility streaks' },
  },
} satisfies Record<string, TermDef>;

export type TermKey = keyof typeof TERMS;

export function getTerm(mode: LangMode, key: TermKey): TermText {
  return TERMS[key][mode];
}

/** Guarded localStorage read (privacy mode / SSR safe). */
export function loadLangMode(): LangMode {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return DEFAULT_LANG_MODE;
  }
  try {
    const raw = localStorage.getItem(LANG_STORAGE_KEY);
    return raw === 'pro' || raw === 'plain' ? raw : DEFAULT_LANG_MODE;
  } catch {
    return DEFAULT_LANG_MODE;
  }
}

/** Guarded localStorage write. */
export function saveLangMode(mode: LangMode): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, mode);
  } catch {
    // Storage unavailable — mode simply won't persist.
  }
}
