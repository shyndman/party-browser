---
phase: 01-runtime-and-deterministic-core
plan: "03"
subsystem: testing
tags: [mcp, smoke-test, cli, stdio, tools]

# Dependency graph
requires:
  - phase: 01-01
    provides: Core tool implementations (browser_navigate, browser_wait, browser_close)
  - phase: 01-02
    provides: browser_wait_for with discriminated union arguments
provides:
  - Local MCP server smoke verification script
  - npm scripts for build + smoke workflow
  - README runbook for standalone operation
affects:
  - CI/CD integration (can use smoke for build gates)
  - Developer onboarding (local verification)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MCP stdio protocol handshake for testing"
    - "JSON-RPC 2.0 request/response handling"
    - "Child process spawning for isolated verification"
key-files:
  created:
    - scripts/smoke-list-tools.mjs
  modified:
    - package.json
    - README.md

key-decisions:
  - "Smoke test performs real MCP handshake rather than just parsing source"
  - "Two npm scripts provided: smoke (full) and smoke:tools (quick)"
  - "README documents expected failure modes to reduce operator confusion"

patterns-established:
  - "MCP smoke test pattern: initialize → list-tools → verify"
  - "Stdio-based MCP testing over spawning server process"

# Metrics
duration: 2min
completed: 2026-02-09
---

# Phase 01 Plan 03: Local Operability Smoke Tests

**MCP smoke test verifying startup and tool registration via stdio protocol handshake, with npm scripts and README runbook for standalone local verification.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-09T22:37:51Z
- **Completed:** 2026-02-09T22:40:12Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

1. **Created smoke verification script** (`scripts/smoke-list-tools.mjs`) that performs real MCP initialization handshake over stdio and validates required Phase 1 tools
2. **Added npm scripts** (`smoke`, `smoke:tools`) providing one-command verification for operators
3. **Documented complete runbook** in README with prerequisites, quick start, smoke commands, expected behavior, and common issues

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement local MCP smoke test** - `5c849ac` (feat)
2. **Task 2: Wire smoke path into package scripts** - `442d728` (feat)
3. **Task 3: Document standalone local runbook** - `7b94c28` (docs)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `scripts/smoke-list-tools.mjs` - Programmatic smoke test performing MCP handshake and tool verification
- `package.json` - Added `smoke` and `smoke:tools` npm scripts
- `README.md` - Added Local Development section with runbook

## Decisions Made

1. **Real handshake vs source parsing:** Smoke test spawns actual server and performs MCP initialization rather than just checking source code. This catches runtime registration issues.

2. **Two-script approach:** `npm run smoke` for full verification (build + test), `npm run smoke:tools` for quick iteration (test only).

3. **Explicit failure mode documentation:** README explains that tool-call failures with no connected tab are expected, distinguishing startup success from runtime errors.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification Results

```
✅ ALL CHECKS PASSED
   Found 4/4 required tools
   Total registered: 14 tools

Verified tools:
- browser_navigate
- browser_wait_for
- browser_snapshot
- browser_close
```

## Next Phase Readiness

- Local runtime verification is repeatable and script-driven
- Tool registration can be confirmed without manual MCP packet crafting
- README provides clear standalone setup/start guidance
- Phase 1 runtime and deterministic core is complete

## Self-Check: PASSED

- [x] scripts/smoke-list-tools.mjs exists on disk
- [x] SUMMARY.md created
- [x] Commits verified: 5c849ac, 442d728, 7b94c28
- [x] npm run smoke passes
- [x] All 4 required tools verified

---
*Phase: 01-runtime-and-deterministic-core*
*Completed: 2026-02-09*
