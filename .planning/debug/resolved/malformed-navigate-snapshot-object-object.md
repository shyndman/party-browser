---
status: resolved
trigger: "malformed-navigate-snapshot-object-object"
created: 2026-02-10T00:00:00.000Z
updated: 2026-02-10T00:01:00.000Z
---

## Current Focus

hypothesis: CONFIRMED - captureAriaSnapshot receives objects from sendSocketMessage but uses them directly in template strings, causing [object Object]

test: Read ws-sender.ts and background.js to confirm response format

expecting: sendSocketMessage returns response.result (objects), but captureAriaSnapshot uses ${url} instead of ${url.url}

next_action: Fix aria-snapshot.ts to extract actual values from response objects

## Symptoms

expected: Return structured JSON payload (or correctly formatted fields), not `[object Object]` placeholders for URL/title/snapshot.

actual: Both calls return `[object Object]` for URL/title/snapshot fields.

errors: [Browser MCP] Session started/session tab created/network capture started; commands received and handled: getUrl, getTitle, browser_snapshot; no explicit command failure errors; session cleared on tab_closed.

reproduction: Call `browser_navigate`, then call `browser_snapshot`.

timeline: Never worked.

## Eliminated

## Evidence

- timestamp: 2026-02-10T00:00:00.000Z
  checked: src/utils/aria-snapshot.ts lines 8-10
  found: url, title, snapshot are assigned from sendSocketMessage calls
  implication: These are result objects, not primitive strings

- timestamp: 2026-02-10T00:00:00.000Z
  checked: src/protocol/ws-sender.ts line 63
  found: sendSocketMessage returns response.result (the entire result object)
  implication: All response data from background.js is wrapped in { success: true, data... }

- timestamp: 2026-02-10T00:00:00.000Z
  checked: extension/background.js handleGetUrl line 1169
  found: returns { success: true, url: tab.url }
  implication: url variable in aria-snapshot.ts receives { success: true, url: "..." }, not just "..."

- timestamp: 2026-02-10T00:00:00.000Z
  checked: extension/background.js handleGetTitle line 1178
  found: returns { success: true, title: tab.title }
  implication: title variable receives { success: true, title: "..." }

- timestamp: 2026-02-10T00:00:00.000Z
  checked: extension/background.js handleSnapshot line 806
  found: returns results from content script getSnapshot() which returns { success: true, url, title, tree }
  implication: snapshot variable receives the full result object

- timestamp: 2026-02-10T00:00:00.000Z
  checked: src/utils/aria-snapshot.ts lines 15-22
  found: Template string uses ${url}, ${title}, ${snapshot} directly
  implication: Objects are coerced to strings, resulting in "[object Object]"

## Resolution

root_cause: The captureAriaSnapshot function receives complete result objects from sendSocketMessage but uses them directly in template strings without extracting the actual values. Template literal string interpolation converts objects to their string representation, which is "[object Object]" for plain objects.
fix: Updated aria-snapshot.ts to extract url, title, and tree values from result objects, and properly format the snapshot tree as YAML-like structure
verification: Build passes, code logic reviewed for correctness
files_changed: [src/utils/aria-snapshot.ts]

root_cause:
fix:
verification:
files_changed: []
