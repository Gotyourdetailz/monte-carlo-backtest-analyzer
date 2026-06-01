/*
 * src/pages/BenchLanding.tsx — PROTOTYPE landing (route: /landing)
 *
 * The public "/" marketing page rebuilt in the "Bench Instrument" language.
 * Non-destructive: the live Marketing.tsx at "/" is untouched — this is a
 * preview to approve before cutover. Reuses the real, honest marketing copy
 * from ./marketing/content.ts (no fabricated trust signals; compliance kept).
 *
 * Anti-AI-slop discipline (vs. the old page): no centered hero, no eyebrow on
 * every section, no two-sets-of-3-equal-cards, no gradient-text headline, no
 * Spline blob. Accent (ion) is a signal only — on hover/intent, never as resting
 * chrome. The hero's visual is the ACTUAL instrument readout, not a stock photo
 * or a div-based fake screenshot.
 */
import { useState, type ReactElement } from 'react';
import { useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowDown, SunMedium, MoonStar } from 'lucide-react';
import { FEATURES, STEPS, FAQS, DISCLAIMER } from './marketing/content';
import { EdgeScopeHero } from '../components/bench/EdgeScopeHero';
import '../components/bench/bench.css';

type BenchTheme = 'dark' | 'light';

/** Brand hero backdrop (files in public/hero/). The video autoplays muted+looped;
 * under prefers-reduced-motion the still poster is shown instead. A bottom-right
 * corner scrim + slight scale-clip mask the generator watermark. */
const HERO_BG_VIDEO: string = '/hero/edgecheck-hero.mp4';
const HERO_BG_POSTER: string = '/hero/edgecheck-hero-poster.png';

/** A mono "documented-part" label: CODE / sublabel. */
function PartLabel({ code, sub }: { code: string; sub?: string }): ReactElement {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="bench-label" style={{ color: 'var(--bench-text)' }}>
        {code}
      </span>
      {sub ? (
        <span className="bench-label" style={{ letterSpacing: '0.08em' }}>
          / {sub}
        </span>
      ) : null}
    </span>
  );
}

