---
status: diagnosed
trigger: "browser-wait-for-mode-time-no-wait - browser_wait_for with mode=time returns immediately without waiting"
created: 2026-02-11T00:00:00Z
updated: 2026-02-11T00:00:04Z
---

## Current Focus

hypothesis: CONFIRMED - In content-script.js waitForCondition(), value (in seconds) is passed directly to setTimeout() which expects milliseconds, causing waits to be 1000x shorter than requested.

test: Verified by reading tool schema (seconds) vs content script implementation (no conversion to ms)

expecting: Value in seconds should be multiplied by 1000 for setTimeout

next_action: Document root cause and complete diagnosis

## Symptoms

expected: browser_wait_for with mode=time should wait approximately the requested duration before returning success.
actual: browser_wait_for mode=time does not wait for any amount of time.
errors: None reported.
reproduction: Call browser_wait_for with mode=time and a non-trivial value (e.g., 3-10 seconds); response returns immediately.
started: Discovered during Phase 3 UAT test 5.

## Eliminated

## Evidence

- timestamp: 2026-02-11T00:00:01Z
  checked: src/tools/common.ts (server-side tool implementation)
  found: Server sends `browser_wait_for` message with mode, value, timeout via `sendSocketMessage`. For mode=time, value must be a number per runtime validation.
  implication: Server properly validates and sends message to extension

- timestamp: 2026-02-11T00:00:02Z
  checked: extension/content-script.js waitForCondition function (lines 528-580)
  found: When mode='time', it does `const ms = parseInt(value, 10) || 1000;` then `await new Promise(resolve => setTimeout(resolve, ms));`
  implication: BUG FOUND! The tool schema specifies value is in SECONDS, but setTimeout expects MILLISECONDS. A 5-second wait becomes 5ms wait.

- timestamp: 2026-02-11T00:00:03Z
  checked: src/protocol/ws-messages.ts line 33
  found: `browser_wait_for` type for mode=time is `{ mode: "time"; value: number; timeout?: number }` - value is in seconds per schema.
  implication: Confirms that value passed is in seconds, but content script treats it as milliseconds.

## Resolution

root_cause: In extension/content-script.js, the `waitForCondition` function handles mode='time' by doing `const ms = parseInt(value, 10) || 1000;` where `value` is in seconds per the tool schema. This value is then passed to `setTimeout(resolve, ms)` which expects milliseconds. A request to wait 5 seconds results in only a 5ms wait (1000x too short), appearing to return immediately.

fix: Multiply `value` by 1000 before passing to setTimeout, or use the existing `wait()` utility that likely handles the conversion.

verification: 
files_changed:
  - extension/content-script.js: Fix time-based wait by converting seconds to milliseconds
