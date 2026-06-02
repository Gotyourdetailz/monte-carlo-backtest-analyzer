# Roadmap: EdgeCheck

## Overview

EdgeCheck ships a free, backend-free prop-challenge analyzer as a demand probe. **Milestone 1's wedge and UI foundation are already built and verified** (branch `feat/institutional-add-ons`: tsc clean, vite build green, 26/27 tests passing) — collapsed below as the shipped Phase 0. The active roadmap is the **remaining Milestone 1 work**: make light mode correct across every analyzer panel (the #1 priority), finish the shadcn chrome migration, add Tremor KPI tiles to the verdict surface, wire the live Stripe pre-order + deploy the static SPA, then run the 2-week demand probe whose result gates the (deferred, locked) Milestone 2 SaaS build. The journey ends at a measured go/no-go decision — not a backend.

## Milestones

- ✅ **Milestone 1 (foundation) — Phase 0** — Prop wedge + UI revamp foundation (built, verified on `feat/institutional-add-ons`)
- 🚧 **Milestone 1 (completion) — Phases 1–5** — Light-mode sweep → shadcn migration → Tremor → live probe + deploy → demand gate
- 📋 **Milestone 2 — GATED** — SaaS conversion + (deferred) ML. Locked behind the Phase 5 demand-probe metric; NOT scheduled.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked INSERTED)
- Phase 0: Already-shipped foundation (reference only)

