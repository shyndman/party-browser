# Milestone Requirements: v1.1 pre-v2.0-structural-improvements

**Milestone goal:** Establish a cleaner architecture baseline before v2.0 by modernizing extension and repository structure, rebranding to blindflight, and preserving current behavior.

## In Scope Requirements

### Extension TS + WXT Migration (EXT)

- [ ] **EXT-01**: Operators can build and run the extension from a TypeScript + WXT codebase with Firefox MV2 output and a packaged `.xpi` artifact.
- [ ] **EXT-02**: Operators can run the migrated extension with required permissions for current workflows, including `tabGroup` and `tabs`.
- [ ] **EXT-03**: Operators can execute existing extension-driven workflows without changing extension runtime mode (Firefox MV2 compatibility preserved).

### Workspace Split (WS)

- [ ] **WS-01**: Developers can install dependencies from a pnpm workspace root that contains exactly `packages/mcp` and `packages/extension`.
- [ ] **WS-02**: Developers can build MCP and extension packages independently through workspace scripts.
- [ ] **WS-03**: Developers can run milestone build/test flows from workspace-level scripts without ad hoc package-local steps.

### Clean-Break Tool Rename (REN)

- [ ] **REN-01**: Operators can call MCP tools using unprefixed names across the full supported tool surface, and those names are consistently wired through MCP registration, server dispatch, extension dispatch switch cases, and extension handler endpoints.
- [ ] **REN-02**: Operators cannot call legacy `browser_`-prefixed tool names in v1.1 (clean break, no aliases).
- [ ] **REN-03**: Developers can search for `browser_` and find no active codepaths, handlers, dispatch cases, protocol message names, or MCP-exposed tool names related to current runtime behavior.

### Rebrand to blindflight (BRAND)

- [ ] **BRAND-01**: Operators can install and run the MCP package under blindflight naming.
- [ ] **BRAND-02**: Operators can identify extension/package/binary/docs branding consistently as `blindflight`.
- [ ] **BRAND-03**: Developers can find no active project identifiers that still use legacy browsermcp naming in maintained docs/configs.

### Codebase Modularization (MOD)

- [ ] **MOD-01**: Developers can work in smaller focused modules for extension background logic instead of a single oversized file.
- [ ] **MOD-02**: Developers can work in MCP server modules with clearer ownership boundaries for tool registration, protocol handling, and runtime orchestration.
- [ ] **MOD-03**: Developers can change one module area with minimized cross-module coupling and no behavior changes.

### Behavior Parity Validation Gate (PAR)

- [ ] **PAR-01**: Operators can run a parity validation gate that verifies unchanged tool semantics for the migrated/restructured system.
- [ ] **PAR-02**: Operators can verify extension runtime parity for session lifecycle, console/network capture behavior, and MV2-specific expectations.
- [ ] **PAR-03**: Developers can use documented parity checks as a release gate for milestone completion.

## Future Requirements (Deferred)

- [ ] **FUT-01**: Harden MCP-extension protocol contracts with shared typed schemas and stricter runtime validation.
- [ ] **FUT-02**: Introduce protocol evolution/versioning strategy when behavior changes are intentionally introduced.

## Out of Scope for v1.1

- [ ] **OOS-01**: Net-new end-user tool capabilities.
- [ ] **OOS-02**: Firefox MV3 migration or dual MV2/MV3 production targets.
- [ ] **OOS-03**: Chrome/Chromium expansion.
- [ ] **OOS-04**: Extension UI redesign or unrelated UX refresh work.
- [ ] **OOS-05**: Compatibility aliases for legacy `browser_` tool names.
- [ ] **OOS-06**: Adding additional required workspace packages beyond `packages/mcp` and `packages/extension`.

## Requirement Traceability (filled by roadmap)

| Requirement | Phase |
|-------------|-------|
| EXT-01 | Phase 7 |
| EXT-02 | Phase 7 |
| EXT-03 | Phase 7 |
| WS-01 | Phase 6 |
| WS-02 | Phase 6 |
| WS-03 | Phase 6 |
| REN-01 | Phase 8 |
| REN-02 | Phase 8 |
| REN-03 | Phase 8 |
| BRAND-01 | Phase 8 |
| BRAND-02 | Phase 8 |
| BRAND-03 | Phase 8 |
| MOD-01 | Phase 7 |
| MOD-02 | Phase 7 |
| MOD-03 | Phase 7 |
| PAR-01 | Phase 9 |
| PAR-02 | Phase 9 |
| PAR-03 | Phase 9 |

---
*Defined: 2026-02-11*
*Scope source: user-selected v1.1 groups (protocol hardening deferred)*
