# Requirements (PRD-equivalent)

Extracted from the Monte-Carlo SaaS Ship Plan (classified DOC). Each Phase A/B work item yields one requirement. Acceptance criteria are drawn from the plan's per-step detail and the end-to-end Verification section. All from a single source — no competing acceptance variants.

---

## REQ-prop-trader-defaults — Prop-trader defaults
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (A1)
- phase: A
- description: Default the analyzer to prop-trader settings so first-run matches real prop tapes.
- acceptance:
  - `propFirmRulesEnabled` defaults to true.
  - Default preset = TopOneFutures 50k.
  - Each `PROP_FIRM_PRESETS` entry gains an explicit `accountSize` field (`types.ts:362-369`); `applyPropPreset` sets `startingCapital` (+ `ruinThreshold`, e.g. 50%) from it.
  - Verification: real-tape run shows `startingCapital` $50k.

## REQ-challenge-verdict-card — Challenge Verdict hero card
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (A2; UI/UX Direction)
- phase: A
- description: New `ChallengeVerdict.tsx` rendered atop `ResultsView` — the single most important new surface, juxtaposing pass-probability with the edge verdict.
- acceptance:
  - Pass-probability tile: `propEvalStats.passRate` big number + binding failure mode (max of failDrawdown/failConsistency/failTime); color thresholds mirror `StressTestPanel.tsx:23`; rendered as a horizontal bullet/gauge with numeric % always visible (never hover-only; `aria-live` on re-run).
  - Edge-verdict tile: walk-forward `verdict` chip (icon + word + color) + `trainMean → oosMean` delta + sparkline + existing `note`.
  - Null/insufficient report (n<50 or train<30/oos<10, `walkForward.ts:93,98`) → honest "need >=50 trades (you have N)" panel; never fabricate.
  - Reuse `buildWalkForwardReport` (`walkForward.ts:86`), threaded through `ResultsView` — do not recompute.
  - Regression anchor: real tape → pass-probability + walk-forward FAIL with `+$42 → −$11/trade`, matching `Institutional_Report-8.pdf`.

## REQ-lean-visual-identity — Lean visual identity (forward-compatible)
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (A3; Reqs 10/15/17/20 subset)
- phase: A
- description: Ship the slice of the design system reused verbatim by Phase B.
- acceptance:
  - Tokens (`index.css:7-25`): add `--accent-magenta:#e879f9` and `--gradient-brand` (blue→magenta); keep blue/green/red/amber; alias legacy `--accent-purple`.
  - CSP-clean fonts: remove the CSP-violating Google `@import` (`index.css:1`); self-host Inter + JetBrains Mono + display face via local `@font-face` with `font-display: swap`; preload mono + body; `--font-mono` on all numeric cells.
  - Flatten + de-gimmick: replace `glass-card` frosted blur with flat fill + 1px hairline + subtle shadow; remove `hero-orbs`, `pulseGlow`/`borderGlow`/`gradientShift`/`livePulse`, `animate-count-up`.
  - Motion budget: transitions 150–250ms, entry <=300ms; reduced-motion gated (`index.css:49`).
  - Fix `<title>` and add meta/OG tags.

## REQ-reframe-empty-state — Reframe landing/empty state
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (A4)
- phase: A
- description: Reframe `EmptyHero.tsx` around the prop-challenge wedge.
- acceptance:
  - Badge → `FOR FUNDED & PROP-CHALLENGE TRADERS`; H1 "Will you pass your prop challenge?"; sub "And is your edge real — or just luck? Upload your trade tape and find out."
  - Replace the FEATURES trio (lines 9–28) with: Pass probability · Edge reality check · Tail & ruin risk.
  - Add secondary CTA "Reserve early access →".

## REQ-paid-intent-probe — Paid-intent probe (Stripe Payment Link)
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (A5)
- phase: A
- description: No-backend paid-intent measurement.
- acceptance:
  - Stripe Payment Link created in dashboard (no code), founding-price pre-order, 1–3 price points.
  - Read `VITE_STRIPE_EARLY_ACCESS_URL` into one `EARLY_ACCESS_URL` constant (`src/config.ts`); disable CTA if unset.
  - CTAs open in new tab (no CSP change): EmptyHero, ChallengeVerdict ("Lock in founding price →"), header (`MainHeader.tsx`).
  - Privacy-light analytics (Plausible/Umami `<script>` in `index.html`) — requires adding its domain to CSP `script-src`/`connect-src`; fire a custom event per Reserve click.

## REQ-compliance-disclaimer — Compliance disclaimer
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (A6)
- phase: A
- description: Regulatory disclaimer beside pass-probability + footer.
- acceptance:
  - Text: "Modeled from Monte Carlo resampling of your own past trades. Not a prediction of future results and not financial advice."
  - "Will you pass?" framed as modeled probability, never a promise.

