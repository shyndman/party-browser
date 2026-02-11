# Roadmap: Browser MCP Pre-Scraping Interface

## Milestones

- ✅ **v1.0 MVP** - Phases 1, 2, 2.1, 2.2, 3 (shipped 2026-02-11)
- 🚧 **v1.1 pre-v2.0-structural-improvements** - Phases 6-9 (planned)

## Overview

This milestone delivers a behavior-stable structural migration: move to a two-package pnpm workspace, migrate the extension to TypeScript + WXT with Firefox MV2 preserved, modularize hot spots, and execute a clean-break rename/rebrand to `blindflight`. The roadmap intentionally excludes protocol contract hardening and any net-new capabilities, then closes with a parity gate to verify unchanged runtime behavior.

## Phases

- [ ] **Phase 6: Workspace Foundation** - Establish the locked two-package workspace baseline and root automation.
- [ ] **Phase 7: TS/WXT Migration + Modularization** - Migrate extension/runtime structure while preserving MV2 behavior and splitting oversized modules.
- [ ] **Phase 8: Clean-Break Rename + Rebrand** - Remove all `browser_` tool naming and rebrand maintained identifiers to `blindflight`.
- [ ] **Phase 9: Behavior Parity Validation Gate** - Enforce release gating that proves behavior parity after structural changes.

## Phase Details

### Phase 6: Workspace Foundation
**Goal**: Developers can use one reproducible pnpm workspace root with exactly `packages/mcp` and `packages/extension` for install, build, and test entrypoints.
**Depends on**: Phase 3
**Requirements**: WS-01, WS-02, WS-03
**Success Criteria** (what must be TRUE):
  1. Developers can run install from the workspace root and resolve exactly two workspace packages: `packages/mcp` and `packages/extension`.
  2. Developers can build MCP and extension packages independently via workspace package scripts.
  3. Developers can run milestone build/test flows from workspace-level scripts without ad hoc package-local steps.
**Plans**: 2 plans in 2 waves

Plans:
- [ ] **06-01** — Establish pnpm workspace topology and package boundaries
  - Wave 1 | 7 tasks | Autonomous
  - Creates: `pnpm-workspace.yaml`, `packages/mcp/`, `packages/extension/`
  - Migrates: root `src/` → `packages/mcp/src/`, root `extension/` → `packages/extension/`
  
- [ ] **06-02** — Wire root install/build/test scripts for milestone flows
  - Wave 2 | 9 tasks | Autonomous | Depends on 06-01
  - Creates: Root script surface (build/build:mcp/build:extension, test, dev, etc.)
  - Creates: `scripts/dev-orchestrator.mjs` for parallel dev execution

### Phase 7: TS/WXT Migration + Modularization
**Goal**: Operators and developers can use a TypeScript + WXT extension and modularized runtime code while preserving Firefox MV2 behavior and existing workflows.
**Depends on**: Phase 6
**Requirements**: EXT-01, EXT-02, EXT-03, MOD-01, MOD-02, MOD-03
**Success Criteria** (what must be TRUE):
  1. Operators can build/run the extension from TypeScript + WXT and produce a Firefox MV2 `.xpi` artifact.
  2. Operators can run existing extension-driven workflows with required permissions (including `tabGroup` and `tabs`) and no runtime-mode change from MV2.
  3. Developers can work in focused extension background modules instead of one oversized file.
  4. Developers can work in MCP server modules with clear ownership for tool registration, protocol handling, and runtime orchestration.
  5. Developers can modify one module area with limited cross-module edits and no behavior change.
**Plans**: TBD

Plans:
- [ ] 07-01: Migrate extension runtime to TypeScript + WXT with MV2 parity
- [ ] 07-02: Modularize extension background and MCP server hot spots

### Phase 8: Clean-Break Rename + Rebrand
**Goal**: The runtime, tooling, and maintained project surfaces use unprefixed tool names and consistent `blindflight` branding with no legacy compatibility aliases.
**Depends on**: Phase 7
**Requirements**: REN-01, REN-02, REN-03, BRAND-01, BRAND-02, BRAND-03
**Success Criteria** (what must be TRUE):
  1. Operators can invoke the full supported MCP tool surface with unprefixed names, wired consistently through MCP registration, server dispatch, extension dispatch, and extension handlers.
  2. Operators cannot invoke legacy `browser_`-prefixed tool names in v1.1.
  3. Developers can search for `browser_` and find no active runtime codepaths, handlers, dispatch cases, protocol message names, or MCP-exposed tool names.
  4. Operators can install and run the MCP package under `blindflight` naming.
  5. Operators and developers can see consistent `blindflight` branding across maintained extension/package/binary/docs surfaces with no active legacy browsermcp identifiers.
**Plans**: TBD

Plans:
- [ ] 08-01: Execute coordinated unprefixed tool rename sweep
- [ ] 08-02: Complete blindflight rebrand across maintained surfaces

### Phase 9: Behavior Parity Validation Gate
**Goal**: Release readiness is proven through explicit parity checks that confirm no behavioral regressions from structural migration.
**Depends on**: Phase 8
**Requirements**: PAR-01, PAR-02, PAR-03
**Success Criteria** (what must be TRUE):
  1. Operators can run a parity validation gate that verifies unchanged tool semantics for the migrated/restructured system.
  2. Operators can verify parity for session lifecycle, console/network capture behavior, and Firefox MV2-specific expectations.
  3. Developers can use documented parity checks as a required release gate for milestone completion.
**Plans**: TBD

Plans:
- [ ] 09-01: Define and implement parity validation suite
- [ ] 09-02: Publish release-gate checklist and baseline verification flow

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 6. Workspace Foundation | v1.1 | 0/2 | Planned | - |
| 7. TS/WXT Migration + Modularization | v1.1 | 0/2 | Not started | - |
| 8. Clean-Break Rename + Rebrand | v1.1 | 0/2 | Not started | - |
| 9. Behavior Parity Validation Gate | v1.1 | 0/2 | Not started | - |
