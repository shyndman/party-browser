---
phase: 01-runtime-and-deterministic-core
plan: "01"
subsystem: runtime
-tags: [config, protocol, mcp, websocket, build]
+tags: [config, protocol, mcp, websocket, build]

# Dependency graph
requires: []
provides:
  - Package-local config modules (app.config.ts, mcp.config.ts)
  - Package-local protocol modules (tool-definitions.ts, ws-messages.ts, ws-sender.ts)
  - Standalone build capability without monorepo dependencies
  - WebSocket message sender implementation
  - Tool schema definitions using Zod
affects:
  - All runtime files that previously imported from @repo/* and @r2r/*
  - Build configuration and standalone operability
  - Future tool development (tool schema patterns established)

# Tech tracking
tech-stack:
  added:
    - Zod (already present, now used for tool schemas)
    - Local protocol layer pattern
  patterns:
    - "Protocol layer: Local definitions replacing external type packages"
    - "Config modules: Package-local configuration constants"
    - "Tool schemas: Zod-based runtime validation with TypeScript inference"

key-files:
  created:
    - src/config/app.config.ts - Application name and version configuration
    - src/config/mcp.config.ts - MCP runtime defaults (websocket port, error messages)
    - src/protocol/tool-definitions.ts - Zod schemas for all browser automation tools
    - src/protocol/ws-messages.ts - WebSocket message type definitions
    - src/protocol/ws-sender.ts - Message sender with request/response correlation
    - src/utils/wait.ts - Utility async wait function
  modified:
    - src/index.ts - Migrated @repo/config/app.config import to local
    - src/context.ts - Migrated all monorepo imports to local protocol modules
    - src/ws.ts - Migrated @repo/config/mcp.config and @repo/utils to local
    - src/tools/common.ts - Migrated tool schema imports to local definitions
    - src/tools/snapshot.ts - Migrated tool schema imports to local definitions
    - src/tools/custom.ts - Migrated tool schema imports to local definitions

key-decisions:
  - "Created local ws-sender.ts instead of relying on external @r2r/messaging package"
  - "Used Zod schemas for runtime validation while maintaining TypeScript inference"
  - "Kept MCP SDK and ws as external dependencies (correctly excluded from bundle)"
  - "Preserved exact tool behavior - migration was import-only, no logic changes"

patterns-established:
  - "Protocol modules: Use src/protocol/ for message types and communication abstractions"
  - "Config modules: Use src/config/ for application and runtime configuration"
  - "Tool definitions: Use Zod schemas in protocol/tool-definitions.ts, consume via .shape property"
  - "Import migration: Replace @repo/* with @/config/* or @/protocol/* as appropriate"

# Metrics
duration: 2min
completed: 2026-02-09
---

# Phase 01 Plan 01: Runtime and Deterministic Core Summary

**Package-local config and protocol modules replace monorepo-only dependencies, enabling standalone builds.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-09T22:28:07Z
- **Completed:** 2026-02-09T22:30:51Z
- **Tasks:** 3
- **Files modified:** 6 created, 6 modified

## Accomplishments

- Created local configuration modules (app.config.ts, mcp.config.ts) replacing @repo/config
- Created local protocol layer (tool-definitions.ts, ws-messages.ts, ws-sender.ts) replacing @repo/types and @r2r/messaging
- Migrated all runtime imports from monorepo packages to local equivalents
- Validated standalone build succeeds without hidden externals or unresolved imports
- Preserved exact runtime behavior - migration was purely compatibility-focused

## Task Commits

Each task was committed atomically:

1. **Task 1: Create local config and protocol compatibility modules** - `ac7cee6` (feat)
2. **Task 2: Migrate runtime imports to local modules** - `e0af822` (feat)
3. **Task 3: Validate standalone build output** - `a5930c1` (feat)

**Plan metadata:** (included in Task 3)

## Files Created/Modified

### Created
- `src/config/app.config.ts` - App name and version from package.json
- `src/config/mcp.config.ts` - WebSocket port (3456) and error constants
- `src/protocol/tool-definitions.ts` - Zod schemas for 12 browser automation tools
- `src/protocol/ws-messages.ts` - SocketMessageMap, MessageType, MessagePayload types
- `src/protocol/ws-sender.ts` - createSocketMessageSender with request correlation
- `src/utils/wait.ts` - Async wait utility

### Modified
- `src/index.ts` - Updated appConfig import to local module
- `src/context.ts` - Updated all imports to local protocol modules
- `src/ws.ts` - Updated mcpConfig and wait imports to local modules
- `src/tools/common.ts` - Updated tool schema imports to local definitions
- `src/tools/snapshot.ts` - Updated tool schema imports to local definitions
- `src/tools/custom.ts` - Updated tool schema imports to local definitions

## Decisions Made

- **Created local ws-sender implementation** rather than trying to install @r2r/messaging package, which was unavailable in node_modules
- **Used Zod for runtime validation** while preserving TypeScript type inference via z.infer
- **Preserved external MCP SDK dependency** - correctly kept as external, not bundled
- **No logic changes** - migration was import-only to minimize risk

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Type error in src/tools/custom.ts: Parameter 'log' implicitly has an 'any' type
  - **Resolution:** Added explicit `unknown` type annotation to map callback parameter
  - **Root cause:** sendSocketMessage returns Promise<any>, so array items lack inferred types

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Runtime foundation is complete and buildable
- Local protocol modules established for future tool development
- Ready for Phase 1 Plan 2: deterministic tool behavior implementation
- No blockers or concerns

---
*Phase: 01-runtime-and-deterministic-core*
*Completed: 2026-02-09*
