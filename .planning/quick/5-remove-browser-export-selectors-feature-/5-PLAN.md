---
phase: quick
plan: 5
type: execute
wave: 1
depends_on: []
files_modified: [
  "src/tools/export.ts",
  "src/protocol/tool-definitions.ts",
  "src/protocol/ws-messages.ts",
  "src/types/artifact.ts",
  "src/index.ts",
  "extension/background.js"
]
autonomous: true

must_haves:
  truths:
    - removed selector export tool tool no longer exists in the MCP tool list
    - No references to removed selector export remain in the codebase
    - Smoke test passes showing 17 tools (previously 18)
  artifacts:
    - Deleted: src/tools/export.ts
    - Modified: src/index.ts (no exportSelectors registration)
    - Modified: src/protocol/tool-definitions.ts (no ExportSelectorsTool)
    - Modified: src/protocol/ws-messages.ts (no removed selector export tool message)
    - Modified: src/types/artifact.ts (no ExportSelectorsMessage/Response)
    - Modified: extension/background.js (no mapping/switch case/handler)
  key_links:
    - src/index.ts must not import from @/tools/export
    - Tool count reduced by 1 in smoke test output
---

<objective>
Remove removed selector export tool feature and all references as YAGNI (You Aren't Gonna Need It).

Purpose: The selector export feature was built for procedural scraping handoff, but the project has pivoted to focus on interactive LLM-driven automation rather than procedural scraping. Removing this dead code reduces maintenance burden and simplifies the codebase.

Output: Clean codebase with no removed selector export references and reduced tool count.
</objective>

<execution_context>
@./.opencode/get-shit-done/workflows/execute-plan.md
@./.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@./.planning/STATE.md

The removed selector export tool tool was implemented in Phase 03-02 for exporting discovered selectors as JSON artifacts for downstream procedural scraping. It consists of:
- src/tools/export.ts - 207-line MCP tool implementation
- src/protocol/tool-definitions.ts - ExportSelectorsTool definition (lines 240-284)
- src/protocol/ws-messages.ts - removed selector export tool message type (lines 49-61)
- src/types/artifact.ts - Artifact-related types including ExportSelectorsMessage/Response (lines 210-229)
- src/index.ts - Tool registration (lines 13, 34)
- extension/background.js - Extension handler (mapping at line 435, switch case at line 552-553, handleExportSelectors function at line 915-1065)

All these components must be removed.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove MCP server-side removed selector export code</name>
  <files>src/tools/export.ts, src/protocol/tool-definitions.ts, src/protocol/ws-messages.ts, src/types/artifact.ts, src/index.ts</files>
  <action>
    1. DELETE src/tools/export.ts entirely (207 lines)
    
    2. In src/protocol/tool-definitions.ts:
       - Remove ExportSelectorsTool definition (lines 240-284)
       - Remove export type ExportSelectorsTool line
    
    3. In src/protocol/ws-messages.ts:
       - Remove removed selector export tool entry from SocketMessageMap (lines 49-61)
       - Remove the "// Selector export message (Phase 03.2)" comment
    
    4. In src/types/artifact.ts:
       - Remove ExportSelectorsMessage interface (lines 213-219)
       - Remove ExportSelectorsResponse interface (lines 224-229)
       - Keep other artifact types (SelectorArtifact, etc.) as they may be used elsewhere
    
    5. In src/index.ts:
       - Remove import line: `import { exportSelectors } from "@/tools/export";`
       - Remove exportSelectors from customTools array (line 34)
       - Reformat the customTools array to remove the trailing comma on previous line
  </action>
  <verify>npm run build 2>&1 | head -20</verify>
  <done>Build succeeds with no errors; no removed selector export references remain in server code</done>
</task>

<task type="auto">
  <name>Task 2: Remove extension-side removed selector export code</name>
  <files>extension/background.js</files>
  <action>
    In extension/background.js:
    
    1. Remove 'removed selector export tool': 'removed selector export' from directMessageTypes object (line 435)
    
    2. Remove the removed selector export case from handleBrowserCommand switch statement (lines 552-553):
       ```javascript
       case 'removed selector export':
         return await handleExportSelectors(params);
       ```
    
    3. Remove the entire handleExportSelectors function (lines 915-1065, approximately 150 lines). The function starts with:
       ```javascript
       async function handleExportSelectors(params) {
       ```
       And ends just before handleGoBack function.
  </action>
  <verify>grep -n "removed selector export\|ExportSelectors" extension/background.js</verify>
  <done>No matches found in extension/background.js</done>
</task>

<task type="auto">
  <name>Task 3: Verify complete removal with smoke test</name>
  <files>N/A - verification only</files>
  <action>
    Run the smoke test to confirm:
    1. Tool count is reduced from 18 to 17 (removed selector export removed)
    2. No import errors or runtime errors
    3. All remaining tools function correctly
  </action>
  <verify>npm run smoke:tools 2>&1 | grep -E "(tools|export|error)"</verify>
  <done>Smoke test shows 17 tools (not 18) with no errors; removed selector export tool is absent from tool list</done>
</task>

</tasks>

<verification>
- [ ] src/tools/export.ts deleted
- [ ] ExportSelectorsTool removed from tool-definitions.ts
- [ ] removed selector export tool message removed from ws-messages.ts
- [ ] ExportSelectorsMessage/Response removed from artifact.ts
- [ ] exportSelectors removed from index.ts imports and registration
- [ ] 'removed selector export tool': 'removed selector export' mapping removed from extension/background.js
- [ ] removed selector export case removed from handleBrowserCommand switch
- [ ] handleExportSelectors function removed from extension/background.js
- [ ] Build passes with no errors
- [ ] Smoke test shows 17 tools (was 18)
</verification>

<success_criteria>
- removed selector export tool completely removed from codebase
- Tool count reduced by 1 (17 instead of 18 in smoke test)
- No build errors
- No runtime errors in smoke test
</success_criteria>

<output>
After completion, create `.planning/quick/5-remove-browser-export-selectors-feature-/5-SUMMARY.md`
</output>
