# Phase 6: Workspace Foundation - Context

**Gathered:** 2026-02-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish a reproducible pnpm workspace foundation for this milestone so developers can install, build, and test from the root while supporting `packages/mcp` and `packages/extension` workflows.

This discussion clarifies implementation behavior within Phase 6; it does not add net-new product capabilities.

</domain>

<decisions>
## Implementation Decisions

### Root command surface
- Use action-first naming for root commands.
- Root entrypoints must cover install/build/test milestone flows.
- Use verb-by-package naming for targeted commands (for example `build:mcp`, `build:extension`).
- Default output style is verbose logs.
- Do not add a separate canonical workspace health-check command as a required surface.

### Dev flow ergonomics
- Day-to-day development can be package-first for local work.
- Documentation should present root-first commands for full-stack workflows and also mention package-first usage.
- Provide one umbrella dev command that delegates to package dev scripts.
- Umbrella dev should launch both MCP and extension dev flows by default.
- Include `mcptools` in phase research to define best-practice MCP dev workflow usage.
- In dev mode, preconfigure extension behavior to connect to the MCP server started by `mcptools`.
- Dependency install policy can remain flexible.

### Failure behavior
- Multi-package root/umbrella flows fail fast on the first failing task.
- Keep successful package outputs/artifacts when another package fails.
- Failure messaging should include an actionable package-level summary.
- If known setup/wiring issues are detected up front, abort immediately before starting package tasks.

### Boundary strictness
- Keep shared tooling defaults centralized at the repo root.
- Allow direct source imports across package boundaries during this phase.

### Claude's Discretion
- Choose strictness level for exit behavior details where the user left flexibility (for example CI-oriented vs local-dev ergonomics per command).
- Choose whether old root-level path handling is clean-cut or transitional, as long as Phase 6 goals are met and behavior remains stable.

</decisions>

<specifics>
## Specific Ideas

- Root-first command surface should be capable of full-stack development orchestration.
- Package-first local development is still important and should remain explicitly supported.
- `mcptools` should be treated as the MCP dev-server anchor for local workflows.

</specifics>

<deferred>
## Deferred Ideas

- Potential expansion beyond two workspace packages (for example shared types/utils) if future ownership boundaries justify it. This is noted for future roadmap review and is not a Phase 6 requirement.

</deferred>

---

*Phase: 06-workspace-foundation*
*Context gathered: 2026-02-11*
