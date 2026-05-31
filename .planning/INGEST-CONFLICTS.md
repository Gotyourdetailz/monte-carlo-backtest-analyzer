## Conflict Detection Report

Single source document ingested (Monte-Carlo SaaS Ship Plan, classified DOC). No cross-doc contradictions are possible. No cycles in the cross-ref graph (all cross-refs point to non-ingested external anchors). Classifier confidence is `medium` (not low), so no re-tag blocker. Items below are internal tensions and implementation-status notes surfaced as INFO for downstream transparency.

### BLOCKERS (0)

(none)

### WARNINGS (0)

(none)

### INFO (8)

[INFO] Single-source synthesis — no precedence contest
  Note: Only one classified doc (docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md, type DOC). All decisions/requirements/constraints derive from one source, so no ADR>SPEC>PRD>DOC precedence resolution was needed and no auto-resolution occurred.

[INFO] DOC carries ADR/PRD/SPEC-mixed content despite DOC classification
  Note: The classifier flagged (notes field) that this implementation-plan mixes locked product decisions (ADR-like), feature requirements (PRD-like), and UI/design constraints (SPEC-like). Source `locked: false`, so the "Locked decisions (user)" block is recorded in decisions.md as declared-locked-by-user, NOT as a formal LOCKED-ADR. The roadmapper should decide whether to formalize these into ADRs. Source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Context → "Locked decisions (user)").

[INFO] Implementation status: not yet implemented, paused
  Note: Source status callout reads "not yet implemented — paused on usage credits (2026-05-31). Resume from Phase A → A1." All requirements are pending; none are verified-built. Source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (status callout). (Project memory separately indicates a Phase A wedge was coded on feat/institutional-add-ons and Phase B foundation started — a possible drift between the plan doc and repo state that the roadmapper may want to reconcile, but it is outside this ingest set.)

[INFO] Internal tension: "Full spec UI revamp" locked vs. validation-gated SaaS build
  Note: DEC-full-spec-ui-revamp commits to the full revamp (Phase B, multi-week), while the Demand-probe success gate states "Proceed to SaaS/auth/billing only if >=50 visitors-to-upload and >=5 paid pre-orders ... don't build the cathedral." Phase B UI work is framed as fast-follow, but its scope is large relative to an unvalidated wedge. Not a contradiction (auth/billing are the gated items, not UI), but the boundary between "ship Phase B UI" and "gate the SaaS build" is worth an explicit roadmapper decision. Source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Context "Locked decisions" + Demand-probe success gate).

[INFO] Spec adaptation: SaaS-coupled UI requirements remapped to no-auth
  Note: The .kiro spec assumed SaaS conversion (per-account theme/density, `/app` auth gating). Since auth is deferred (DEC-no-auth-localstorage), preferences persist to localStorage and routing is unauthenticated. This is a deliberate adaptation, not a conflict, but it means synthesized requirements diverge from the referenced (non-ingested) spec's literal wording. Source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Context honest-timeline note; Phase B intro).

[INFO] CSP changes are phased and sequencing-sensitive
  Note: CON-csp-policy requires three coordinated CSP edits across phases — remove Google-Fonts import (A3), add analytics domain (A5), add prod.spline.design to connect-src (B5). Stripe CTAs need no CSP change. Mis-sequencing (e.g. shipping analytics before its CSP allowlist) would break funnel measurement. Source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (A3, A5, B5; Verification 5).

[INFO] Load-bearing regression anchor depends on a non-ingested artifact
  Note: CON-regression-anchor and REQ-challenge-verdict-card both assert the real-tape result must match `Institutional_Report-8.pdf` (+$42 → −$11/trade, walk-forward FAIL). That PDF is referenced but not in the ingest set, so the anchor's exact numbers cannot be verified during synthesis — they are carried forward verbatim from the plan. Source: docs/Monte-Carlo-SaaS-Ship-Plan-2026-05-31.md (Verification 2).

[INFO] Cross-refs are provenance-only; no graph cycle
  Note: cross_refs (Monte-Carlo-Backtest-Simulator-Plan, council-transcript, .kiro spec, Institutional_Report-8.pdf, origin plan, plus source-code paths) resolve to non-ingested files. Cycle detection found no cycle within the ingest set. These are recorded in context.md as provenance anchors only. Source: classification cross_refs.
