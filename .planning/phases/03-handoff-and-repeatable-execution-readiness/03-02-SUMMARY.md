---
phase: 03-handoff-and-repeatable-execution-readiness
plan: 02
subsystem: export
 tags: ["artifact", "export", "json", "selector", "workflow"]

# Dependency graph
requires:
  - phase: 03-01
    provides: "Session-scoped network and console capture infrastructure"
provides:
  - Selector artifact TypeScript type definitions
  - browser_export_selectors MCP tool
  - Extension-side artifact generation with metadata aggregation
  - Session ID generation and tracking
  - Support for Chrome DevTools Recorder-compatible format
affects:
  - Downstream procedural scraping systems
  - Session lifecycle management
  - Tool registration

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Artifact format following Chrome DevTools Recorder pattern"
    - "Session ID generation on first navigate"
    - "Metadata aggregation from ring buffers"
    - "Selector prefix parsing (css:/xpath:/text:/ref)"

key-files:
  created:
    - src/types/artifact.ts - TypeScript type definitions for selector artifact format
    - src/tools/export.ts - browser_export_selectors MCP tool implementation
  modified:
    - src/protocol/ws-messages.ts - Added browser_export_selectors message type
    - src/protocol/tool-definitions.ts - Added ExportSelectorsTool Zod schema
    - src/index.ts - Registered exportSelectors in snapshotTools
    - extension/background.js - Implemented handleExportSelectors and session ID tracking

key-decisions:
  - "Session ID generated on first navigate with timestamp + random suffix format"
  - "Selector prefix system: css:/xpath:/text:/ for explicit types, eN format for refs"
  - "Artifact format inspired by Chrome DevTools Recorder for broad compatibility"
  - "Optional console/network data bounded to last 50 entries to prevent huge artifacts"

patterns-established:
  - "SelectorDefinition type supports css/xpath/text/ref with optional fields for advanced extraction"
  - "SelectorStep discriminated union for type-safe workflow steps"
  - "Session metadata aggregation from captured network and console logs"
  - "Input step simplification for LLM-friendly API while maintaining rich output format"

# Metrics
duration: 5min
completed: 2026-02-10T17:27:45Z
---

# Phase 03 Plan 02: Selector Artifact Export Summary

**Selector artifact export infrastructure enabling LLM-guided discovery to package workflows into machine-readable JSON format for downstream procedural scraping.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-10T17:21:46Z
- **Completed:** 2026-02-10T17:27:45Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Complete TypeScript type definitions for selector artifacts (229 lines)
- MCP tool `browser_export_selectors` with validation and formatted output
- Extension-side artifact generation with session ID tracking
- Support for 6 action types: navigate, click, type, select, wait, extract
- Metadata aggregation from session-scoped network and console capture
- Selector prefix parsing supporting css:/xpath:/text:/ and element refs

## Task Commits

Each task was committed atomically:

1. **Task 1: Define selector artifact TypeScript types** - `55426ca` (feat)
2. **Task 2: Create browser_export_selectors MCP tool** - `3943103` (feat)
3. **Task 3: Implement artifact generation in extension** - `7a60429` (feat)

**Plan metadata:** `{metadata_commit}` (docs: complete plan)

## Files Created/Modified

### Created
- `src/types/artifact.ts` - TypeScript types: SelectorDefinition, SelectorStep variants, SelectorArtifact, ExportOptions, ExportResult
- `src/tools/export.ts` - MCP tool implementation with validation, error handling, formatted JSON output

### Modified
- `src/protocol/ws-messages.ts` - Added browser_export_selectors message type to SocketMessageMap
- `src/protocol/tool-definitions.ts` - Added ExportSelectorsTool Zod schema with step validation
- `src/index.ts` - Imported and registered exportSelectors in snapshotTools array
- `extension/background.js` - Added sessionId/sessionStartTime tracking, handleExportSelectors command, parseSelector helper

## Decisions Made

1. **Session ID format**: `sess_${timestamp}_${random}` provides uniqueness and sortability
2. **Selector prefixes**: css:/xpath:/text:/ provide explicit typing; bare strings default to text matching; eN format for element refs
3. **Bounded optional data**: Console and network logs limited to last 50 entries prevents artifacts from becoming unwieldy
4. **Simplified input format**: LLM provides simple `{action, target, value, description}` steps; extension maps to rich SelectorStep types
5. **DevTools Recorder compatibility**: Artifact structure follows established patterns for tool ecosystem compatibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 03 foundation complete: session capture (03-01) and artifact export (03-02) both implemented
- Ready for Phase 04: Polish and validation, or additional Phase 03 plans if needed
- Artifacts can now be generated from discovery sessions and saved for downstream use

## Verification Results

✅ Build passes: `npm run build` succeeds
✅ Tool registered: `npm run smoke:tools` shows 18 tools (including browser_export_selectors)
✅ TypeScript compilation: No type errors

## Artifact Format Example

```json
{
  "version": "1.0",
  "title": "example_workflow",
  "createdAt": "2026-02-10T17:27:45.000Z",
  "sessionId": "sess_1770744465123_a7x9k2mnp",
  "initialUrl": "https://example.com",
  "steps": [
    {
      "type": "navigate",
      "description": "Navigate to example site",
      "url": "https://example.com"
    },
    {
      "type": "click",
      "description": "Click login button",
      "selectors": [{"type": "css", "value": "#login-btn"}]
    },
    {
      "type": "type",
      "description": "Enter username",
      "selectors": [{"type": "css", "value": "#username"}],
      "value": "user@example.com"
    }
  ],
  "metadata": {
    "networkRequestCount": 15,
    "consoleErrorCount": 0,
    "consoleWarnCount": 2,
    "sessionDuration": 45000
  }
}
```

---

## Self-Check: PASSED

- [x] Created files exist: `src/types/artifact.ts`, `src/tools/export.ts`
- [x] Modified files updated: ws-messages.ts, tool-definitions.ts, index.ts, background.js
- [x] Build passes without errors
- [x] Tool appears in smoke test (18 tools registered)
- [x] All commits present: 55426ca, 3943103, 7a60429

---
*Phase: 03-handoff-and-repeatable-execution-readiness*
*Completed: 2026-02-10*
