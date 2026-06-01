/**
 * src/pages/Marketing.tsx — public, unauthenticated marketing landing (`/`).
 *
 * The analyzer app lives at `/app`; this page is the front door. It is styled
 * entirely with the shared design tokens (see src/index.css) so it adapts to
 * light/dark automatically and never hardcodes background hex values.
 *
 * Compliance (Requirement 19): NO fabricated trust signals (no fake logos,
 * testimonials, user counts, or invented performance stats) and NO outcome
 * promises. Credibility comes only from real, nameable methodology —
 * Monte-Carlo resampling, walk-forward out-of-sample validation, SR 11-7
 * model validation, and EVT tail analysis. Every probability is framed as
 * MODELED from the user's own past trades, never as a prediction. The single
 * dollar figures in the hero are explicitly labeled an illustrative example.
 *
 * Sections: 1) Top nav  2) Hero  3) What it does  4) How it works
 *           5) Pricing  6) FAQ   7) Footer.
 */
import { Fragment, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import {
  Trophy,
  Target,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Lock,
  Database,
  FileText,
} from 'lucide-react';
import { isEarlyAccessEnabled, SPLINE_SCENE_URL, HERO_MODE } from '../config';
import { useTheme } from '../theme/ThemeProvider';
import { ThemeToggle } from '../components/ThemeToggle';
import { SplineHero } from '../components/SplineHero';
import { BrandHero } from '../components/BrandHero';
import { VideoHero } from '../components/VideoHero';
import { WebglHero } from '../components/WebglHero';
import { selectActiveHeroTier } from '../components/heroLadder';
import {
  ACCENT,
  BRAND_GRADIENT,
  DISCLAIMER,
  FAQS,
  FEATURES,
  STEPS,
} from './marketing/content';
import {
  BeforeAfterCard,
  FaqItem,
  InfoCard,
  PrimaryCta,
  ReserveCta,
  SectionHeading,
} from './marketing/components';

/**
 * Synchronous WebGL capability probe for the Hero_Ladder (Req 3.2 / 3.3).
 *
 * `selectActiveHeroTier` is pure and needs to be told whether a WebGL context
 * can be created so it can pick the WebGL tier or fall through to the
 * theme-appropriate next tier. (`WebglHero` also has its own internal gate, but
 * the ladder must decide which component to mount in the first place.) This
 * creates a throwaway canvas and probes for a context, returning `false` when
 * the DOM is unavailable (SSR / tests) or the probe throws. Side-effect-free
 * and decided once per mount via a `useState` initialiser so it is stable
 * across renders.
 */
function detectWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl') ||
        canvas.getContext('webgl2') ||
        canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

export function Marketing(): ReactElement {
  const { resolved } = useTheme();
  // Probe WebGL availability once (stable across renders) so the pure
  // Hero_Ladder selector can choose the WebGL tier or fall through (Req 3.2/3.3).
  const [hasWebGL] = useState(detectWebGL);
  // Deterministic hero-tier selection from the documented precedence table
  // (Req 3.1–3.4): WebGL → Video/Brand → Spline → Video/Brand.
  const heroTier = selectActiveHeroTier({
    mode: HERO_MODE,
    hasWebGL,
    theme: resolved,
    splineUrl: SPLINE_SCENE_URL,
  });
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* ── 1. Top nav ── */}
      <nav
        aria-label="Primary"
        className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg-primary)]"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span
              className="grid h-7 w-7 place-items-center rounded-md text-white"
              style={BRAND_GRADIENT}
            >
              <Trophy className="h-4 w-4" />
            </span>
            <span className="font-display text-sm font-semibold tracking-tight text-[var(--text-primary)]">
              Monte&nbsp;Carlo <span className="gradient-text">Backtest Analyzer</span>
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <ReserveCta className="hidden sm:inline-flex" />
            <Link
              to="/app"
              className="btn-press inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
              style={BRAND_GRADIENT}
            >
              Launch analyzer
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* ── 2. Hero ── */}
        <section
          aria-labelledby="hero-heading"
          // `isolate` creates a stacking context so the SplineHero's `-z-10`
          // backdrop is contained here and paints above the page background —
          // without it the negative-z layer escapes to the root context and is
          // hidden behind the `bg-[var(--bg-primary)]` wrapper.
          className="relative isolate overflow-hidden px-6 pb-20 pt-16 sm:pt-24"
        >
          {/* Hero backdrop (Req 8 / B5). Selected by the deterministic
              Hero_Ladder (`selectActiveHeroTier`, Req 3.1–3.4): the WebGL 3D
              hero (`VITE_HERO_MODE=webgl` + WebGL available) sits atop a
              capability ladder that falls through to the looping Monte-Carlo
              video (dark theme) / the self-hosted brand canvas cloud (light
              theme); when `VITE_SPLINE_SCENE_URL` is set and Hero_Mode is unset,
              the Spline 3D scene is used instead. All tiers carry their own
              static brand-gradient fallback, honour reduced motion, and stay
              inside this `isolate` slot so the `-z-10` backdrop paints behind
              the hero text (Req 3.5, 6.1–6.3). */}
          {heroTier === 'webgl' ? (
            <WebglHero active />
          ) : heroTier === 'spline' ? (
            <SplineHero />
          ) : heroTier === 'video' ? (
            <VideoHero />
          ) : (
            <BrandHero />
          )}

          <div className="mx-auto max-w-3xl text-center">
            <div className="badge badge-blue panel-enter panel-enter-1 mb-6 inline-flex items-center gap-1.5">
              <Trophy className="h-3 w-3" />
              FOR FUNDED & PROP-CHALLENGE TRADERS
            </div>

            <h1
              id="hero-heading"
              className="panel-enter panel-enter-2 mb-5 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl"
            >
              <span className="gradient-text">Will you pass your prop challenge</span>
              <span className="text-[var(--text-primary)]"> — and is your edge real?</span>
            </h1>

            <p className="panel-enter panel-enter-3 mx-auto mb-8 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)]">
              Your backtest looked great. Here&apos;s the truth on the trades it never saw. Upload
              your trade tape and we model your in-sample edge against a true out-of-sample holdout.
            </p>

            <div className="panel-enter panel-enter-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <PrimaryCta label="Analyze my trade tape" />
              <ReserveCta />
            </div>

            {/* Honest before → after illustration. */}
            <div className="panel-enter panel-enter-5 mt-12">
              <div className="mb-3 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Illustrative example — not a guarantee
              </div>
              <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr]">
                <BeforeAfterCard
                  label="In-sample (backtest)"
                  value="+$42 / trade"
                  caption="What the curve-fit history showed."
                  tone="green"
                  icon={TrendingUp}
                />
                <div className="flex items-center justify-center text-[var(--text-secondary)]">
                  <ArrowRight className="h-5 w-5 rotate-90 sm:rotate-0" />
                </div>
                <BeforeAfterCard
                  label="Out-of-sample (reality)"
                  value="−$11 / trade"
                  caption="What trades it never saw can look like."
                  tone="red"
                  icon={TrendingDown}
                />
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-6">
          <div className="divider-gradient" />
        </div>

        {/* ── 3. What it does ── */}
        <section aria-labelledby="what-heading" className="px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div id="what-heading">
              <SectionHeading
                eyebrow="What it does"
                title="Three answers, straight from your own trades"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {FEATURES.map((f, i) => (
                <Fragment key={f.title}>
                  <InfoCard
                    icon={f.icon}
                    title={f.title}
                    body={f.body}
                    accentText={ACCENT[f.accent].text}
                    accentBorder={ACCENT[f.accent].border}
                    delayClass={`panel-enter-${i + 1}`}
                  />
                </Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* ── 4. How it works ── */}
        <section aria-labelledby="how-heading" className="px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div id="how-heading">
              <SectionHeading
                eyebrow="How it works"
                title="From CSV to a verdict in three steps"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <Fragment key={s.title}>
                  <InfoCard
                    icon={s.icon}
                    title={s.title}
                    body={s.body}
                    accentText="text-[var(--accent-blue)]"
                    eyebrow={`Step ${i + 1}`}
                    delayClass={`panel-enter-${i + 1}`}
                  />
                </Fragment>
              ))}
            </div>
            <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-[var(--text-secondary)]">
              Built on real methodology: Monte-Carlo resampling, walk-forward out-of-sample
              validation, SR 11-7 model validation, and EVT tail analysis.
            </p>
          </div>
        </section>

        {/* ── 5. Pricing ── */}
        <section aria-labelledby="pricing-heading" className="px-6 py-20">
          <div className="mx-auto max-w-2xl">
            <div id="pricing-heading">
              <SectionHeading eyebrow="Pricing" title="Founding price, locked in" />
            </div>
            <div className="glass-card panel-enter panel-enter-1 border border-[rgba(88,166,255,0.30)] p-8 text-center">
              <div className="badge badge-blue mx-auto mb-4 inline-flex items-center gap-1.5">
                <Lock className="h-3 w-3" />
                EARLY ADOPTER
              </div>
              <h3 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                {isEarlyAccessEnabled
                  ? 'Founding price — locked in for early adopters'
                  : 'Free during the demand probe'}
              </h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
                {isEarlyAccessEnabled
                  ? 'Reserve now to lock the founding rate before public launch. No fake countdowns, no anchoring — just an honest early-adopter price.'
                  : 'The analyzer is free to use while we gauge demand. Run your tape, no card required.'}
              </p>
              <ul className="mx-auto mt-6 grid max-w-md gap-2 text-left text-sm text-[var(--text-secondary)]">
                <li className="flex items-start gap-2">
                  <Database className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-blue)]" />
                  Runs entirely in your browser — your trades stay on your machine.
                </li>
                <li className="flex items-start gap-2">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-blue)]" />
                  Prop-firm presets: TopOneFutures, FTMO, Apex.
                </li>
                <li className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-blue)]" />
                  Full model validation, EVT tails, and walk-forward OOS scoring.
                </li>
              </ul>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <PrimaryCta label="Launch the analyzer" />
                <ReserveCta />
              </div>
            </div>
          </div>
        </section>

        {/* ── 6. FAQ ── */}
        <section aria-labelledby="faq-heading" className="px-6 py-20">
          <div className="mx-auto max-w-3xl">
            <div id="faq-heading">
              <SectionHeading eyebrow="FAQ" title="The questions that actually matter" />
            </div>
            <div className="grid grid-cols-1 gap-3">
              {FAQS.map((f) => (
                <Fragment key={f.q}>
                  <FaqItem q={f.q} a={f.a} />
                </Fragment>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ── 7. Footer ── */}
      <footer className="border-t border-[var(--border)] px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-start gap-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[var(--text-secondary)]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Methodology & disclaimer
              </span>
            </div>
            <p className="max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)]">
              {DISCLAIMER}
            </p>
          </div>
          <div className="mt-8 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-secondary)]">
            © {new Date().getFullYear()} Monte Carlo Backtest Analyzer. Modeled probabilities from
            your own trades — for research and education.
          </div>
        </div>
      </footer>
    </div>
  );
}
