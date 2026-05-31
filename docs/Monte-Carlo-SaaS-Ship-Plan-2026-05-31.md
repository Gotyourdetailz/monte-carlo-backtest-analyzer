---
title: "Ship Plan — Prop-Trader Wedge + Full UI Revamp"
date: 2026-05-31
type: implementation-plan
tags: [plan, trading, saas, monte-carlo, prop-firm, ui-revamp, wedge]
project: "[[Monte-Carlo-Backtest-Simulator-Plan]]"
status: not-yet-implemented
---

# Ship Plan — Prop-Trader Wedge + Full UI Revamp

> [!note] Status: **not yet implemented** — paused on usage credits (2026-05-31).
> Resume from **Phase A → A1**. Repo: `C:\Users\demir\antigravity\Monte-Carlo-Backtest-Analyzer`. Source plan file: `C:\Users\demir\.claude\plans\so-based-off-this-happy-moth.md`.
> **Background:** see [[council-transcript-2026-05-31]] (LLM-council verdict) and the 127-trade real-data test that proved the ML feature is statistically hollow and the prop-pass-probability + walk-forward outputs are the real wedge. Builds on [[Monte-Carlo-Backtest-Simulator-Plan]].

---

## Context

The `/llm-council` run + a real-data test (the user's own 127-trade TopOneFutures tape, cross-checked against `Institutional_Report-8.pdf`) settled the strategy:
- The **ML "edge-discovery" clustering is statistically hollow on normal-sized tapes** (127 trades → 89 regime cells, median 1 trade/cell; k≥4 → <10 OOS trades/cluster). **Defer it entirely.**
- The **existing engine already computes the two killer, honest outputs** prop traders care about, needing **zero new analytics**: the Monte Carlo **prop pass-probability** (`propEvalStats.passRate`) and the **walk-forward "is my edge real or luck" verdict** (`buildWalkForwardReport` → PASS/WARN/FAIL, with a built-in "insufficient data → null" honesty gate).
- The app is a **fully static, backend-free Vite SPA** (WASM bundled, IndexedDB-only, client-side PDF/CSV export) — deployable as-is.

**Locked decisions (user):** Free public tool + demand probe · Positioning "both, prop-first" · **Stripe Payment Link** for hard paid intent · ML deferred · **Full spec UI revamp** (`.kiro/specs/saas-ml-platform-revamp`, Reqs 8, 10, 14, 15, 16, 17, 19, 20).

**Honest timeline note:** the full UI revamp (shadcn/ui migration of ~25 panels, Tremor, Spline hero, full light/dark token system + density, routed marketing site) is a **multi-week** effort, not a this-week ship. So this plan is **two phases**: Phase A ships the wedge + a lean visual identity quickly (and is forward-compatible — nothing is rework); Phase B completes the entire spec revamp as a structured fast-follow. The spec's UI requirements assumed the SaaS conversion (per-account theme/density, `/app` auth gating) — since auth is deferred, those preferences persist to **localStorage** and routing is **unauthenticated**.

**Goal:** get the wedge in front of prop-challenge takers and measure pre-payment. That signal — not engineering volume — decides whether the SaaS build is justified.

---

## UI/UX Design Direction (from `ui-ux-pro-max`)

**Style = "Data-Dense Dashboard"** — KPI cards + charts + tables on a tight grid, minimal padding, maximum data visibility (WCAG AA). Avoid ornate decoration; every pixel earns its place. Governs the analyzer and the marketing screenshots.

**Color semantics (strict — color is never the only signal; spec Req 10 + a11y `color-not-decorative-only`):**
- **Blue `#58a6ff`** = simulation / primary data + interactive (charts, links, focus rings).
- **Magenta `#e879f9`** = brand + the **Challenge Verdict surface only** (hairline + headline KPI) + primary-CTA gradient. Kept scarce so it stays meaningful (repurposes the spec's ML-magenta intent now that ML is deferred).
- **Green / Red / Amber** = semantic PnL/risk only, **always paired with an icon or word** (✓/✗/▲, "PASS"/"FAIL") — never color alone, so red/green-blind traders still read it.
- Brand gradient (blue→magenta) only on hero, primary CTA, verdict KPI; **static, never animated**.

**Typography (validated by the skill's mono/data guidance):**
- **JetBrains Mono** for every number/metric/hash/table cell with **tabular figures** (`font-variant-numeric: tabular-nums`) so columns don't jitter; data sizes 12/14/16, hero KPI larger.
- **Inter** body (line-height 1.5, 65–75ch). Display face for the hero headline only. Weight for hierarchy (700/500/400). Self-hosted + `font-display: swap` (replaces the current **CSP-violating Google `Fira Code` import**).

**Challenge Verdict card (the hero result) — one card, two tiles, magenta hairline:**
- **Left — Pass probability:** a compact **horizontal bullet/gauge** (track with red→amber→green zones + a target marker at the pass line) with the **numeric % always rendered as text** (never hover-only; `aria-live` on re-run) — big `62%` + "of 10,000 simulated challenges passed · most failures: drawdown". (Skill rule: gauge/bullet is AAA only when the number is always visible, not color/position alone.)
- **Right — Edge verdict:** a PASS/WARN/FAIL **chip = icon + word + color** + `+$42 → −$11 / trade` delta + a tiny train-vs-OOS sparkline; existing `note` beneath. Null/insufficient-data → honest "Need ≥50 trades (you have N)" panel.
- **Non-hypey microcopy:** state modeled probabilities and assumptions, never "you will pass". Inline disclaimer (A6).

**Data tables / metric panels:** shadcn `Table` + TanStack `DataTable` for sort/filter (`aria-sort`); right-aligned tabular-mono numerics; row-hover highlight; sticky header; `overflow-x-auto` → **stacked cards ≤768px**; **skeleton/shimmer while a run computes (>300ms)** instead of a frozen UI — load-time only, not the spec-prohibited idle shimmer.

**Charts (Req 16):** keep Recharts for existing panels; pass-probability = gauge/bullet, distributions = box plot or existing histograms (**never pie**); every chart ships a text/numeric fallback and respects reduced-motion. Tremor only for new KPI tiles/sparklines.

**Landing (Req 19):** "Trust & Authority + honesty" angle — lead with the **in-sample vs out-of-sample before/after** ("your backtest looked great… here's the truth on unseen trades"); credibility from real methodology (SR 11-7, walk-forward, EVT); **one** primary CTA (Reserve early access); **no fabricated logos/testimonials/stats** (Req 19.3); transparent founding price; low-friction.

**Quality gates (every surface):** contrast ≥4.5:1 (≥7:1 primary per spec), visible focus rings, `prefers-reduced-motion` honored, Lucide SVG icons only (no emoji), 44px touch targets, no horizontal scroll 375–2560px.

---

# PHASE A — Wedge value + lean identity (ship first)

### A1 — Prop-trader defaults — `src/App.tsx` (`applyPropPreset` ~216–228), `src/types.ts:362`, `src/components/Sidebar.tsx`
- Default `propFirmRulesEnabled = true`; default preset = **TopOneFutures 50k** (matches real prop tapes).
- Add an explicit `accountSize` field to each `PROP_FIRM_PRESETS` entry (`types.ts:362-369`); in `applyPropPreset`, set `startingCapital` (+ `ruinThreshold`, e.g. 50%) from it — presets currently encode target/drawdown but not the account base ruin/terminal metrics depend on.

### A2 — "Challenge Verdict" hero card — NEW `src/components/ChallengeVerdict.tsx`, wired atop `src/components/ResultsView.tsx`
The single most important new surface. Renders above existing panels.
- **Pass-probability tile:** `propEvalStats.passRate` as the big number + binding failure mode (max of `failDrawdown`/`failConsistency`/`failTime`) → "62% pass odds · most failures: drawdown". Color thresholds mirror `StressTestPanel.tsx:23`.
- **Edge-verdict tile:** walk-forward `verdict` badge + `trainMean → oosMean` ("+$42 → −$11 / trade") + existing `note`. If the report is **`null`** (n<50 or train<30/oos<10 — `walkForward.ts:93,98`), render the honest "Not enough trades for an out-of-sample test (need ≥50; you have N)" — never fabricate a verdict.
- **Honest juxtaposition (council blind-spot fix):** edge verdict sits beside pass odds so a FAIL tempers an optimistic pass-rate and the rosy median-terminal-wealth headline.
- Reuse the walk-forward report already built for `WalkForwardPanel` (`buildWalkForwardReport`, `walkForward.ts:86`); thread it through `ResultsView` — do not recompute.
- Layout, a11y, microcopy, and color usage per **UI/UX Design Direction** above (bullet-gauge with always-visible %, icon+word verdict chip, magenta hairline).

### A3 — Lean visual identity (forward-compatible subset of the full revamp)
This is the slice of Reqs 10/15/17/20 that makes the early ship look institutional **and is reused verbatim by Phase B** — so it is not throwaway.
- **Tokens** (`src/index.css:7-25`): add `--accent-magenta: #e879f9` and `--gradient-brand: linear-gradient(135deg, var(--accent-blue), var(--accent-magenta))`; keep blue/green/red/amber (alias the legacy `--accent-purple`). (Req 10.1-10.3, 10.7)
- **Fonts (CSP-clean):** the Google-Fonts `@import` at `index.css:1` **violates the current CSP** (`font-src 'self' data:`). Self-host **Inter** (body) + **JetBrains Mono** (mono/metrics) + a display face (Satoshi/Manrope) via local `@font-face` with `font-display: swap`; preload mono + body. Apply `--font-mono` to all numeric/metric cells. (Req 15)
- **Flatten + de-gimmick (Req 17.2, 20.1, 20.3):** replace `glass-card` frosted blur with flat fill + 1px hairline + `0 1px 2px rgba(0,0,0,.4)` shadow; **remove the spec-prohibited** ambient `hero-orbs`, `pulseGlow`/`borderGlow`/`gradientShift`/`livePulse` (perpetual glow/breathing) and `animate-count-up` (animated counter). Brand gradient used sparingly: hero, primary CTA, the verdict KPI.
- **Motion budget (Req 17.1):** page transitions 150–250ms, entry ≤300ms; reduced-motion already gated at `index.css:49`.
- Fix `<title>` ("My Google AI Studio App" → product name) + add meta/OG tags.

### A4 — Reframe landing/empty state — `src/components/EmptyHero.tsx`
- Badge → `FOR FUNDED & PROP-CHALLENGE TRADERS`. H1 **"Will you pass your prop challenge?"**; sub **"And is your edge real — or just luck? Upload your trade tape and find out."**
- Replace the `FEATURES` trio (lines 9–28) with: **Pass probability** · **Edge reality check** · **Tail & ruin risk** (plain-English blurbs).
- Add secondary CTA "Reserve early access →" (A5).

### A5 — Paid-intent probe — Stripe Payment Link (no backend)
- Create a Stripe **Payment Link** in the dashboard (no code): "Reserve early access — founding price" pre-order; test 1–3 price points. (User dashboard step, in verification.)
- Code: read `import.meta.env.VITE_STRIPE_EARLY_ACCESS_URL` into one `EARLY_ACCESS_URL` constant (`src/config.ts`); disable the button if unset. CTAs (open in new tab → no CSP change): EmptyHero, the ChallengeVerdict card ("Lock in founding price →"), and the header (`MainHeader.tsx`).
- **Funnel measurement:** one privacy-light analytics snippet (Plausible/Umami `<script>` in `index.html`; **requires adding its domain to CSP `script-src`/`connect-src`**); fire a custom event on each Reserve click. Stripe dashboard counts pre-orders.

### A6 — Compliance disclaimer (council regulatory fix)
- Disclaimer beside the pass-probability + footer: *"Modeled from Monte Carlo resampling of your own past trades. Not a prediction of future results and not financial advice."* Keep "Will you pass?" framed as a modeled probability, never a promise.

### A7 — Deploy the static SPA
- `npm run build` → `dist/` (Vite bundles `wasm-engine/pkg` via `vite-plugin-wasm`). Host: **Cloudflare Pages or Vercel** (free, static). Verify `.wasm` served as `application/wasm` and the Web Worker loads in prod (add COOP/COEP only if a SharedArrayBuffer need surfaces — current worker uses transferable `ArrayBuffer`). Set `VITE_STRIPE_EARLY_ACCESS_URL` + analytics env; attach domain.

---

# PHASE B — Full spec UI revamp (fast-follow, multi-week)

> Delivers the remainder of Reqs 8/10/14/15/16/17/19/20. Adapts SaaS-coupled requirements to no-auth: theme/density persist to **localStorage**; routing is unauthenticated. Follow the spec's structure rule — React only in `components/` + `App.tsx`/route files; pure token/theme logic in `src/theme/`.

### B1 — Token system + theme engine (Req 10 full, 15)
- `src/theme/tokens.ts` = single source of truth for **every dark + light token** (per design.md token table); generate `src/theme.css`, imported by `index.css`. Light mode gated by `[data-theme="light"]` on `<html>`.
- `src/theme/themeMode.ts`: pure `resolve(saved)` consulting `prefers-color-scheme` for `'system'`, fallback `'dark'` on missing/malformed; persist to localStorage.
- Density modes (`spacious`/`compact`) via a root attribute + token scale; persist to localStorage.
- Tests (existing tsx pattern + add `fast-check`): light/dark **registry parity** + WCAG contrast (primary ≥7:1, secondary ≥4.5:1) — spec Property 10.

### B2 — shadcn/ui (Radix + Tailwind v4) migration (Req 14)
- Add Radix + `class-variance-authority`/`tailwind-merge` (reuse existing `cn` in `src/lib/utils`); generate shadcn primitives into `src/components/ui/`; map their CSS vars to the tokens (B1).
- Migrate forms, modals/dialogs (`ExportModal.tsx`), dropdowns, command palette, toasts, popovers, tooltips, tabs (`MainHeader.tsx`), tables (`RunHistoryPanel.tsx`) to shadcn. **Pattern, applied across the ~25 panels** in `src/components/` (e.g. `AttributionPanel.tsx`, `EVTPanel.tsx`, `ModelValidationPanel.tsx`, `PortfolioPanel.tsx`, …): keep logic, swap chrome to shadcn + tokens. No second general-purpose UI lib.

### B3 — Charting policy (Req 16)
- **Retain Recharts** for all existing panels (re-tokenized: `--accent-blue` for sim). Add **Tremor** only for new surfaces (e.g. the ChallengeVerdict KPI tiles/sparklines), themed to the same tokens with `--accent-magenta` marking the headline wedge surface (adapts Req 10.6/20.5 now that ML is deferred). No third chart lib.
- Chart-type choices (gauge/bullet for pass-probability, box plot for distributions, never pie) + mandatory text/numeric fallback per **UI/UX Design Direction**.

### B4 — Routing + marketing site (Req 8, 19) — unauthenticated
- Add `react-router-dom`: public marketing `/` (Req 19 sections: hero, "what it does" prop-first trio, how-it-works, pricing cards reading the founding price, FAQ incl. data-privacy/prop-compatibility/CSV formats, footer — **no fabricated trust signals, no outcome promises**, Req 19.3/19.4), analyzer at `/app`. No auth gate.
- Move the wedge value-prop copy (Phase A) into the marketing hero; use the Trust & Authority + in-sample/out-of-sample before/after angle, one primary CTA, no fabricated proof (per **UI/UX Design Direction**).

### B5 — Spline 3D hero (Req 8) — **requires CSP change**
- `@splinetool/viewer` (bundled → `script-src 'self'` ok), scene from `https://prod.spline.design/...` → **add `https://prod.spline.design` to CSP `connect-src`** (`index.html:8-19`). Gate per Req 8: `prefers-reduced-motion`, Network Information API < 3G, runtime failure → static brand-gradient fallback; never render both. Lazy-load only when the hero will actually render.

### B6 — Surface + motion finalization (Req 17, 20)
- Apply flat 1px-hairline + subtle-shadow treatment and the sparing brand-gradient usage across **all** panels (extends A3 globally); confirm **no `backdrop-filter`** anywhere; no brutalist treatments. Finalize motion timings to spec tolerances; honor reduced-motion everywhere.

### B7 — Revamp smoke/property tests (spec Testing Strategy, adapted)
- tsx smoke checks: tokens contain `--accent-blue:#58a6ff` + `--accent-magenta:#e879f9`; all three font tokens defined with `font-display: swap`; **no `backdrop-filter`** on `.panel`/Card selectors; routes `/`, `/app` registered; React imported only in `components/` + route files.

---

## OUT OF SCOPE (deferred per council + data)
ML edge-discovery / k-medoids clustering · Supabase/Postgres/RLS · accounts & auth · cloud sync · Stripe **webhooks/billing backend** & tier quotas. (The spec's per-account theme/density and `/app` auth gating are adapted to localStorage + unauthenticated routing.)

## Reused, not rebuilt
`propEvalStats` (`simulationEngine.ts:730`, `types.ts:433`) · `buildWalkForwardReport` + null gate (`walkForward.ts:86`) · `PROP_FIRM_PRESETS` (`types.ts:362`) · CSV ingest w/ NinjaTrader auto-detect + `($x)` parsing (`csvIngest.ts:96,226`, `ninjaTraderImport.ts`) · client-side PDF/CSV export (`reportGenerator.tsx`, `csvExport.ts`) · "insufficient data → suppress" pattern (`evt.ts:77,178`, `modelValidation.ts:544`) · existing Tailwind v4 + `motion` + Recharts + `cn` (`src/lib/utils`).

## New dependencies
`react-router-dom` · Radix primitives + `class-variance-authority` + `tailwind-merge` (shadcn) · `@tremor/react` · `@splinetool/viewer` · self-hosted font files (Inter, JetBrains Mono, display face) · `fast-check` (dev, token tests) · optional analytics (Plausible/Umami).

## Verification (end-to-end)
1. `npm run lint` (`tsc --noEmit`) green; `npx tsx src/__tests__/run_all.test.ts` green; (Phase B) `npx tsx` token-parity/contrast + smoke tests green.
2. **Local (`npm run dev`)** with the real tape `C:\Users\demir\OneDrive\Documents\NinjaTrader Grid 2026-04-08 10-41 PM.csv`: NinjaTrader auto-detected; prop rules ON; TOF 50k; `startingCapital` $50k; run → **ChallengeVerdict** shows pass-probability + walk-forward **FAIL** with `+$42 → −$11/trade` (**regression anchor — must match `Institutional_Report-8.pdf`**); disclaimer visible; "Reserve early access" opens the Stripe link.
3. Honesty case: <50-trade CSV → "not enough trades" state, no fake verdict.
4. (Phase B) Theme toggle dark↔light persists; density toggle persists; no horizontal scroll 375–2560px; Spline hero falls back under reduced-motion/slow-network and never double-renders; marketing `/` shows no fabricated trust signals.
5. `npm run build` + `npm run preview` serve; WASM + worker load; CSP allows Spline scene + analytics, blocks all else.
6. Deploy preview works desktop+mobile; funnel events fire; a test-mode Stripe pre-order completes.

## Demand-probe success gate (decides whether the SaaS build is justified)
Run ~2 weeks; seed via short demos in r/Daytrading, r/FuturesTrading, prop Discords. **Proceed to SaaS/auth/billing only if** roughly **≥50 visitors-to-upload and ≥5 paid pre-orders**. Below that: iterate positioning or stop — don't build the cathedral.

## Sequence
**Phase A (ship):** A1 defaults → A2 verdict card → A3 lean identity → A4 hero → A6 disclaimer → A5 Stripe CTA + analytics → A7 deploy.
**Phase B (fast-follow):** B1 tokens/theme → B2 shadcn migration → B3 Tremor → B6 surface/motion → B4 routing/marketing → B5 Spline (+CSP) → B7 tests. Re-deploy.
