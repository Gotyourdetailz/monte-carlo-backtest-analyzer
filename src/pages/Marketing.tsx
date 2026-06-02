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
import { FaqItem, PrimaryCta, ReserveCta, SectionHeading } from './marketing/components';

export function Marketing(): ReactElement {
  const { resolved } = useTheme();
  return (
    <div className="min-h-screen overflow-x-hidden text-[var(--text-primary)]">
      {/* Low-opacity Monte-Carlo path-fan behind the whole page; fades on scroll. */}
      <HeroVideoBackdrop />
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

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <ReserveCta className="hidden sm:inline-flex" />
            <Link
              to="/app"
              className="btn-press inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[var(--accent-mint)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-primary)] transition-colors hover:bg-[var(--accent-mint-bright)]"
            >
              Launch analyzer
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* ── 2. Hero — instrument-forward: the EDGE·SCOPE is the spectacle ── */}
        <section
          aria-labelledby="hero-heading"
          className="relative isolate overflow-hidden px-6 pb-20 pt-14 sm:pt-20"
        >
          {/* faint instrument graticule, behind everything */}
          <div
            className="subtle-grid pointer-events-none absolute inset-0 -z-10 opacity-60"
            aria-hidden="true"
          />
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_1.05fr]">
            <div className="text-center lg:text-left">
              <div className="t-eyebrow panel-enter panel-enter-1 mb-5 inline-flex items-center gap-2 text-[var(--accent-mint)]">
                <Trophy className="h-3.5 w-3.5" />
                For funded &amp; prop-challenge traders
              </div>

              <h1
                id="hero-heading"
                className="panel-enter panel-enter-2 mb-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl"
              >
                Will you pass your prop challenge,
                <span className="text-[var(--accent-mint)]"> and is your edge real?</span>
              </h1>

              <p className="panel-enter panel-enter-3 mx-auto mb-8 max-w-xl text-base leading-relaxed text-[var(--text-secondary)] lg:mx-0">
                Your backtest looked great. Here&apos;s the truth on the trades it never saw. Upload
                your trade tape and we model your in-sample edge against a true out-of-sample holdout.
              </p>

              <div className="panel-enter panel-enter-4 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                <PrimaryCta label="Analyze my trade tape" />
                <ReserveCta />
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
        </section>

        <div className="mx-auto max-w-6xl px-6">
          <div className="divider-gradient" />
        </div>

        {/* ── 3. Three answers — asymmetric, each carries its own readout ── */}
        <section aria-labelledby="what-heading" className="px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div id="what-heading">
              <SectionHeading title="Three answers, straight from your own trades" />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
              {/* Large tile — edge reality check, with its in/out trace */}
              <div className="glass-card panel-enter panel-enter-1 flex flex-col p-6 sm:p-7">
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

              {/* Right column — two stacked readouts */}
              <div className="grid grid-cols-1 gap-4">
                <div className="glass-card panel-enter panel-enter-2 flex flex-col p-6">
                  <span className="t-label text-[var(--accent-mint)]">Pass probability</span>
                  <div className="mt-4">
                    <PassGauge pct={86} />
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                    Thousands of simulated challenge runs: your odds of hitting target before max
                    drawdown trips you out.
                  </p>
                </div>
                <div className="glass-card panel-enter panel-enter-3 flex flex-col p-6">
                  <span className="t-label text-[var(--accent-mint)]">Tail &amp; ruin risk</span>
                  <div className="mt-4">
                    <TailSpark />
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                    EVT tail extrapolation and probability-of-ruin: how bad an unseen losing streak
                    could really get.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 4. How it works — signal path (CH-01 → CH-02 → CH-03) ── */}
        <section aria-labelledby="how-heading" className="px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <div id="how-heading">
              <SectionHeading title="From CSV to a verdict in three steps" />
            </div>
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
                  <li key={s.title} className={`panel-enter panel-enter-${i + 1} relative flex flex-col`}>
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
                  </li>
                );
              })}
            </ol>
            <p className="mx-auto mt-12 max-w-2xl text-center text-xs leading-relaxed text-[var(--text-secondary)]">
              Built on real methodology: Monte-Carlo resampling, walk-forward out-of-sample
              validation, SR 11-7 model validation, and EVT tail analysis.
            </p>
          </div>
        </section>

        {/* ── 5. Pricing ── */}
        <section aria-labelledby="pricing-heading" className="px-6 py-20">
          <div className="mx-auto max-w-2xl">
            <div id="pricing-heading">
              <SectionHeading title="Founding price, locked in" />
            </div>
            <div className="glass-card panel-enter panel-enter-1 border border-[rgba(70,230,200,0.30)] p-8 text-center">
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
          </div>
        </section>

        {/* ── 6. FAQ ── */}
        <section aria-labelledby="faq-heading" className="px-6 py-20">
          <div className="mx-auto max-w-3xl">
            <div id="faq-heading">
              <SectionHeading title="The questions that actually matter" />
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
            © {new Date().getFullYear()} EdgeCheck. Modeled probabilities from
            your own trades, for research and education.
          </div>
        </div>
      </footer>
    </div>
  );
}
