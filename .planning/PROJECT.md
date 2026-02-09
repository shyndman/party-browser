# Browser MCP Core

## What This Is

Browser MCP Core is the MCP server package that powers browser automation through the Browser MCP Chrome extension. It lets AI tools invoke browser actions through MCP while keeping execution local and tied to the user's existing browser profile. This repository currently contains the core server logic and tool surface, with known monorepo dependency constraints.

## Core Value

AI clients can reliably automate a real, logged-in local browser session through a simple MCP interface.

## Requirements

### Validated

- ✓ MCP server exposes browser automation tools over stdio transport and MCP tool schemas — existing
- ✓ Server bridges MCP tool calls to the Browser MCP extension via local WebSocket messaging — existing
- ✓ Core browser interaction tools exist (navigation, click/hover/type/select/key, wait, screenshot, snapshot, URL/title, console logs) — existing
- ✓ Automation runs against the user's real browser profile to preserve logged-in sessions and reduce bot-detection friction — existing

### Active

- [ ] Server shutdown and connection lifecycle are reliable under normal start/stop and reconnect scenarios
- [ ] MCP server dependency baseline includes `@modelcontextprotocol/sdk` `^1.26.x` with compatibility validated
- [ ] Core behavior is protected by automated tests for tool execution and error paths

### Out of Scope

- Cloud-hosted/browser-farm orchestration — local-first architecture is core to product value
- Multi-user tenancy and remote account/session management — this package is a local MCP server, not a hosted platform

## Context

- Existing brownfield codebase with established TypeScript Node.js MCP server architecture
- Existing documented codebase map in `.planning/codebase/` used as initialization context
- README confirms product positioning: local, private, logged-in browser automation via extension
- Current concerns include lifecycle reliability risks, zero test coverage, and monorepo-only dependency assumptions

## Constraints

- **Tech stack**: Node.js + TypeScript + MCP SDK + WebSocket bridge — existing architecture should be evolved, not replaced
- **Product**: Local-first operation only — browser activity should remain on-device
- **Compatibility**: Must continue to interoperate with Browser MCP extension protocol and MCP clients

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use `README.md` plus `.planning/codebase/*.md` as initialization source | `--auto` was requested without a separate idea document, and these are the authoritative in-repo sources | — Pending |
| Initialize as brownfield with inferred validated requirements | Existing code already delivers core capabilities that should be treated as baseline, not new scope | — Pending |
| Prioritize 3-phase v1 scope (lifecycle, connection/error contracts, testing/CI) | Keep v1 focused on reliability and quality gates before contributor-workflow expansion | — Pending |

---
*Last updated: 2026-02-09 after initialization*