## REQ-static-deploy — Deploy the static SPA
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (A7)
- phase: A
- description: Build and host the static SPA.
- acceptance:
  - `npm run build` → `dist/` (Vite bundles `wasm-engine/pkg` via `vite-plugin-wasm`).
  - Host on Cloudflare Pages or Vercel (free, static).
  - `.wasm` served as `application/wasm`; Web Worker loads in prod (COOP/COEP only if SharedArrayBuffer need surfaces).
  - Set `VITE_STRIPE_EARLY_ACCESS_URL` + analytics env; attach domain.

## REQ-token-theme-engine — Token system + theme engine
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (B1; Req 10 full, 15)
- phase: B
- description: Single-source-of-truth token system with light/dark + density.
- acceptance:
  - `src/theme/tokens.ts` defines every dark + light token; generates `src/theme.css` imported by `index.css`; light gated by `[data-theme="light"]`.
  - `src/theme/themeMode.ts`: pure `resolve(saved)` consulting `prefers-color-scheme` for 'system', fallback 'dark'; persist to localStorage.
  - Density modes (spacious/compact) via root attribute + token scale; persist to localStorage.
  - Tests (tsx + `fast-check`): light/dark registry parity + WCAG contrast (primary >=7:1, secondary >=4.5:1).

## REQ-shadcn-migration — shadcn/ui migration
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (B2; Req 14)
- phase: B
- description: Migrate UI chrome to shadcn/ui (Radix + Tailwind v4).
- acceptance:
  - Add Radix + `class-variance-authority`/`tailwind-merge` (reuse existing `cn`); generate primitives into `src/components/ui/`; map CSS vars to B1 tokens.
  - Migrate forms, modals/dialogs, dropdowns, command palette, toasts, popovers, tooltips, tabs, tables across ~25 panels — keep logic, swap chrome.
  - No second general-purpose UI lib.

## REQ-charting-policy — Charting policy
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (B3; Req 16)
- phase: B
- description: Retain Recharts; add Tremor only for new surfaces.
- acceptance:
  - Retain Recharts for all existing panels (re-tokenized, `--accent-blue` for sim).
  - Tremor only for new surfaces (ChallengeVerdict KPI tiles/sparklines), themed to same tokens, `--accent-magenta` on headline wedge surface.
  - Chart-type rules: gauge/bullet for pass-probability, box plot for distributions, never pie; every chart ships a text/numeric fallback; reduced-motion honored. No third chart lib.

## REQ-routing-marketing — Routing + marketing site (unauthenticated)
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (B4; Req 8, 19)
- phase: B
- description: Public marketing site + routed analyzer, no auth.
- acceptance:
  - Add `react-router-dom`: public `/` marketing (hero, prop-first trio, how-it-works, pricing reading founding price, FAQ incl. data-privacy/prop-compatibility/CSV formats, footer), analyzer at `/app`, no auth gate.
  - No fabricated trust signals, no outcome promises (Req 19.3/19.4).
  - Trust & Authority + in-sample/out-of-sample before/after angle; one primary CTA.

## REQ-spline-hero — Spline 3D hero (requires CSP change)
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (B5; Req 8)
- phase: B
- description: Optional 3D hero with graceful fallback.
- acceptance:
  - `@splinetool/viewer` (bundled), scene from prod.spline.design → add `https://prod.spline.design` to CSP `connect-src` (`index.html:8-19`).
  - Gating: `prefers-reduced-motion`, Network Information API < 3G, runtime failure → static brand-gradient fallback; never render both; lazy-load only when hero renders.

## REQ-surface-motion-finalization — Surface + motion finalization
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (B6; Req 17, 20)
- phase: B
- description: Apply flat hairline + sparing gradient across all panels; finalize motion.
- acceptance:
  - Flat 1px-hairline + subtle-shadow + sparing brand-gradient across all panels (extends A3 globally).
  - No `backdrop-filter` anywhere; no brutalist treatments.
  - Motion timings to spec tolerances; reduced-motion honored everywhere.

## REQ-revamp-tests — Revamp smoke/property tests
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (B7; spec Testing Strategy)
- phase: B
- description: tsx smoke/property checks for the revamp.
- acceptance:
  - tokens contain `--accent-blue:#58a6ff` + `--accent-magenta:#e879f9`; all three font tokens defined with `font-display: swap`; no `backdrop-filter` on `.panel`/Card selectors; routes `/`, `/app` registered; React imported only in `components/` + route files.

## REQ-demand-probe-gate — Demand-probe success gate
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Demand-probe success gate)
- phase: A (post-ship measurement)
- description: Validation gate that decides whether the SaaS build is justified.
- acceptance:
  - Run ~2 weeks; seed via demos in r/Daytrading, r/FuturesTrading, prop Discords.
  - Proceed to SaaS/auth/billing only if roughly >=50 visitors-to-upload AND >=5 paid pre-orders. Below that: iterate positioning or stop.
