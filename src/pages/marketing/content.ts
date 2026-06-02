/**
 * src/pages/marketing/content.ts — static, typed copy & tokens for the public
 * marketing landing.
 *
 * Compliance (Requirement 19): every string here is honest. NO fabricated
 * trust signals (no fake logos, testimonials, user counts, or invented
 * performance stats) and NO outcome promises. Credibility comes only from real
 * methodology — Monte-Carlo resampling, walk-forward out-of-sample validation,
 * SR 11-7 model validation, and EVT tail analysis. The single dollar figures in
 * the hero are LABELED as an illustrative example, never a guarantee.
 */
import type { ComponentType } from 'react';
import {
  Target,
  LineChart,
  ShieldAlert,
  Upload,
  Activity,
  Gauge,
} from 'lucide-react';

/** Lucide icons render as components; this is the shared minimal shape. */
export type IconType = ComponentType<{ className?: string }>;

export interface AccentStyle {
  border: string;
  text: string;
}

/** Mirror EmptyHero's accent map so the two surfaces read as one product.
 *  Fluid Analytical: the trio reads ion-mint / bright-mint / amber (no violet). */
export const ACCENT: Record<'blue' | 'magenta' | 'amber', AccentStyle> = {
  blue: { border: 'border-[rgba(70,230,200,0.30)]', text: 'text-[var(--accent-mint)]' },
  magenta: { border: 'border-[rgba(95,243,214,0.30)]', text: 'text-[var(--accent-mint-bright)]' },
  amber: { border: 'border-[rgba(205,161,60,0.30)]', text: 'text-[var(--accent-amber)]' },
};

/** Brand-gradient fill, applied inline exactly as EmptyHero does. */
export const BRAND_GRADIENT = { background: 'var(--gradient-brand)' } as const;

// ── What-it-does trio (prop-first). Reuses the spirit of EmptyHero copy. ──
export interface Feature {
  icon: IconType;
  title: string;
  body: string;
  accent: keyof typeof ACCENT;
}

export const FEATURES: readonly Feature[] = [
  {
    icon: Target,
    title: 'Pass probability',
    body:
      'Monte-Carlo your own trade tape through thousands of simulated challenge runs and see your modeled odds of hitting target before max drawdown trips you out.',
    accent: 'blue',
  },
  {
    icon: LineChart,
    title: 'Edge reality check',
    body:
      'A walk-forward out-of-sample test on a 70/30 holdout answers the only question that matters: is your edge real, or did your backtest just get lucky?',
    accent: 'magenta',
  },
  {
    icon: ShieldAlert,
    title: 'Tail & ruin risk',
    body:
      'EVT tail extrapolation and probability-of-ruin estimate how bad an unseen losing streak could get, beyond your worst historical day.',
    accent: 'amber',
  },
];

// ── How it works — three honest steps. ──
export interface Step {
  icon: IconType;
  title: string;
  body: string;
}

export const STEPS: readonly Step[] = [
  {
    icon: Upload,
    title: 'Upload your CSV',
    body: 'Drop your trade tape in. NinjaTrader Grid exports are auto-detected; generic PnL columns work too.',
  },
  {
    icon: Activity,
    title: 'Monte Carlo runs the gauntlet',
    body: 'Thousands of simulated challenge runs are resampled from your own trades, order shuffled, paths drawn.',
  },
  {
    icon: Gauge,
    title: 'Get your pass-odds & verdict',
    body: 'Read your modeled pass probability alongside an honest out-of-sample edge verdict and tail-risk picture.',
  },
];

// ── FAQ — real questions, honest answers, no marketing spin. ──
export interface Faq {
  q: string;
  a: string;
}

export const FAQS: readonly Faq[] = [
  {
    q: 'Where does my trade data go?',
    a:
      'Nowhere. Everything runs locally in your browser. Your trades never leave your machine. Results persist only in your own local IndexedDB, on your device.',
  },
  {
    q: 'Which prop firms are supported?',
    a:
      'Challenge presets are built in for TopOneFutures, FTMO, and Apex: profit target, max drawdown, and daily-loss rules, so the simulation models the ruleset you actually trade under.',
  },
  {
    q: 'What CSV formats can I upload?',
    a:
      'NinjaTrader Grid exports are auto-detected. Generic CSVs with a numeric realized-PnL column also work; for portfolios, one numeric PnL column per strategy with rows aligned by trade index.',
  },
  {
    q: 'Is this financial advice?',
    a:
      'No. Results are modeled from Monte-Carlo resampling of your own past trades. They are not a prediction of future results and not financial advice.',
  },
];

/** The compliance disclaimer, shown in the footer. */
export const DISCLAIMER =
  'Modeled from Monte-Carlo resampling of your own past trades. Not a prediction of future results and not financial advice.';
