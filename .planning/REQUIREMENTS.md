# Requirements: EdgeCheck

Single source: `docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md` (classified DOC). No competing acceptance variants. Each requirement carries a build-status reflecting **actual verified repo state** on `feat/institutional-add-ons`, not the stale "not yet implemented" plan header.

**Status legend:** `Done` = built + verified in repo · `Code-done` = implemented but needs external/manual wiring · `Pending` = remaining active work · `Gated` = deferred behind demand-probe.

---

## v1 Requirements (Milestone 1 — Prop Wedge + UI Revamp)

### REQ-prop-trader-defaults — Prop-trader defaults
- **Status:** Done (A1)
- Default the analyzer to prop-trader settings so first-run matches real prop tapes.
- Acceptance: `propFirmRulesEnabled` defaults true; default preset = TopOneFutures 50k; each `PROP_FIRM_PRESETS` entry has explicit `accountSize`; `applyPropPreset` sets `startingCapital` (+`ruinThreshold`) from it; real-tape run shows `startingCapital` $50k.

### REQ-challenge-verdict-card — Challenge Verdict hero card
- **Status:** Done (A2)
- New `ChallengeVerdict.tsx` atop `ResultsView` juxtaposing pass-probability with the edge verdict.
- Acceptance: pass-probability bullet/gauge with always-visible numeric % (`aria-live` on re-run) + binding failure mode, thresholds mirror `StressTestPanel.tsx:23`; edge-verdict chip + `trainMean → oosMean` delta + sparkline + `note`; null report → honest "need ≥50 trades (you have N)"; reuses `buildWalkForwardReport` (no recompute); regression anchor `+$42 → −$11/trade`.

### REQ-lean-visual-identity — Lean visual identity (forward-compatible)
- **Status:** Done (A3)
- Ship the design-system slice reused verbatim by Phase B.
- Acceptance: `--accent-magenta:#e879f9` + `--gradient-brand`; self-hosted Inter/JetBrains Mono/display via `@font-face` `font-display: swap` (Google `@import` removed); flat `glass-card` (no frosted blur), gimmick animations removed; motion 150–250ms / entry ≤300ms reduced-motion-gated; fixed `<title>` + meta/OG.

### REQ-reframe-empty-state — Reframe landing/empty state
- **Status:** Done (A4)
- Reframe `EmptyHero.tsx` around the prop-challenge wedge.
- Acceptance: badge `FOR FUNDED & PROP-CHALLENGE TRADERS`; H1 "Will you pass your prop challenge?"; sub line; feature trio Pass probability · Edge reality check · Tail & ruin risk; secondary CTA "Reserve early access →".

### REQ-compliance-disclaimer — Compliance disclaimer
- **Status:** Done (A6)
- Regulatory disclaimer beside pass-probability + footer.
- Acceptance: "Modeled from Monte Carlo resampling of your own past trades. Not a prediction of future results and not financial advice."; "Will you pass?" framed as modeled probability, never a promise.

### REQ-token-theme-engine — Token system + theme engine
- **Status:** Done (B1)
- Single-source-of-truth token system with light/dark + density.
- Acceptance: `src/theme/tokens.ts` defines every dark+light token; generates themed CSS; `themeMode.ts` resolve(saved) consulting `prefers-color-scheme`, persists to localStorage; spacious/compact density via root attribute; tests (tsx + `fast-check`) for light/dark parity + WCAG contrast (≥7:1 primary, ≥4.5:1 secondary).

### REQ-routing-marketing — Routing + marketing site (unauthenticated)
- **Status:** Done (B4)
- Public marketing site + routed analyzer, no auth.
- Acceptance: `react-router-dom`; `/` marketing (hero, prop-first trio, how-it-works, pricing reading founding price, FAQ, footer) + `/app` analyzer, no auth gate; no fabricated trust signals / outcome promises (Req 19.3/19.4); one primary CTA.

### REQ-spline-hero — Spline 3D hero (CSP change)
- **Status:** Done (B5)
- Optional 3D hero with graceful fallback.
- Acceptance: `@splinetool/viewer` (bundled), scene from prod.spline.design → `https://prod.spline.design` in CSP `connect-src`; gated by `prefers-reduced-motion` / Network Info API <3G / runtime failure → static brand-gradient fallback (never both); lazy-load only when hero renders.

### REQ-revamp-tests — Revamp smoke/property tests
- **Status:** Done (B7)
- tsx smoke/property checks for the revamp.
- Acceptance: tokens contain `--accent-blue:#58a6ff` + `--accent-magenta:#e879f9`; three font tokens with `font-display: swap`; no `backdrop-filter` on `.panel`/Card selectors; routes `/`, `/app` registered; React imported only in `components/` + route files.

---

