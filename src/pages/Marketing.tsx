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
 * Editorial system: below-the-fold sections reveal on scroll (Reveal.tsx),
 * numbered mono eyebrows, a methodology marquee, cursor-spotlight cards, and
 * a statement footer. All motion is honest-budget (≤700ms entries) and fully
 * neutralised under prefers-reduced-motion.
 *
 * Sections: 1) Top nav  2) Hero + stats  3) What it does  4) How it works
 *           5) Pricing  6) FAQ   7) Statement footer.
 */
import { Fragment, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Trophy,
  Target,
  ShieldAlert,
  ArrowRight,
  Lock,
  Database,
  FileText,
} from 'lucide-react';
import { isEarlyAccessEnabled } from '../config';
import { useTheme } from '../theme/ThemeProvider';
import { ThemeToggle } from '../components/ThemeToggle';
import { EdgeScopeHero } from '../components/bench/EdgeScopeHero';
import { HeroVideoBackdrop } from '../components/bench/HeroVideoBackdrop';
import { EdgeTrace, PassGauge, TailSpark } from '../components/bench/MiniReadouts';
import { DISCLAIMER, FAQS, STEPS } from './marketing/content';
import {
  DemoCta,
  FaqItem,
  MethodologyMarquee,
  PrimaryCta,
  ReserveCta,
  SectionHeading,
  StatsStrip,
  trackSpotlight,
} from './marketing/components';
import { Reveal } from './marketing/Reveal';

