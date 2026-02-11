---
status: diagnosed
trigger: "browser_wait_for mode=text appears to ignore timeout and fails immediately when text is not found"
created: "2026-02-11T00:00:00Z"
updated: "2026-02-11T00:05:00Z"
---

## Current Focus

hypothesis: The mode=text implementation doesn't implement polling/timeout logic and returns immediately on not-found
test: Find and read the browser_wait_for implementation, specifically mode=text handling
expecting: Find where mode=text fails fast instead of polling
next_action: Search for browser_wait_for implementation in the codebase

## Symptoms

expected: browser_wait_for with mode=text should poll until text appears or timeout is reached.
actual: mode=text timeout is ignored; not-found failure comes back immediately even with timeout=10s.
errors: Immediate text-not-found failure.
reproduction: Call browser_wait_for with mode=text, non-existing text, timeout=10s; response fails immediately.
started: Discovered during Phase 3 UAT test 6.

## Eliminated

## Evidence

- timestamp: 2026-02-11T00:01:00Z
  checked: src/tools/common.ts line 177
  found: Server sends timeout directly from user params without conversion
  implication: User passes timeout in seconds (e.g., 10), but content-script expects milliseconds

- timestamp: 2026-02-11T00:02:00Z
  checked: extension/content-script.js lines 528-580 (waitForCondition)
  found: Timeout compared against Date.now() elapsed time in milliseconds
  implication: timeout=10 means 10ms, not 10 seconds - causing immediate failure

- timestamp: 2026-02-11T00:03:00Z
  checked: extension/content-script.js line 529
  found: const { mode, value, timeout = 30000 } = params;
  implication: Default is 30000 (30 seconds in ms), but incoming timeout is in seconds (e.g., 10)

- timestamp: 2026-02-11T00:04:00Z
  checked: extension/content-script.js line 534 (mode=time handling)
  found: const ms = parseInt(value, 10) || 1000;  // value is converted to ms
  implication: mode=time correctly converts seconds to ms, but mode=text/text_gone does NOT convert timeout

## Resolution

root_cause: The timeout parameter is passed from server to content-script in seconds (as per user API), but content-script's waitForCondition treats it as milliseconds. A timeout of 10 seconds becomes 10ms, causing immediate timeout failure. The mode=time handler correctly converts value to ms (line 534), but mode=text and mode=text_gone use timeout directly without conversion.
fix: 
verification: 
files_changed: []

root_cause: 
fix: 
verification: 
files_changed: []
