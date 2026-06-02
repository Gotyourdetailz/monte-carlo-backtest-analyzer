# Decisions (ADR-equivalent)

Extracted from the Monte-Carlo SaaS Ship Plan (classified DOC). These are the "Locked decisions (user)" and other product-level decisions embedded in the plan. The source doc is `locked: false` and type DOC, so none of these carry true LOCKED-ADR precedence — they are recorded as product decisions for the roadmapper to formalize. Tensions are surfaced in INGEST-CONFLICTS.md.

---

## DEC-free-tool-plus-demand-probe — Free public tool + demand probe
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Context → "Locked decisions (user)")
- status: declared-locked-by-user (doc not a formal locked ADR)
- decision: Ship the analyzer as a free, public, backend-free tool and use it as a demand probe rather than launching a paid SaaS up front.
- scope: product positioning / go-to-market

## DEC-positioning-both-prop-first — Positioning "both, prop-first"
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Context → "Locked decisions (user)")
- status: declared-locked-by-user
- decision: Position the product for "both" audiences but lead prop-first (prop-challenge / funded traders are the primary wedge).
- scope: positioning / messaging

## DEC-stripe-payment-link — Stripe Payment Link for paid intent (no backend)
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Context → "Locked decisions"; A5)
- status: declared-locked-by-user
- decision: Measure hard paid intent via a no-code Stripe Payment Link ("Reserve early access — founding price" pre-order), NOT a Stripe billing backend / webhooks / tier quotas (those are explicitly out of scope).
- scope: monetization / demand validation

## DEC-defer-ml — ML edge-discovery deferred entirely
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Context; OUT OF SCOPE)
- status: declared-locked-by-user
- decision: Defer the ML "edge-discovery" k-medoids clustering entirely. Rationale: statistically hollow on normal-sized tapes (127 trades → 89 regime cells, median 1 trade/cell; k>=4 → <10 OOS trades/cluster). The spec's ML-magenta accent intent is repurposed for the Challenge Verdict surface.
- scope: analytics / feature set

## DEC-full-spec-ui-revamp — Full spec UI revamp committed (phased)
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Context → "Locked decisions"; references .kiro/specs/saas-ml-platform-revamp Reqs 8,10,14,15,16,17,19,20)
- status: declared-locked-by-user
- decision: Commit to the full UI spec revamp, but split delivery into Phase A (lean, forward-compatible subset) and Phase B (remainder of the spec) as a structured fast-follow. Nothing in Phase A is rework.
- scope: UI / design system

## DEC-no-auth-localstorage — Auth deferred; preferences to localStorage; unauthenticated routing
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Context honest-timeline note; Phase B intro; OUT OF SCOPE)
- status: declared-locked-by-user (adaptation of spec)
- decision: Since auth is deferred, the spec's SaaS-coupled UI requirements (per-account theme/density, `/app` auth gating) are adapted: theme/density preferences persist to localStorage and routing is unauthenticated.
- scope: architecture / UI persistence

## DEC-static-spa-deploy — Fully static, backend-free Vite SPA deploy
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Context; A7)
- status: declared-locked-by-user
- decision: Deploy as a fully static, backend-free Vite SPA (WASM bundled, IndexedDB-only, client-side PDF/CSV export). Host on Cloudflare Pages or Vercel (free static).
- scope: deployment / architecture

## DEC-honesty-gate — Honest "insufficient data → null" verdicts (no fabrication)
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Context; A2; A6; UI/UX Direction)
- status: declared-design-principle
- decision: Never fabricate a verdict. Walk-forward report null (n<50 or train<30/oos<10) → render honest "not enough trades" panel. Microcopy states modeled probabilities, never "you will pass".
- scope: product integrity / compliance

## DEC-no-fabricated-trust-signals — No fabricated logos/testimonials/stats on marketing
- source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (UI/UX Direction → Landing; B4; Req 19.3/19.4)
- status: declared-design-principle
- decision: Marketing site uses a "Trust & Authority + honesty" angle with no fabricated logos, testimonials, stats, or outcome promises; transparent founding price; one primary CTA.
- scope: marketing / compliance