### REQ-surface-motion-finalization — Surface + motion finalization (B6) **← #1 priority**
- **Status:** Pending (B6 light-mode panel sweep)
- Apply flat hairline + sparing gradient across ALL panels; finalize motion; **migrate ~24 analyzer panels off hardcoded dark hex (`#010409`, `#0d1117`, `#238636`, `text-[#c9d1d9]`) to tokens so light mode is correct in `/app`.**
- Acceptance: flat 1px-hairline + subtle-shadow + sparing brand-gradient across all panels (extends A3 globally); no `backdrop-filter` anywhere; no brutalist treatments; motion timings to spec tolerances; reduced-motion honored everywhere; light mode renders correctly across every analyzer panel.

### REQ-shadcn-migration — shadcn/ui migration (B2 full)
- **Status:** Code-done partial → Pending (B2 full)
- Primitives generated (`src/components/ui/*`), `ExportModal` migrated as exemplar. Remaining: migrate ~24 panels to the primitives.
- Acceptance: Radix + `class-variance-authority`/`tailwind-merge` (reuse `cn`); primitives map CSS vars to B1 tokens; migrate forms, modals/dialogs, dropdowns, command palette, toasts, popovers, tooltips, tabs, tables across ~25 panels — keep logic, swap chrome; no second general-purpose UI lib.

### REQ-charting-policy — Charting policy (B3 Tremor)
- **Status:** Pending (B3)
- Retain Recharts; add Tremor only for new surfaces (ChallengeVerdict KPI tiles/sparklines).
- Acceptance: Recharts retained for existing panels (re-tokenized, `--accent-blue`); Tremor only for new surfaces themed to same tokens, `--accent-magenta` on headline wedge; gauge/bullet for pass-probability, box plot for distributions, never pie; every chart ships a text/numeric fallback; reduced-motion honored; no third chart lib.

### REQ-paid-intent-probe — Paid-intent probe (Stripe Payment Link)
- **Status:** Code-done → Pending external wiring (A5)
- CTAs + `src/config.ts` env reader + analytics injection built. Remaining: create the Stripe Payment Link, set env vars, attach analytics domain.
- Acceptance: Stripe Payment Link created (no code), founding-price pre-order; `VITE_STRIPE_EARLY_ACCESS_URL` → one `EARLY_ACCESS_URL` constant, CTA disabled if unset; CTAs open in new tab (EmptyHero, ChallengeVerdict, header); privacy-light analytics with its domain in CSP, custom event per Reserve click.

### REQ-static-deploy — Deploy the static SPA
- **Status:** Pending (A7)
- Build and host the static SPA.
- Acceptance: `npm run build` → `dist/` (Vite bundles `wasm-engine/pkg`); host on Cloudflare Pages / Vercel; `.wasm` served as `application/wasm`; Web Worker loads in prod (COOP/COEP only if SharedArrayBuffer need surfaces); env vars set; domain attached.

### REQ-demand-probe-gate — Demand-probe success gate
- **Status:** Pending (post-ship measurement)
- Validation gate deciding whether the SaaS build is justified.
- Acceptance: run ~2 weeks, seed via demos in r/Daytrading, r/FuturesTrading, prop Discords; proceed to SaaS/auth/billing only if roughly ≥50 visitor→upload AND ≥5 paid pre-orders; below that, iterate positioning or stop.

---

## Deferred — Milestone 2 (GATED behind REQ-demand-probe-gate; NOT scheduled)

- **SaaS conversion:** accounts/auth, Supabase/Postgres/RLS, cloud sync, Stripe billing backend/webhooks/tier quotas. *(Status: Gated)*
- **ML edge-discovery** (k-medoids clustering). *(Status: Deferred entirely — proven statistically hollow.)*

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REQ-prop-trader-defaults | Phase 0 (shipped) | Done |
| REQ-challenge-verdict-card | Phase 0 (shipped) | Done |
| REQ-lean-visual-identity | Phase 0 (shipped) | Done |
| REQ-reframe-empty-state | Phase 0 (shipped) | Done |
| REQ-compliance-disclaimer | Phase 0 (shipped) | Done |
| REQ-token-theme-engine | Phase 0 (shipped) | Done |
| REQ-routing-marketing | Phase 0 (shipped) | Done |
| REQ-spline-hero | Phase 0 (shipped) | Done |
| REQ-revamp-tests | Phase 0 (shipped) | Done |
| REQ-surface-motion-finalization | Phase 1 | Pending |
| REQ-shadcn-migration | Phase 2 | Pending |
| REQ-charting-policy | Phase 3 | Pending |
| REQ-paid-intent-probe | Phase 4 | Pending (external) |
| REQ-static-deploy | Phase 4 | Pending |
| REQ-demand-probe-gate | Phase 5 | Pending |

**Coverage:** 15/15 v1 requirements mapped. No orphans, no duplicates.
