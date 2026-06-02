# Synthesis Summary

Entry point for `gsd-roadmapper`. Synthesized from the GSD doc-ingest classification set on 2026-05-31.

Mode: new (net-new bootstrap, no existing .planning/ decisions).
Precedence: ADR > SPEC > PRD > DOC (no per-doc overrides).

---

## Docs synthesized

| Type | Count | Sources |
|------|-------|---------|
| DOC  | 1     | docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md |
| ADR  | 0     | — |
| SPEC | 0     | — |
| PRD  | 0     | — |

Total: 1 doc. Classifier confidence: medium. Source `locked: false`, type DOC.
The single DOC mixes ADR-like, PRD-like, and SPEC-like content (per classifier notes), so it was decomposed across all four intel files.

## Decisions (decisions.md)

9 product decisions extracted. None are formal LOCKED ADRs (source is DOC, `locked: false`); the doc's "Locked decisions (user)" block is recorded as declared-locked-by-user for the roadmapper to formalize.
- DEC-free-tool-plus-demand-probe, DEC-positioning-both-prop-first, DEC-stripe-payment-link, DEC-defer-ml, DEC-full-spec-ui-revamp, DEC-no-auth-localstorage, DEC-static-spa-deploy, DEC-honesty-gate, DEC-no-fabricated-trust-signals.
- True LOCKED-ADR count: 0.

## Requirements (requirements.md)

15 requirements extracted.
- Phase A (8): REQ-prop-trader-defaults, REQ-challenge-verdict-card, REQ-lean-visual-identity, REQ-reframe-empty-state, REQ-paid-intent-probe, REQ-compliance-disclaimer, REQ-static-deploy, REQ-demand-probe-gate.
- Phase B (7): REQ-token-theme-engine, REQ-shadcn-migration, REQ-charting-policy, REQ-routing-marketing, REQ-spline-hero, REQ-surface-motion-finalization, REQ-revamp-tests.
- No competing acceptance variants (single source).

## Constraints (constraints.md)

9 constraints extracted.
- protocol (2): CON-csp-policy, CON-code-structure.
- nfr (5): CON-color-semantics, CON-typography, CON-a11y-quality-gates, CON-motion-budget, CON-architecture-static-spa.
- api-contract (2): CON-walkforward-null-gate, CON-regression-anchor.

## Context (context.md)

8 topics: status & resumption, strategy rationale, goal, two-phase rationale, out-of-scope, reused-not-rebuilt, new dependencies, sequence, cross-references (provenance anchors).

## Conflicts

- Blockers: 0
- Competing variants: 0
- Auto-resolved: 0
- INFO: 8 (single-source note, mixed-type classification, not-yet-implemented status, revamp-vs-gate tension, spec no-auth adaptation, phased CSP sequencing, regression-anchor on non-ingested PDF, provenance-only cross-refs).

Detail: ../INGEST-CONFLICTS.md

## Cycle detection

Run on the cross-ref graph. No cycle within the ingest set — all cross-refs resolve to non-ingested external anchors. Traversal depth well under the 50 cap.

## Per-type intel files

- ./decisions.md — product decisions (ADR-equivalent)
- ./requirements.md — Phase A/B requirements (PRD-equivalent)
- ./constraints.md — CSP, color/typography/a11y/motion NFRs, data contracts (SPEC-equivalent)
- ./context.md — background, rationale, reuse map, scope, provenance

## Status

READY — safe to route. No blockers, no competing variants. Roadmapper should note the 8 INFO items, especially the revamp-vs-demand-gate boundary and the possible plan-vs-repo drift (memory indicates Phase A/B partially coded; plan doc says not-yet-implemented).
