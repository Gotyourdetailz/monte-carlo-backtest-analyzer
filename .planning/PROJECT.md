# EdgeCheck

## Core Value

**Tell a prop-challenge trader whether their edge is real — or just luck — and how likely they are to pass, computed honestly from their own trade tape, with zero backend.**

EdgeCheck is a free, public, backend-free analyzer that takes a trader's CSV trade tape and answers the two questions that decide a funded/prop career: *"Will I pass my challenge?"* (Monte Carlo prop pass-probability) and *"Is my edge real?"* (walk-forward in-sample → out-of-sample verdict). It refuses to fabricate: when there isn't enough data, it says so. The tool doubles as a **demand probe** — a Stripe pre-order CTA measures hard paid intent so the (deferred) SaaS build is justified by signal, not engineering volume.

## What This Is

- A fully static **Vite + React 19 SPA**. WASM simulation kernel bundled (`vite-plugin-wasm`), IndexedDB-only persistence, client-side PDF/CSV export. No server.
- Deploys to **Cloudflare Pages / Vercel** as static assets.
- Two surfaces: a public marketing site at `/` and the analyzer at `/app` (unauthenticated).
- The headline output is the **Challenge Verdict** card: pass-probability gauge + walk-forward edge verdict, honest about insufficient data.

## What This Is NOT (Out of Scope — locked)

- **No SaaS backend** until validated: no accounts/auth, no Supabase/Postgres/RLS, no cloud sync, no Stripe billing backend/webhooks/tier quotas.
- **No ML "edge-discovery" / k-medoids clustering.** Council verdict + a 127-trade real-data test proved it statistically hollow on normal-sized tapes (127 trades → 89 regime cells, median 1 trade/cell; k≥4 → <10 OOS trades/cluster). Deferred entirely.
- No fabricated trust signals (logos, testimonials, stats, outcome promises) on marketing.
- No verdict fabrication — insufficient data renders an honest null panel.

## Audience & Positioning

- **Both audiences, prop-first.** Lead with prop-challenge / funded-account takers (the wedge); retail backtest analysts are secondary.
- Marketing angle: *Trust & Authority + honesty* — transparent founding price, one primary CTA, in-sample/out-of-sample before/after framing.

## The Demand-Probe Gate (the real success metric)

Over a ~2-week probe (seeded via demos in r/Daytrading, r/FuturesTrading, prop Discords):

> **Proceed to the SaaS build ONLY if roughly ≥50 visitor→upload conversions AND ≥5 paid early-access pre-orders.**
> Below that threshold: iterate positioning or stop. Do not build the cathedral on an unvalidated wedge.

Engineering volume does not justify the SaaS build — this signal does.

## Constraints

| # | Constraint | Source |
|---|-----------|--------|
| C1 | Fully static, backend-free Vite SPA; WASM bundled; IndexedDB-only; client-side export. `.wasm` served as `application/wasm`; Web Worker loads in prod. | CON-architecture-static-spa |
| C2 | **CSP contract:** self-hosted fonts (no Google `@import`); analytics domain in `script-src`/`connect-src`; `https://prod.spline.design` in `connect-src`; Stripe CTAs open in new tab (no CSP change). | CON-csp-policy |
| C3 | **Color semantics:** blue `#58a6ff` = simulation/primary + interactive; magenta `#e879f9` = brand + Challenge Verdict surface only (kept scarce); green/red/amber = semantic PnL/risk, **always paired with icon or word** (never color alone); brand gradient static, never animated. | CON-color-semantics |
| C4 | **Typography:** JetBrains Mono for every number (`tabular-nums`); Inter body; display face (Manrope/Satoshi) for hero headline only; self-hosted + `font-display: swap`; preload mono + body. | CON-typography |
| C5 | **A11y gates (every surface):** contrast ≥4.5:1 (≥7:1 primary); visible focus rings; `prefers-reduced-motion` honored; Lucide SVG icons only (no emoji); 44px touch targets; no horizontal scroll 375–2560px; tables `aria-sort` + sticky header → stacked cards ≤768px. | CON-a11y-quality-gates |
| C6 | **Motion budget:** transitions 150–250ms, entry ≤300ms; no perpetual glow/breathing animations; no animated counters; no idle shimmer; **no `backdrop-filter` anywhere** (flat 1px-hairline surfaces). | CON-motion-budget |
| C7 | **Walk-forward null gate (data contract):** `buildWalkForwardReport` returns null when n<50 or train<30 or oos<10; consumers MUST render honest "not enough trades (need ≥50; you have N)" — never fabricate. | CON-walkforward-null-gate |
| C8 | **Code structure:** React only in `components/` + `App.tsx`/route files; pure token/theme logic isolated in `src/theme/`. No second general-purpose UI lib (shadcn only); no third chart lib (Recharts + Tremor only). | CON-code-structure |
| C9 | **Regression anchor:** real tape (NinjaTrader Grid 2026-04-08 CSV), prop rules ON, TOF 50k, startingCapital $50k → ChallengeVerdict shows pass-probability + walk-forward **FAIL** with `+$42 → −$11/trade`, matching `Institutional_Report-8.pdf`. Load-bearing. | CON-regression-anchor |

