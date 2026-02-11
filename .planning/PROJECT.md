# Browser MCP Pre-Scraping Interface

## Current State

- **Shipped milestone:** v1.0 MVP (2026-02-11)
- **Archive:** `.planning/milestones/v1.0-ROADMAP.md`, `.planning/milestones/v1.0-REQUIREMENTS.md`, `.planning/milestones/v1.0-MILESTONE-AUDIT.md`
- **Core value:** An LLM can consistently derive actionable selectors from live page context so downstream procedural scraping is reliable.

## Current Milestone: v1.1 pre-v2.0-structural-improvements

**Goal:** Establish a cleaner architecture baseline before v2.0 by modernizing the extension stack and hardening internal contracts without changing external tool behavior.

**Target features:**
- Full extension migration to TypeScript + WXT.
- Preserve Firefox WebExtension MV2 compatibility during migration.
- Codebase modularization across extension/server hot spots.
- Protocol contract hardening (message shapes, schema expectations, coded errors).
- Behavior-stable restructuring (no net-new end-user tool capabilities).

## What This Is

`browser-mcp` is a selector-first browser automation interface for pre-scraping workflows. It provides deterministic page control, interaction primitives, and discovery-time inspection tools so operators can reason about pages and reliably prepare downstream extraction automation.

## Requirements

### Validated

- ✓ Reproducible local build and startup workflow for operators — v1.0
- ✓ Deterministic core browser controls and wait semantics for repeatable runs — v1.0
- ✓ Interactive selector discovery tooling surface (`click`, `type`, `select`, `press_key`, `evaluate`, `screenshot`) — v1.0
- ✓ Session-scoped inspection for network and console debugging — v1.0

### Active

- [ ] Migrate the extension package to TypeScript + WXT while preserving Firefox MV2 behavior.
- [ ] Improve modularity by splitting oversized files/functions and clarifying ownership boundaries.
- [ ] Harden MCP-extension protocol contracts for predictable, typed integrations.
- [ ] Maintain current tool semantics and user-visible behavior throughout restructuring.

### Out of Scope

- CDP/DevTools-protocol-dependent features for core workflow behavior.
- Arbitrary browser code execution tooling beyond controlled inspection.
- Coordinate/vision-first interactions as a primary control model.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Selector-first toolset prioritized over broad test parity | Fastest path to reliable pre-scraping value | ✓ Good |
| Session-owned tab model with no active-tab fallback | Deterministic targeting and safer automation behavior | ✓ Good |
| Machine-readable coded errors and strict transport behavior | Better automation observability and failure handling | ✓ Good |
| Selector export handoff removed from v1 scope | YAGNI for current shipped value | ✓ Good |

## Next Milestone Goals

1. Complete full extension modernization to TypeScript + WXT without manifest/runtime regressions.
2. Land modularization changes that reduce maintenance risk ahead of v2.0.
3. Standardize protocol contract boundaries so future features can be added safely.

---
*Last updated: 2026-02-11 after starting v1.1 pre-v2.0-structural-improvements*
