# Context (DOC running notes)

Verbatim-attributed context from the Monte-Carlo SaaS Ship Plan. Background, rationale, reuse map, and scope boundaries that inform but do not bind the plan.

---

## Topic: Status & resumption
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (status callout)
- Status: not yet implemented — paused on usage credits (2026-05-31). Resume from Phase A → A1.
- Repo: `C:\Users\demir\antigravity\Monte-Carlo-Backtest-Analyzer`. Source plan: `C:\Users\demir\.claude\plans\so-based-off-this-happy-moth.md`.
- Background: LLM-council verdict (`council-transcript-2026-05-31`) + a 127-trade real-data test proved the ML feature is statistically hollow and the prop-pass-probability + walk-forward outputs are the real wedge. Builds on `Monte-Carlo-Backtest-Simulator-Plan`.

## Topic: Strategy rationale (why this plan)
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Context)
- ML "edge-discovery" clustering is statistically hollow on normal-sized tapes (127 trades → 89 regime cells, median 1 trade/cell; k>=4 → <10 OOS trades/cluster) → defer entirely.
- The existing engine already computes the two killer honest outputs prop traders care about with zero new analytics: Monte Carlo prop pass-probability (`propEvalStats.passRate`) and the walk-forward "is my edge real or luck" verdict (`buildWalkForwardReport` → PASS/WARN/FAIL with insufficient-data → null gate).
- The app is a fully static, backend-free Vite SPA (WASM bundled, IndexedDB-only, client-side PDF/CSV export) — deployable as-is.

## Topic: Goal
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Context → Goal)
- Get the wedge in front of prop-challenge takers and measure pre-payment. That signal — not engineering volume — decides whether the SaaS build is justified.

## Topic: Two-phase rationale (timeline honesty)
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Context → honest timeline note)
- Full UI revamp (shadcn migration of ~25 panels, Tremor, Spline hero, full light/dark token system + density, routed marketing) is multi-week, not a this-week ship.
- Phase A ships the wedge + a lean visual identity quickly and is forward-compatible (nothing is rework). Phase B completes the entire spec revamp as a structured fast-follow.
- Spec UI requirements assumed the SaaS conversion (per-account theme/density, `/app` auth gating); since auth is deferred, those preferences persist to localStorage and routing is unauthenticated.

## Topic: Out of scope (deferred per council + data)
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (OUT OF SCOPE)
- ML edge-discovery / k-medoids clustering; Supabase/Postgres/RLS; accounts & auth; cloud sync; Stripe webhooks/billing backend & tier quotas.
- Spec's per-account theme/density and `/app` auth gating adapted to localStorage + unauthenticated routing.

## Topic: Reused, not rebuilt
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Reused, not rebuilt)
- `propEvalStats` (`simulationEngine.ts:730`, `types.ts:433`); `buildWalkForwardReport` + null gate (`walkForward.ts:86`); `PROP_FIRM_PRESETS` (`types.ts:362`); CSV ingest w/ NinjaTrader auto-detect + `($x)` parsing (`csvIngest.ts:96,226`, `ninjaTraderImport.ts`); client-side PDF/CSV export (`reportGenerator.tsx`, `csvExport.ts`); "insufficient data → suppress" pattern (`evt.ts:77,178`, `modelValidation.ts:544`); existing Tailwind v4 + `motion` + Recharts + `cn` (`src/lib/utils`).

## Topic: New dependencies
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (New dependencies)
- `react-router-dom`; Radix primitives + `class-variance-authority` + `tailwind-merge` (shadcn); `@tremor/react`; `@splinetool/viewer`; self-hosted font files (Inter, JetBrains Mono, display face); `fast-check` (dev, token tests); optional analytics (Plausible/Umami).

## Topic: Sequence
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Sequence)
- Phase A: A1 defaults → A2 verdict card → A3 lean identity → A4 hero → A6 disclaimer → A5 Stripe CTA + analytics → A7 deploy.
- Phase B: B1 tokens/theme → B2 shadcn migration → B3 Tremor → B6 surface/motion → B4 routing/marketing → B5 Spline (+CSP) → B7 tests. Re-deploy.

## Topic: Cross-references (external, not in ingest set)
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (frontmatter + body links)
- Referenced but NOT ingested as separate classified docs: `Monte-Carlo-Backtest-Simulator-Plan`, `council-transcript-2026-05-31`, `.kiro/specs/saas-ml-platform-revamp` (the UI spec, Reqs 8/10/14/15/16/17/19/20), `Institutional_Report-8.pdf` (regression anchor), `so-based-off-this-happy-moth.md` (origin plan). These are provenance anchors; their content is not synthesized here.