## Key Decisions

<decisions>

| ID | Decision | Status | Rationale |
|----|----------|--------|-----------|
| DEC-free-tool-plus-demand-probe | Ship the analyzer as a free, public, backend-free tool used as a demand probe — not a paid SaaS up front. | **Locked (user)** | De-risk: validate demand before building backend. |
| DEC-positioning-both-prop-first | Position for "both" audiences but lead prop-first. | **Locked (user)** | Prop-challenge takers are the sharpest wedge. |
| DEC-stripe-payment-link | Measure paid intent via a no-code Stripe Payment Link pre-order — NOT a billing backend/webhooks/quotas. | **Locked (user)** | Hard intent signal with zero backend. |
| DEC-defer-ml | Defer ML edge-discovery / k-medoids clustering **entirely**. Repurpose its magenta accent for the Challenge Verdict surface. | **Locked (council + data)** | Statistically hollow on normal-sized tapes (127→89 cells, median 1 trade/cell). |
| DEC-full-spec-ui-revamp | Commit to the full UI spec revamp, split Phase A (lean, shipped) + Phase B (fast-follow). Nothing in A is rework. | **Locked (user)** | Ship the wedge fast; complete the spec without throwaway work. |
| DEC-no-auth-localstorage | Auth deferred. Theme/density persist to localStorage; routing is unauthenticated (`/`, `/app` ungated). | **Locked (user, spec adaptation)** | Spec's per-account UI coupling adapted for the no-backend reality. |
| DEC-static-spa-deploy | Deploy fully static, backend-free Vite SPA on Cloudflare Pages / Vercel. | **Locked (user)** | Zero infra cost; instant deploy. |
| DEC-honesty-gate | Never fabricate a verdict. Null walk-forward → honest "not enough trades" panel. Microcopy states modeled probabilities, never "you will pass". | **Locked (design principle)** | Product integrity + compliance. |
| DEC-no-fabricated-trust-signals | Marketing uses Trust & Authority + honesty; no fabricated logos/testimonials/stats/outcome promises; transparent founding price; one primary CTA. | **Locked (design principle)** | Compliance + credibility. |
| DEC-saas-validation-gated | The entire SaaS conversion (auth, Supabase/Postgres/RLS, cloud sync, billing backend) is **gated** behind the demand-probe metric (≥50 uploads AND ≥5 pre-orders over ~2 weeks). Not scheduled as active work. | **Locked (council verdict)** | Build the cathedral only on validated demand. |

</decisions>

## Provenance

- Source plan: `docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md` (classified DOC, single source).
- Underlying UI spec: `.kiro/specs/saas-ml-platform-revamp/{requirements,design,tasks}.md` (Reqs 8/10/14/15/16/17/19/20) — referenced, adapted for no-auth.
- Council verdict: `council-transcript-2026-05-31` (ML deferred, SaaS validation-gated).
- Regression anchor: `Institutional_Report-8.pdf`.
- Synthesized from: `.planning/intel/{SYNTHESIS,decisions,requirements,constraints,context}.md`.

## Implementation Status Note

The source plan's "not yet implemented" header is **stale**. Verified repo state on branch `feat/institutional-add-ons` (tsc clean, vite build green, 27 tests 26-pass/1-skip): Milestone 1 Phase A (A1–A4, A6, A5-code) and the Phase B foundation (B1 theme engine, B2 partial, B4 routing, B5 Spline hero, B7 revamp tests) are **built**. The active roadmap below covers the **remaining** Milestone 1 work only. See ROADMAP.md.
