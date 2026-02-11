---
phase: 06-workspace-foundation
plan: 02
subsystem: workspace
tags: [pnpm, workspace, scripts, mcptools, wxt]

# Dependency graph
requires:
  - phase: 06-workspace-foundation
    provides: "Workspace structure from Plan 06-01"
provides:
  - "Root-level script surface for workspace orchestration"
  - "Dev orchestrator for parallel MCP and extension execution"
  - "mcptools integration for MCP development workflow"
  - "Test stubs for both packages"
affects: ["06-workspace-foundation", "07-mcp-server", "08-extension"]

# Tech tracking
tech-stack:
  added: [mcptools]
  patterns: ["action-first naming", "verb-by-package pattern", "umbrella vs targeted scripts"]

key-files:
  created:
    - scripts/dev-orchestrator.mjs
  modified:
    - package.json
    - packages/mcp/package.json
    - packages/extension/package.json

key-decisions:
  - "Action-first naming: install:all, build:mcp, dev:extension (not all:install)"
  - "Umbrella scripts use pnpm run -r for recursive execution"
  - "Targeted scripts use pnpm --filter ./packages/... for package selection"
  - "Dev orchestrator handles parallel execution with mcptools integration"
  - "Test stubs exit 0 to prevent failures during Phase 6"

patterns-established:
  - "Script naming: {verb} for umbrella, {verb}:{package} for targeted"
  - "pnpm --filter ./packages/{name} syntax for workspace filtering"
  - "Dev orchestrator pattern for multi-package parallel development"

# Metrics
duration: 3min
completed: 2026-02-11
---

# Phase 06 Plan 02: Workspace Script Surface Summary

**Root-level script surface with umbrella and targeted commands, dev orchestrator for parallel MCP/extension development, and mcptools integration**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-11T16:54:49Z
- **Completed:** 2026-02-11T16:58:35Z
- **Tasks:** 9
- **Files modified:** 4

## Accomplishments

- Created 15 root-level scripts for workspace orchestration (build, test, dev, typecheck variants)
- Built dev orchestrator that runs MCP server and extension dev in parallel
- Integrated mcptools for MCP development workflow (web UI on port 6277)
- Added test stubs to both packages that gracefully handle missing test infrastructure
- Established action-first naming convention (verb:package not package:verb)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add install script** - `546153c` (feat)
2. **Task 2: Add build scripts** - `a724bbd` (feat)
3. **Task 3: Add test scripts** - `dc86de5` (feat)
4. **Task 4: Add test stubs** - `fe8cbf8` (feat)
5. **Task 5: Add typecheck and lint** - `6d932d6` (feat)
6. **Task 6: Create dev orchestrator** - `fd95727` (feat)
7. **Task 7: Add dev scripts** - `5859253` (feat)
8. **Task 8: Add mcptools scripts** - `f694fd8` (feat)
9. **Task 9: Verify script wiring** - `eeb4c5e` (chore)

**Plan metadata:** `eeb4c5e` (chore: verify script wiring)

## Files Created/Modified

- `package.json` - Root scripts: install:all, build, build:mcp, build:extension, test, test:mcp, test:extension, dev, dev:mcp, dev:extension, typecheck, typecheck:mcp, typecheck:extension, lint, clean
- `scripts/dev-orchestrator.mjs` - Parallel dev execution with mcptools integration
- `packages/mcp/package.json` - Added test, test:watch, dev, dev:shell, tools scripts
- `packages/extension/package.json` - Added test, test:e2e, typecheck scripts

## Decisions Made

- **Action-first naming:** Used `install:all`, `build:mcp`, `dev:extension` instead of `all:install`, `mcp:build`, `extension:dev` — follows natural language patterns and matches pnpm workspace conventions
- **Umbrella vs targeted:** Umbrella commands (build, test, dev) use `pnpm run -r` for recursive execution across all packages; targeted commands use `pnpm --filter ./packages/...` for specific package selection
- **mcptools integration:** Added `dev`, `dev:shell`, and `tools` scripts to MCP package for development workflow; requires `npm install -g mcptools`
- **Test stubs:** Both packages have placeholder test scripts that exit 0 to prevent failures during Phase 6; real test infrastructure comes in Phase 9
- **Dev orchestrator:** Created standalone script rather than inline package.json command for better signal handling and parallel process management

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration.** See [06-workspace-foundation-USER-SETUP.md](./06-workspace-foundation-USER-SETUP.md) for:

- mcptools installation: `npm install -g mcptools`
- Verification commands for workspace scripts

## Next Phase Readiness

- ✅ Workspace script surface is complete and functional
- ✅ Developers can run `pnpm run build` to build all packages
- ✅ Developers can run `pnpm run dev` to start parallel dev servers
- ✅ mcptools integration enables MCP development workflow
- ✅ Test stubs prevent failures during Phase 6 execution

Ready for Phase 07 (MCP Server implementation) and Phase 08 (Extension development).

---
*Phase: 06-workspace-foundation*
*Completed: 2026-02-11*
