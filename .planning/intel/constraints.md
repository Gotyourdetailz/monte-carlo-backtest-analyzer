# Constraints (SPEC-equivalent)

Extracted from the Monte-Carlo SaaS Ship Plan (classified DOC). These are the technical/design constraints (NFRs, contracts, protocols, schema/token contracts) embedded in the UI/UX Design Direction and the verification gates.

---

## CON-csp-policy — Content Security Policy contract
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (A3, A5, B5; Verification 5)
- type: protocol
- content:
  - Current CSP `font-src 'self' data:` — the Google-Fonts `@import` (`index.css:1`) violates it; must be removed in favor of self-hosted fonts.
  - Analytics (Plausible/Umami) requires adding its domain to `script-src`/`connect-src`.
  - Spline hero requires adding `https://prod.spline.design` to `connect-src` (`index.html:8-19`).
  - Stripe Payment Link CTAs open in a new tab → no CSP change required.
  - Final state: CSP allows the Spline scene + analytics, blocks all else.

## CON-color-semantics — Strict color semantics (a11y, spec Req 10)
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (UI/UX Direction → Color semantics)
- type: nfr
- content:
  - Blue `#58a6ff` = simulation/primary data + interactive (charts, links, focus rings).
  - Magenta `#e879f9` = brand + Challenge Verdict surface only (hairline + headline KPI) + primary-CTA gradient; kept scarce.
  - Green/Red/Amber = semantic PnL/risk only, ALWAYS paired with icon or word (never color alone), so red/green-blind traders can read it.
  - Brand gradient (blue→magenta) only on hero, primary CTA, verdict KPI; static, never animated.

## CON-typography — Typography contract
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (UI/UX Direction → Typography; A3/B1)
- type: nfr
- content:
  - JetBrains Mono for every number/metric/hash/table cell with `font-variant-numeric: tabular-nums`; data sizes 12/14/16, hero KPI larger.
  - Inter body (line-height 1.5, 65–75ch); display face (Satoshi/Manrope) for hero headline only; weights 700/500/400.
  - Self-hosted + `font-display: swap`; preload mono + body.

## CON-a11y-quality-gates — Accessibility / quality gates (every surface)
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (UI/UX Direction → Quality gates; B1 contrast)
- type: nfr
- content:
  - Contrast >=4.5:1 (>=7:1 primary per spec); visible focus rings; `prefers-reduced-motion` honored.
  - Lucide SVG icons only (no emoji); 44px touch targets; no horizontal scroll 375–2560px.
  - Tables: `aria-sort`, sticky header, row-hover, `overflow-x-auto` → stacked cards <=768px; skeleton/shimmer only while a run computes (>300ms), never idle.

## CON-motion-budget — Motion budget
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (A3 motion budget; UI/UX Direction; B6)
- type: nfr
- content:
  - Page transitions 150–250ms; entry animations <=300ms.
  - No perpetual glow/breathing animations (`pulseGlow`/`borderGlow`/`gradientShift`/`livePulse`); no animated counter (`animate-count-up`); no idle shimmer.
  - No `backdrop-filter` anywhere (flat 1px-hairline surfaces instead of frosted glass).

## CON-walkforward-null-gate — Walk-forward honesty/null gate (data contract)
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (A2; Verification 3; walkForward.ts:86,93,98)
- type: api-contract
- content:
  - `buildWalkForwardReport` (`walkForward.ts:86`) returns null when n<50 or train<30 or oos<10.
  - Consumers MUST render an honest "not enough trades (need >=50; you have N)" panel on null — never fabricate a verdict.
  - Verdict is PASS/WARN/FAIL with `trainMean → oosMean` delta and a `note`.

## CON-architecture-static-spa — Static, backend-free SPA constraint
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Context; A7; OUT OF SCOPE)
- type: nfr
- content:
  - Fully static Vite SPA: WASM bundled (`vite-plugin-wasm`), IndexedDB-only persistence, client-side PDF/CSV export. No backend.
  - No Supabase/Postgres/RLS, no auth, no cloud sync, no Stripe billing backend/webhooks/quotas.
  - `.wasm` must be served as `application/wasm`; Web Worker must load in prod; COOP/COEP added only if a SharedArrayBuffer need surfaces (current worker uses transferable `ArrayBuffer`).

## CON-code-structure — Code structure rule (from spec)
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Phase B intro; B7)
- type: protocol
- content:
  - React used only in `components/` + `App.tsx`/route files; pure token/theme logic isolated in `src/theme/`.
  - No second general-purpose UI lib (shadcn only); no third chart lib (Recharts + Tremor only).

## CON-regression-anchor — Regression anchor (real-tape fixture)
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Verification 2; Institutional_Report-8.pdf)
- type: api-contract
- content:
  - Real tape (NinjaTrader Grid 2026-04-08 CSV), prop rules ON, TOF 50k, startingCapital $50k → ChallengeVerdict must show pass-probability + walk-forward FAIL with `+$42 → −$11/trade`, matching `Institutional_Report-8.pdf`. This is the load-bearing regression anchor.