const NAV_LINKS = [
  { href: '#what', label: 'What it does' },
  { href: '#how', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
] as const;

export function Marketing(): ReactElement {
  const { resolved } = useTheme();
  return (
    <div className="min-h-screen overflow-x-hidden text-[var(--text-primary)]">
      {/* Low-opacity Monte-Carlo path-fan behind the whole page; fades on scroll. */}
      <HeroVideoBackdrop />
      {/* Film grain — analogue texture over everything, 4% alpha. */}
      <div className="grain" aria-hidden="true" />
      {/* ── 1. Top nav (glass) ── */}
      <nav
        aria-label="Primary"
        className="glass-panel sticky top-0 z-30 border-x-0 border-t-0"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--accent-mint)] text-[var(--bg-primary)]">
              <Activity className="h-4 w-4" />
            </span>
            <span className="font-display text-base font-semibold tracking-tight text-[var(--text-primary)]">
              Edge<span className="text-[var(--accent-mint)]">Check</span>
            </span>
          </Link>

          <div className="hidden items-center gap-6 lg:flex">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <ReserveCta className="hidden sm:inline-flex" />
            <Link
              to="/app"
              className="btn-press inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[var(--accent-mint)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-primary)] transition-colors hover:bg-[var(--accent-mint-bright)]"
            >
              Launch<span className="hidden sm:inline">&nbsp;analyzer</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* ── 2. Hero — instrument-forward: the EDGE·SCOPE is the spectacle ── */}
        <section
          aria-labelledby="hero-heading"
          className="relative isolate overflow-hidden px-6 pb-24 pt-16 sm:pt-24"
        >
          {/* faint instrument graticule, behind everything */}
          <div
            className="subtle-grid pointer-events-none absolute inset-0 -z-10 opacity-60"
            aria-hidden="true"
          />
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
            <div className="text-center lg:text-left">
              <div className="t-eyebrow panel-enter panel-enter-1 mb-6 inline-flex items-center gap-2 text-[var(--accent-mint)]">
                <Trophy className="h-3.5 w-3.5" />
                For funded &amp; prop-challenge traders
              </div>

              <h1
                id="hero-heading"
                className="panel-enter panel-enter-2 mb-6 font-display text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-[3.4rem] xl:text-[4rem]"
              >
                Will you pass your prop challenge,
                <span className="text-[var(--accent-mint)]"> and is your edge real?</span>
              </h1>

              <p className="panel-enter panel-enter-3 mx-auto mb-9 max-w-xl text-base leading-relaxed text-[var(--text-secondary)] lg:mx-0 lg:text-lg">
                Your backtest looked great. Here&apos;s the truth on the trades it never saw. Upload
                your trade tape and we model your in-sample edge against a true out-of-sample holdout.
              </p>

              <div className="panel-enter panel-enter-4 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                <PrimaryCta label="Analyze my trade tape" />
                <DemoCta />
                <ReserveCta className="sm:hidden xl:inline-flex" />
              </div>
            </div>

            {/* The live instrument — interactive FAIL / PASS / MARGINAL example tape. */}
            <div className="panel-enter panel-enter-3">
              <div className="bench-root" data-bench-theme={resolved} style={{ background: 'transparent' }}>
                <EdgeScopeHero />
              </div>
              <p className="t-label mt-3 text-center text-[var(--text-secondary)] lg:text-right">
                Illustrative example, not a guarantee
              </p>
            </div>
          </div>

          {/* Honest numbers — engine properties, not vanity stats. */}
          <Reveal className="mx-auto mt-20 max-w-6xl">
            <StatsStrip />
          </Reveal>
        </section>

        {/* Methodology ticker — the toolbox, spelled out. */}
        <Reveal>
          <div className="border-y border-[var(--border)]">
            <MethodologyMarquee />
          </div>
        </Reveal>

        {/* ── 3. Three answers — asymmetric, each carries its own readout ── */}
        <section id="what" aria-labelledby="what-heading" className="scroll-mt-24 px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <div id="what-heading">
                <SectionHeading
                  eyebrow="01 · The verdicts"
                  title="Three answers, straight from your own trades"
                  align="left"
                />
              </div>
            </Reveal>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
              {/* Large tile — edge reality check, with its in/out trace */}
              <Reveal>
                <div
                  className="glass-card spotlight-card flex h-full flex-col p-6 sm:p-7"
                  onPointerMove={trackSpotlight}
                >
                  <span className="t-label text-[var(--accent-mint)]">Edge reality check</span>
                  <div className="my-6">
                    <EdgeTrace />
                  </div>
                  <h3 className="font-display text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                    Is your edge real, or did the backtest just get lucky?
                  </h3>
                  <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--text-secondary)]">
                    A walk-forward out-of-sample test on a 70/30 holdout puts your in-sample edge
                    against trades it never saw.
                  </p>
                </div>
              </Reveal>

              {/* Right column — two stacked readouts */}
              <div className="grid grid-cols-1 gap-4">
                <Reveal delay={80}>
                  <div
                    className="glass-card spotlight-card flex h-full flex-col p-6"
                    onPointerMove={trackSpotlight}
                  >
                    <span className="t-label text-[var(--accent-mint)]">Pass probability</span>
                    <div className="mt-4">
                      <PassGauge pct={86} />
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                      Thousands of simulated challenge runs: your odds of hitting target before max
                      drawdown trips you out.
                    </p>
                  </div>
                </Reveal>
                <Reveal delay={160}>
                  <div
                    className="glass-card spotlight-card flex h-full flex-col p-6"
                    onPointerMove={trackSpotlight}
                  >
                    <span className="t-label text-[var(--accent-mint)]">Tail &amp; ruin risk</span>
                    <div className="mt-4">
                      <TailSpark />
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                      EVT tail extrapolation and probability-of-ruin: how bad an unseen losing streak
                      could really get.
                    </p>
                  </div>
                </Reveal>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-6">
          <div className="divider-gradient" />
        </div>

        {/* ── 4. How it works — signal path (CH-01 → CH-02 → CH-03) ── */}
        <section id="how" aria-labelledby="how-heading" className="scroll-mt-24 px-6 py-24">
          <div className="mx-auto max-w-5xl">
            <Reveal>
              <div id="how-heading">
                <SectionHeading
                  eyebrow="02 · The signal path"
                  title="From CSV to a verdict in three steps"
                  align="left"
                />
              </div>
            </Reveal>
            <ol className="relative grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-6">
              {/* connecting rail between channel nodes (desktop only) */}
              <div
                className="pointer-events-none absolute left-0 right-0 top-[6px] hidden h-px md:block"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, var(--glass-border-strong) 14%, var(--glass-border-strong) 86%, transparent)',
                }}
                aria-hidden="true"
              />
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const live = i === 1;
                return (
                  <li key={s.title} className="relative flex flex-col">
                    <Reveal delay={i * 90}>
                      <div className="flex items-center gap-3">
                        <span
                          className="relative z-[1] h-3.5 w-3.5 rounded-full"
                          style={{
                            background: live ? 'var(--accent-mint)' : 'var(--bg-elevated)',
                            boxShadow: live
                              ? '0 0 0 4px var(--bg-primary), 0 0 10px var(--accent-mint)'
                              : 'inset 0 0 0 1px var(--glass-border-strong), 0 0 0 4px var(--bg-primary)',
                          }}
                          aria-hidden="true"
                        />
                        <span className="t-label text-[var(--text-secondary)]">CH-0{i + 1}</span>
                      </div>
                      <div className="mt-5 flex items-center gap-2">
                        <Icon className="h-5 w-5 text-[var(--accent-mint)]" />
                        <h3 className="text-base font-semibold text-[var(--text-primary)]">{s.title}</h3>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{s.body}</p>
                    </Reveal>
                  </li>
                );
              })}
            </ol>
            <Reveal>
              <p className="mx-auto mt-14 max-w-2xl text-center text-xs leading-relaxed text-[var(--text-secondary)]">
                Built on real methodology: Monte-Carlo resampling, walk-forward out-of-sample
                validation, SR 11-7 model validation, and EVT tail analysis.
              </p>
              <div className="mt-8 flex justify-center">
                <DemoCta />
              </div>
            </Reveal>
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-6">
          <div className="divider-gradient" />
        </div>

        {/* ── 5. Pricing ── */}
        <section id="pricing" aria-labelledby="pricing-heading" className="scroll-mt-24 px-6 py-24">
          <div className="mx-auto max-w-2xl">
            <Reveal>
              <div id="pricing-heading">
                <SectionHeading eyebrow="03 · The deal" title="Founding price, locked in" />
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div
                className="glass-card spotlight-card border border-[rgba(70,230,200,0.30)] p-8 text-center"
                onPointerMove={trackSpotlight}
              >
                <div className="badge badge-blue mx-auto mb-4 inline-flex items-center gap-1.5">
                  <Lock className="h-3 w-3" />
                  EARLY ADOPTER
                </div>
                <h3 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                  {isEarlyAccessEnabled
                    ? 'Founding price, locked in for early adopters'
                    : 'Free during the demand probe'}
                </h3>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
                  {isEarlyAccessEnabled
                    ? 'Reserve now to lock the founding rate before public launch. No fake countdowns, no anchoring, just an honest early-adopter price.'
                    : 'The analyzer is free to use while we gauge demand. Run your tape, no card required.'}
                </p>
                <ul className="mx-auto mt-6 grid max-w-md gap-2 text-left text-sm text-[var(--text-secondary)]">
                  <li className="flex items-start gap-2">
                    <Database className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-blue)]" />
                    Runs entirely in your browser. Your trades stay on your machine.
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
            </Reveal>
          </div>
        </section>

        {/* ── 6. FAQ ── */}
        <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-24 px-6 py-24">
          <div className="mx-auto max-w-3xl">
            <Reveal>
              <div id="faq-heading">
                <SectionHeading eyebrow="04 · Straight answers" title="The questions that actually matter" />
              </div>
            </Reveal>
            <div className="grid grid-cols-1 gap-3">
              {FAQS.map((f, i) => (
                <Fragment key={f.q}>
                  <Reveal delay={i * 60}>
                    <FaqItem q={f.q} a={f.a} />
                  </Reveal>
                </Fragment>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ── 7. Statement footer ── */}
      <footer className="relative overflow-hidden border-t border-[var(--border)] px-6 pb-10 pt-16">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="flex flex-col items-start justify-between gap-10 md:flex-row md:items-end">
              <div className="max-w-xl">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[var(--text-secondary)]" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    Methodology &amp; disclaimer
                  </span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {DISCLAIMER}
                </p>
              </div>
              <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
                {NAV_LINKS.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    className="text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    {l.label}
                  </a>
                ))}
                <Link
                  to="/app"
                  className="text-xs font-medium text-[var(--accent-mint)] transition-colors hover:text-[var(--accent-mint-bright)]"
                >
                  Launch analyzer →
                </Link>
              </nav>
            </div>
          </Reveal>

          {/* Statement wordmark — outlined, oversized, decorative. */}
          <Reveal>
            <div
              aria-hidden="true"
              className="wordmark-outline font-display mt-14 select-none whitespace-nowrap text-[18vw] leading-none md:text-[12rem]"
            >
              EDGECHECK
            </div>
          </Reveal>

          <div className="mt-6 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-secondary)]">
            © {new Date().getFullYear()} EdgeCheck. Modeled probabilities from
            your own trades, for research and education.
          </div>
        </div>
      </footer>
    </div>
  );
}