- [x] **Phase 0: Shipped Foundation** - Prop wedge (A1–A6) + UI foundation (B1, B4, B5, B7) already built
- [ ] **Phase 1: Light-Mode Panel Sweep** - Every analyzer panel renders correctly in light mode (#1 priority)
- [ ] **Phase 2: shadcn Chrome Migration** - Remaining ~24 panels use the shared ui/ primitives
- [ ] **Phase 3: Verdict KPI Polish (Tremor)** - Challenge Verdict gets themed KPI tiles + sparklines
- [ ] **Phase 4: Live Probe + Deploy** - Stripe pre-order live, analytics firing, static SPA hosted
- [ ] **Phase 5: Demand Probe & Gate Decision** - 2-week probe run; go/no-go on the SaaS build

## Phase Details

<details>
<summary>✅ Phase 0: Shipped Foundation — built & verified on feat/institutional-add-ons</summary>

### Phase 0: Shipped Foundation
**Goal**: The prop wedge and UI foundation are live in the repo — nothing here is active work.
**Depends on**: Nothing
**Requirements**: REQ-prop-trader-defaults, REQ-challenge-verdict-card, REQ-lean-visual-identity, REQ-reframe-empty-state, REQ-compliance-disclaimer, REQ-token-theme-engine, REQ-routing-marketing, REQ-spline-hero, REQ-revamp-tests
**Success Criteria** (verified TRUE):
  1. Analyzer defaults to TopOneFutures 50k prop settings; a real tape shows `startingCapital` $50k. (A1)
  2. The Challenge Verdict card renders a pass-probability gauge + walk-forward edge verdict, with an honest null panel when n<50. (A2)
  3. Lean identity shipped: magenta accent + brand gradient, self-hosted fonts (no Google import), flat no-blur surfaces, gimmick animations removed. (A3)
  4. Empty state reframed to "Will you pass your prop challenge?" with the prop-first feature trio + Reserve CTA. (A4, A6)
  5. Theme engine (light/dark/system + spacious/compact, localStorage, no-flash) and ThemeToggle work; WCAG contrast tests pass. (B1)
  6. App is routed: marketing `/` + analyzer `/app`, code-split, no auth gate. (B4)
  7. Spline 3D hero renders with reduced-motion / slow-network / WebGL / error fallback to a static gradient. (B5)
  8. Revamp smoke tests pass (token presence, no backdrop-filter, routes registered, font-display swap). (B7)
**Plans**: Shipped (no active plans)

Plans:
- [x] A1–A6: Prop defaults, verdict card, lean identity, empty-state, disclaimer, Stripe-CTA code
- [x] B1: Theme engine + tokens + ThemeToggle
- [x] B4: react-router-dom marketing + analyzer routes
- [x] B5: Spline hero with gated fallback
- [x] B7: Revamp smoke/property tests

</details>

### Phase 1: Light-Mode Panel Sweep
**Goal**: Every analyzer panel in `/app` renders correctly in light mode by reading theme tokens instead of hardcoded dark hex. This is the load-bearing follow-up — the theme engine (B1) exists but ~24 panels still hardcode `#010409`/`#0d1117`/`#238636`/`text-[#c9d1d9]`, so light mode is currently broken in the analyzer.
**Depends on**: Phase 0 (theme engine from B1)
**Requirements**: REQ-surface-motion-finalization
**Success Criteria** (what must be TRUE):
  1. User toggling to light mode sees correct, readable colors on every analyzer panel — no dark-on-dark or invisible text anywhere in `/app`.
  2. No analyzer panel contains a hardcoded dark hex (`#010409`, `#0d1117`, `#238636`, `text-[#c9d1d9]`, etc.); all surfaces, text, and semantic colors resolve from theme tokens.
  3. Flat 1px-hairline + subtle-shadow surfaces apply across all panels; no `backdrop-filter` remains anywhere; no brutalist treatments.
  4. Color semantics hold: green/red/amber values are always paired with an icon or word, never color alone; brand magenta stays scarce.
  5. WCAG contrast (≥4.5:1, ≥7:1 primary) passes in both light and dark for every migrated panel; reduced-motion honored.
**Plans**: TBD
**UI hint**: yes

### Phase 2: shadcn Chrome Migration
**Goal**: The remaining ~24 analyzer panels swap their bespoke chrome for the shared `src/components/ui/*` shadcn primitives (the `ExportModal` exemplar pattern), keeping all logic intact, so the UI is consistent and token-driven across the whole app.
**Depends on**: Phase 1 (panels token-clean first, so migration doesn't re-introduce hardcoded styles)
**Requirements**: REQ-shadcn-migration
**Success Criteria** (what must be TRUE):
  1. Forms, modals/dialogs, dropdowns, command palette, toasts, popovers, tooltips, tabs, and tables across the ~24 remaining panels render via the `ui/` primitives, not bespoke markup.
  2. Every migrated panel keeps its existing behavior — no functional regression in any analyzer feature.
  3. Primitive CSS variables map to the B1 tokens, so all chrome respects light/dark + density automatically.
  4. Only one general-purpose UI lib (shadcn/Radix) is present; the `cn` helper is reused, no duplicate utility added.
**Plans**: TBD
**UI hint**: yes

### Phase 3: Verdict KPI Polish (Tremor)
**Goal**: The Challenge Verdict surface — the single most important screen — gains polished, themed KPI tiles and sparklines via Tremor, while Recharts continues to serve every existing panel.
**Depends on**: Phase 1 (tokens) — independent of Phase 2 chrome but sequenced after for a coherent surface
**Requirements**: REQ-charting-policy
**Success Criteria** (what must be TRUE):
  1. ChallengeVerdict shows Tremor KPI tiles + sparklines themed to the same tokens, with `--accent-magenta` reserved for the headline wedge.
  2. Pass-probability renders as a gauge/bullet (never a pie); distributions use box plots; every chart ships a text/numeric fallback.
  3. Existing Recharts panels remain, re-tokenized to `--accent-blue` for simulation data — no chart looks off-theme in light or dark.
  4. Only Recharts + Tremor are present (no third chart lib); reduced-motion is honored on all charts.
**Plans**: TBD
**UI hint**: yes

### Phase 4: Live Probe + Deploy
**Goal**: The live "Reserve early access" funnel works end to end and the static SPA is publicly hosted, so real prop traders can use the tool and the demand probe can begin.
**Depends on**: Phases 1–3 (ship a polished build)
**Requirements**: REQ-paid-intent-probe (external wiring), REQ-static-deploy
**Success Criteria** (what must be TRUE):
  1. A real Stripe Payment Link (founding-price pre-order) is configured; `VITE_STRIPE_EARLY_ACCESS_URL` is set and all Reserve CTAs (EmptyHero, ChallengeVerdict, header) open it in a new tab; CTAs disable cleanly if unset.
  2. Privacy-light analytics is live with its domain allow-listed in CSP, firing a custom event on every Reserve click and tracking visitor→upload.
  3. `npm run build` produces a `dist/` that is hosted on Cloudflare Pages / Vercel; the WASM Web Worker loads in production with `.wasm` served as `application/wasm`.
  4. A visitor can open the public URL, upload a real CSV tape, and see a Challenge Verdict — the regression-anchor tape (TOF 50k, prop rules on) reproduces walk-forward FAIL `+$42 → −$11/trade`.
**Plans**: TBD
**UI hint**: yes

### Phase 5: Demand Probe & Gate Decision
**Goal**: Run the ~2-week demand probe, measure real visitor→upload conversions and paid pre-orders, and make the locked go/no-go decision on the (deferred) SaaS build. This is the project's actual success metric.
**Depends on**: Phase 4 (live, hosted tool)
**Requirements**: REQ-demand-probe-gate
**Success Criteria** (what must be TRUE):
  1. The probe runs ~2 weeks, seeded via demos in r/Daytrading, r/FuturesTrading, and prop Discords.
  2. Visitor→upload conversions and paid pre-orders are measured against the gate (~≥50 uploads AND ≥5 pre-orders).
  3. A documented go/no-go decision is recorded: proceed to the Milestone 2 SaaS build only if the gate is met; otherwise iterate positioning or stop.
**Plans**: TBD

---

### 📋 Milestone 2: SaaS Conversion (GATED — NOT scheduled)
**Goal**: Convert to a paid SaaS (accounts/auth, Supabase/Postgres/RLS, cloud sync, Stripe billing backend/webhooks/tier quotas).
**Status**: Deferred — locked behind the Phase 5 demand-probe gate. Do not plan until the gate passes.
**Note**: ML edge-discovery (k-medoids clustering) is deferred **entirely** — proven statistically hollow on normal-sized tapes; not part of Milestone 2 either.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 (Phase 0 already shipped; Milestone 2 gated).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Shipped Foundation | — | Complete | 2026-05-31 |
| 1. Light-Mode Panel Sweep | 0/TBD | Not started | - |
| 2. shadcn Chrome Migration | 0/TBD | Not started | - |
| 3. Verdict KPI Polish (Tremor) | 0/TBD | Not started | - |
| 4. Live Probe + Deploy | 0/TBD | Not started | - |
| 5. Demand Probe & Gate Decision | 0/TBD | Not started | - |