export function BenchLanding(): ReactElement {
  const [theme, setTheme] = useState<BenchTheme>('dark');
  const reduce = useReducedMotion();
  const flip = (): void => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <div
      className="bench-root"
      data-bench-theme={theme}
      style={{ minHeight: '100dvh', background: 'var(--bench-bg)', color: 'var(--bench-text)' }}
    >
      {/* ── Nav (single line, 64px) ── */}
      <nav
        className="sticky top-0 z-20"
        style={{ background: 'var(--bench-bg)', borderBottom: '1px solid var(--bench-bezel)' }}
        aria-label="Primary"
      >
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
          <Link to="/landing" className="flex items-baseline gap-2">
            <span className="bench-value text-sm font-semibold tracking-[0.2em]" style={{ color: 'var(--bench-text)' }}>
              EDGECHECK
            </span>
            <span className="bench-label" style={{ color: 'var(--bench-text-faint)' }}>
              / cv-01
            </span>
          </Link>

          <div className="flex items-center gap-5">
            <a href="#how" className="bench-label hidden sm:inline hover:!text-[color:var(--bench-text)]">
              how it works
            </a>
            <a href="#faq" className="bench-label hidden sm:inline hover:!text-[color:var(--bench-text)]">
              faq
            </a>
            <button
              type="button"
              onClick={flip}
              aria-label="Toggle theme"
              className="bench-cta inline-flex h-9 w-9 items-center justify-center rounded-[3px]"
            >
              {theme === 'dark' ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
            </button>
            <Link
              to="/app"
              className="bench-cta group inline-flex min-h-[40px] items-center gap-1.5 rounded-[3px] px-3.5"
            >
              <span className="bench-value text-[11px] font-semibold tracking-wider">LAUNCH ANALYZER</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero — copy + the living Edge-Scope display, over a dimmable brand backdrop ── */}
      <section className="relative isolate overflow-hidden">
        {/* Brand hero backdrop slot (renders at ~50% behind the scope). The scrim
            keeps the headline legible and adds ambient ion glow even before an
            image is set. `isolate` contains the -z-10 layer (z-index lesson). */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          {HERO_BG_VIDEO && !reduce ? (
            <video
              className="h-full w-full object-cover"
              style={{ opacity: 0.5, transform: 'scale(1.08)', transformOrigin: 'top left' }}
              src={HERO_BG_VIDEO}
              poster={HERO_BG_POSTER || undefined}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
            />
          ) : HERO_BG_POSTER ? (
            <img
              src={HERO_BG_POSTER}
              alt=""
              className="h-full w-full object-cover"
              style={{ opacity: 0.5, transform: 'scale(1.08)', transformOrigin: 'top left' }}
            />
          ) : null}
          {/* scrims: bottom-right corner masks the generator watermark; ambient ion
              glow top-left; top/bottom fade to background for legibility + blend. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(46% 52% at 100% 100%, var(--bench-bg) 0%, var(--bench-bg) 20%, rgba(15,16,14,0.72) 42%, transparent 72%),' +
                ' radial-gradient(70% 55% at 32% 18%, rgba(70,230,200,0.07), transparent 60%),' +
                ' linear-gradient(180deg, var(--bench-bg) 0%, transparent 24%, transparent 60%, var(--bench-bg) 100%)',
            }}
          />
        </div>

        <div className="mx-auto max-w-[1200px] px-6 pt-14 pb-16 md:pt-20 md:pb-24">
          <div className="max-w-[64ch]">
          <div className="bench-label mb-6" style={{ letterSpacing: '0.16em' }}>
            for funded &amp; prop-challenge traders
          </div>
          <h1
            className="text-4xl font-semibold leading-[1.04] tracking-[-0.02em] md:text-5xl lg:text-[3.5rem]"
            style={{ color: 'var(--bench-text)' }}
          >
            Will you pass your prop challenge
            <span style={{ color: 'var(--bench-text-dim)' }}> — and is your edge </span>
            actually real?
          </h1>
          <p className="mt-6 max-w-[52ch] text-[15px] leading-relaxed md:text-base" style={{ color: 'var(--bench-text-dim)' }}>
            Upload your trade tape. We model your in-sample edge against a true out-of-sample holdout,
            then tell you straight.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/app"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] px-5"
              style={{ background: 'var(--bench-text)', color: 'var(--bench-bg)' }}
            >
              <span className="bench-value text-[12px] font-semibold tracking-wider">ANALYZE MY TRADE TAPE</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a
              href="#reserve"
              className="bench-cta inline-flex min-h-[44px] items-center justify-center rounded-[3px] px-5"
            >
              <span className="bench-value text-[12px] font-semibold tracking-wider">RESERVE EARLY ACCESS</span>
            </a>
          </div>
        </div>

          <div className="mt-12 md:mt-14">
            <EdgeScopeHero />
          </div>
        </div>
      </section>

      {/* ── What it does — documented-readout channels (NOT 3 equal cards) ── */}
      <section className="mx-auto max-w-[1200px] px-6 py-16 md:py-20" aria-labelledby="what-h">
        <div className="bench-label mb-4">three channels, one tape</div>
        <h2 id="what-h" className="max-w-[18ch] text-3xl font-semibold tracking-[-0.01em] md:text-4xl">
          Three answers, straight from your own trades
        </h2>

        <div className="mt-12">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="grid grid-cols-1 gap-4 py-7 md:grid-cols-[14rem_1fr] md:gap-10"
              style={i > 0 ? { borderTop: '1px solid var(--bench-bezel)' } : undefined}
            >
              <div className="flex items-center gap-3">
                <span className="bench-value text-[11px]" style={{ color: 'var(--bench-text-faint)' }}>
                  CH-0{i + 1}
                </span>
                <f.icon className="h-5 w-5" />
              </div>
              <div className="max-w-[60ch]">
                <h3 className="text-xl font-semibold" style={{ color: 'var(--bench-text)' }}>
                  {f.title}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed" style={{ color: 'var(--bench-text-dim)' }}>
                  {f.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works — signal flow (NOT numbered cards) ── */}
      <section id="how" className="mx-auto max-w-[1200px] px-6 py-16 md:py-20" aria-labelledby="how-h">
        <h2 id="how-h" className="text-3xl font-semibold tracking-[-0.01em] md:text-4xl">
          From CSV to a verdict
        </h2>

        <div className="mt-10 grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {[STEPS[0], STEPS[1], STEPS[2]].map((s, i) => (
            <div key={s.title} className="contents">
              {i > 0 ? (
                <div className="flex items-center justify-center" style={{ color: 'var(--bench-text-faint)' }}>
                  <ArrowRight className="hidden h-5 w-5 md:block" aria-hidden="true" />
                  <ArrowDown className="h-5 w-5 md:hidden" aria-hidden="true" />
                </div>
              ) : null}
              <div
                className="rounded-[var(--bench-radius)] p-5"
                style={{ background: 'var(--bench-panel)', border: '1px solid var(--bench-bezel)' }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="bench-label">{['in', 'model', 'out'][i]}</span>
                  <s.icon className="h-4 w-4 text-[var(--bench-text-dim)]" />
                </div>
                <h3 className="text-[15px] font-semibold" style={{ color: 'var(--bench-text)' }}>
                  {s.title}
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: 'var(--bench-text-dim)' }}>
                  {s.body}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 max-w-[70ch] text-[13px] leading-relaxed" style={{ color: 'var(--bench-text-faint)' }}>
          Built on real methodology: Monte-Carlo resampling, walk-forward out-of-sample validation,
          SR 11-7 model validation, and EVT tail analysis.
        </p>
      </section>

      {/* ── Pricing — single honest panel ── */}
      <section id="reserve" className="mx-auto max-w-[760px] px-6 py-16 md:py-20" aria-labelledby="price-h">
        <div
          className="rounded-[var(--bench-radius)] p-8 md:p-10"
          style={{ background: 'var(--bench-panel)', border: '1px solid var(--bench-bezel)', boxShadow: 'var(--bench-shadow)' }}
        >
          <PartLabel code="ACCESS" sub="founding" />
          <h2 id="price-h" className="mt-4 text-2xl font-semibold tracking-[-0.01em] md:text-3xl">
            Free during the demand probe
          </h2>
          <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed" style={{ color: 'var(--bench-text-dim)' }}>
            The analyzer is free to use while we gauge demand. Run your tape, no card required. No fake
            countdowns, no anchoring — reserve to lock the founding rate before public launch.
          </p>
          <ul className="mt-7 grid gap-2.5 text-[14px]" style={{ color: 'var(--bench-text-dim)' }}>
            {[
              'Runs entirely in your browser — your trades stay on your machine.',
              'Prop-firm presets: TopOneFutures, FTMO, Apex.',
              'Full model validation, EVT tails, and walk-forward OOS scoring.',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full" style={{ background: 'var(--bench-text-faint)' }} aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/app"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] px-5"
              style={{ background: 'var(--bench-text)', color: 'var(--bench-bg)' }}
            >
              <span className="bench-value text-[12px] font-semibold tracking-wider">LAUNCH THE ANALYZER</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a href="#reserve" className="bench-cta inline-flex min-h-[44px] items-center justify-center rounded-[3px] px-5">
              <span className="bench-value text-[12px] font-semibold tracking-wider">RESERVE EARLY ACCESS</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── FAQ — divided list ── */}
      <section id="faq" className="mx-auto max-w-[820px] px-6 py-16 md:py-20" aria-labelledby="faq-h">
        <h2 id="faq-h" className="text-3xl font-semibold tracking-[-0.01em] md:text-4xl">
          The questions that actually matter
        </h2>
        <div className="mt-10">
          {FAQS.map((f, i) => (
            <div
              key={f.q}
              className="grid grid-cols-1 gap-2 py-6 md:grid-cols-[3rem_1fr] md:gap-6"
              style={i > 0 ? { borderTop: '1px solid var(--bench-bezel)' } : undefined}
            >
              <span className="bench-value text-[11px]" style={{ color: 'var(--bench-text-faint)' }}>
                Q·0{i + 1}
              </span>
              <div className="max-w-[64ch]">
                <h3 className="text-[16px] font-semibold" style={{ color: 'var(--bench-text)' }}>
                  {f.q}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed" style={{ color: 'var(--bench-text-dim)' }}>
                  {f.a}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid var(--bench-bezel)' }}>
        <div className="mx-auto max-w-[1200px] px-6 py-12">
          <div className="bench-label mb-3">methodology &amp; disclaimer</div>
          <p className="max-w-[70ch] text-[13px] leading-relaxed" style={{ color: 'var(--bench-text-dim)' }}>
            {DISCLAIMER}
          </p>
          <div className="mt-8 flex items-center justify-between" style={{ borderTop: '1px solid var(--bench-bezel)', paddingTop: 20 }}>
            <span className="bench-value text-[11px]" style={{ color: 'var(--bench-text-faint)' }}>
              EDGECHECK · {new Date().getFullYear()}
            </span>
            <span className="text-[12px]" style={{ color: 'var(--bench-text-faint)' }}>
              Modeled from your own trades — for research and education.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
