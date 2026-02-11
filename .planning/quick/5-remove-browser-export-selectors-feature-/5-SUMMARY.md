---
phase: quick
plan: 5
name: Remove browser_export_selectors Feature
subsystem: mcp-server, extension
tags: [yagni, cleanup, removal]
dependency_graph:
  requires: []
  provides: []
  affects: []
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified: []
  deleted:
    - src/tools/export.ts
decisions: []
metrics:
  duration: 2m
  completed: 2026-02-11
  files_changed: 6
  files_deleted: 1
  lines_removed: ~445
---

# Quick Task 5: Remove browser_export_selectors Feature

## Summary

Removed the browser_export_selectors tool and all associated code as YAGNI (You Aren't Gonna Need It). The feature was built for procedural scraping handoff, but the project pivoted to focus on interactive LLM-driven automation, making this code unused and adding maintenance burden.

**One-liner:** Removed dead code: eliminated browser_export_selectors tool and all references (~445 lines), reducing tool count from 18 to 17.

## What Was Changed

### Files Deleted

| File | Lines | Description |
|------|-------|-------------|
| `src/tools/export.ts` | 207 | MCP tool implementation for exporting selectors |

### Files Modified

| File | Changes |
|------|---------|
| `src/protocol/tool-definitions.ts` | Removed ExportSelectorsTool Zod schema (lines 240-284) |
| `src/protocol/ws-messages.ts` | Removed browser_export_selectors from SocketMessageMap (lines 49-61) |
| `src/types/artifact.ts` | Removed ExportSelectorsMessage and ExportSelectorsResponse interfaces (lines 213-229) |
| `src/index.ts` | Removed exportSelectors import and registration from customTools array |
| `extension/background.js` | Removed mapping (line 435), switch case (lines 552-553), and handleExportSelectors function (lines 915-1065) |

### Extension Changes (background.js)

1. **Removed from directMessageTypes mapping:** `'browser_export_selectors': 'export_selectors'`
2. **Removed switch case:**
   ```javascript
   case 'export_selectors':
     return await handleExportSelectors(params);
   ```
3. **Removed handleExportSelectors function:** ~150 lines of handler code

## Verification Results

All verification checks passed:

- ✅ `src/tools/export.ts` deleted
- ✅ ExportSelectorsTool removed from tool-definitions.ts
- ✅ browser_export_selectors message removed from ws-messages.ts
- ✅ ExportSelectorsMessage/Response removed from artifact.ts
- ✅ exportSelectors removed from index.ts imports and registration
- ✅ 'browser_export_selectors' mapping removed from extension/background.js
- ✅ export_selectors case removed from handleBrowserCommand switch
- ✅ handleExportSelectors function removed from extension/background.js
- ✅ Build passes with no errors
- ✅ Smoke test shows 17 tools (was 18)

## Impact

- **Tool count:** Reduced from 18 to 17 tools
- **Code reduction:** ~445 lines removed
- **Maintenance burden:** Eliminated unused feature that would require updates with every tool/artifact change
- **No breaking changes:** This was unused code, no consumers affected

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 6f13f77 | feat(quick-5): remove server-side export_selectors code |
| Task 2 | 0eb3740 | feat(quick-5): remove extension-side export_selectors code |

## Self-Check

✅ **PASSED**

- [x] src/tools/export.ts deleted and not tracked by git
- [x] Build succeeds (`npm run build`)
- [x] Smoke test passes showing 17 tools
- [x] No export_selectors references in codebase
- [x] All commits have proper format
- [x] SUMMARY.md created at correct path
