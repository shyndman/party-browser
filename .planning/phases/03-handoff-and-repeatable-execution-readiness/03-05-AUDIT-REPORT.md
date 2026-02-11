# Timeout Audit Report

**Phase:** 03-handoff-and-repeatable-execution-readiness  
**Plan:** 05  
**Date:** 2026-02-11  
**Scope:** Application-wide timeout/time-unit audit

---

## Summary

This audit inventories all timeout-related code in the Browser MCP project to identify unit consistency issues. The API contract specifies **seconds** for user-facing tool parameters (browser_wait_for timeout, browser_wait time), but JavaScript's native timing functions require **milliseconds**.

**Key Finding:** Three unit mismatch issues have been identified at the MCP server → extension boundary where seconds are passed but milliseconds are expected.

**Contract Rule Established:**
- **API Layer (MCP tools):** All time parameters in **seconds** (user-facing)
- **Internal/Extension Layer:** All time values in **milliseconds** (JavaScript native)
- **Conversion Point:** At the server-to-extension message boundary

---

## Timeout Boundaries

| File | Line | Parameter | Documented Unit | Actual Usage | Conversion Applied | Status |
|------|------|-----------|-----------------|--------------|-------------------|--------|
| `src/protocol/ws-sender.ts` | 42-44 | `timeoutMs` | milliseconds | Used in `setTimeout(timeoutMs)` | N/A (native ms) | ✅ Correct |
| `src/context.ts` | 34 | `timeoutMs` | milliseconds | Passed to `sendSocketMessage` | N/A (native ms) | ✅ Correct |
| `src/tools/common.ts` | 92 | `time` (WaitTool) | seconds | Sent to extension as-is | ❌ **MISSING** - needs ×1000 | ⚠️ Issue #2 |
| `src/tools/common.ts` | 177 | `timeout` (wait_for) | seconds | Sent to extension as-is | ❌ **MISSING** - needs ×1000 | ⚠️ Issue #3 |
| `extension/content-script.js` | 529 | `timeout` param | N/A (receives value) | `setTimeout(resolve, ms)` | ❌ **MISSING** - needs ×1000 | ⚠️ Issue #3a |
| `extension/content-script.js` | 542-556 | `timeout` param | N/A (receives value) | Compared to `Date.now()` elapsed | ❌ **MISSING** - needs ×1000 | ⚠️ Issue #3b |
| `extension/content-script.js` | 562-576 | `timeout` param | N/A (receives value) | Compared to `Date.now()` elapsed | ❌ **MISSING** - needs ×1000 | ⚠️ Issue #3c |
| `extension/background.js` | 820-821 | `timeout` param | N/A (receives value) | `setTimeout(resolve, timeout)` | ❌ **MISSING** - needs ×1000 | ⚠️ Issue #2 |
| `extension/background.js` | 491 | `RECONNECT_INTERVAL` | N/A (hardcoded) | `setTimeout(reconnect, 5000)` | N/A (native ms) | ✅ Correct |
| `src/index.ts` | 21 | Exit watchdog | N/A (hardcoded) | `setTimeout(exit, 15000)` | N/A (native ms) | ✅ Correct |
| `extension/content-script.js` | 212 | Click delay | N/A (hardcoded) | `setTimeout(resolve, 100)` | N/A (native ms) | ✅ Correct |
| `extension/content-script.js` | 246 | Type delay | N/A (hardcoded) | `setTimeout(resolve, 50)` | N/A (native ms) | ✅ Correct |
| `extension/content-script.js` | 275 | Keypress delay | N/A (hardcoded) | `setTimeout(resolve, 10)` | N/A (native ms) | ✅ Correct |
| `extension/content-script.js` | 615, 624 | Drag delays | N/A (hardcoded) | `setTimeout(resolve, 50)` | N/A (native ms) | ✅ Correct |
| `extension/background.js` | 1114 | Tab load fallback | N/A (hardcoded) | `setTimeout(resolve, 10000)` | N/A (native ms) | ✅ Correct |

---

## Identified Issues

### Issue #1: browser_get_console_logs response format (FIXED in Task 1)
- **Location:** `src/tools/custom.ts:18-20`
- **Problem:** Code called `.map()` directly on response, but extension returns `{ success, count, logs }` object
- **Fix:** Added defensive handling to extract `response.logs` with array fallback
- **Status:** ✅ **RESOLVED** in commit 7e540a0

### Issue #2: browser_wait time parameter unit mismatch
- **Location:** 
  - `src/tools/common.ts:92` - sends `time` (seconds) directly
  - `extension/background.js:820-821` - uses value in `setTimeout(timeout)` (expects ms)
- **Problem:** Tool documents `time` in seconds, but extension interprets as milliseconds
- **Impact:** Wait is ~1000x shorter than intended (e.g., 5 seconds becomes 5ms)
- **Fix Required:** Multiply `time` by 1000 before sending to extension

### Issue #3: browser_wait_for timeout parameter unit mismatch
- **Locations:**
  - `src/tools/common.ts:177` - sends `timeout` (seconds) directly to extension
  - `extension/content-script.js:529-535` (mode=time) - uses value in `setTimeout(ms)`
  - `extension/content-script.js:542-556` (mode=text) - compares to `Date.now()` elapsed ms
  - `extension/content-script.js:562-576` (mode=text_gone) - compares to `Date.now()` elapsed ms
- **Problem:** Tool documents `timeout` in seconds, but extension code compares to milliseconds
- **Impact:** 
  - mode=time: Wait is ~1000x shorter than intended
  - mode=text/text_gone: Timeout almost always triggers immediately (e.g., 30 seconds compared as 30ms)
- **Fix Required:** Convert seconds to milliseconds at appropriate boundary

---

## Recommendations for 03-07

### Immediate Fixes Required

#### Fix 2a: browser_wait unit conversion (src/tools/common.ts)
```typescript
// Line 92: Change from:
await context.sendSocketMessage("browser_wait", { time });
// To:
await context.sendSocketMessage("browser_wait", { time: time * 1000 });
```

#### Fix 3a: browser_wait_for unit conversion (src/tools/common.ts)
```typescript
// Line 177: Change from:
await context.sendSocketMessage("browser_wait_for", { mode, value, timeout } as any);
// To:
await context.sendSocketMessage("browser_wait_for", { 
  mode, 
  value, 
  timeout: timeout !== undefined ? timeout * 1000 : undefined 
} as any);
```

### Architecture Decision Needed

**Option A: Convert at MCP server (src/tools/common.ts)**
- Pros: Single conversion point, extension receives milliseconds as expected
- Cons: Extension API becomes inconsistent (some params in ms, others implicit)

**Option B: Convert at extension boundary (extension/background.js)**
- Pros: Extension could support both units via documentation
- Cons: Multiple conversion points, harder to maintain

**Option C: Document everything in milliseconds**
- Pros: No conversion needed, aligns with JavaScript conventions
- Cons: User-facing API uses large numbers (30000 instead of 30)

**Recommendation:** Option A - Convert at MCP server layer. The tool definitions document seconds for user ergonomics, so conversion should happen before sending to extension. Extension operates in native JavaScript milliseconds.

### Documentation Updates

Add TIMEOUT_CONTRACT.md documenting:
```
TIMEOUT CONTRACT
================

User-Facing API (MCP Tools):
- browser_wait: time parameter in SECONDS
- browser_wait_for: timeout parameter in SECONDS (optional for mode=time)

Internal Communication:
- WebSocket messages: time values in MILLISECONDS
- Extension APIs: time values in MILLISECONDS

Conversion Points:
- src/tools/common.ts: WaitTool (time × 1000)
- src/tools/common.ts: WaitForTool (timeout × 1000)

JavaScript Native APIs (always milliseconds):
- setTimeout(delayMs)
- setInterval(delayMs)
- Date.now() timestamps
```

### Regression Prevention

1. **Add unit suffixes to variable names:**
   - `timeout` → `timeoutSeconds` (API layer)
   - `timeoutMs` → keep as-is (internal layer)

2. **Add runtime assertions:**
   ```typescript
   // In extension handlers
   if (timeout < 1000) {
     console.warn(`[Browser MCP] Timeout ${timeout}ms seems unusually low - was this meant to be seconds?`);
   }
   ```

3. **Type-level distinction (TypeScript):**
   ```typescript
   type Seconds = number & { __unit: 'seconds' };
   type Milliseconds = number & { __unit: 'milliseconds' };
   function toMs(s: Seconds): Milliseconds { return s * 1000 as Milliseconds; }
   ```

---

## Files Requiring No Changes

These files use milliseconds correctly:
- `src/protocol/ws-sender.ts` - Uses `timeoutMs` consistently
- `src/context.ts` - Uses `timeoutMs` consistently  
- `src/index.ts` - Hardcoded exit timeout in ms
- `extension/background.js:491` - Hardcoded reconnect interval in ms
- `extension/content-script.js:212,246,275,615,624` - Hardcoded animation delays in ms
- `extension/background.js:1114` - Hardcoded tab load fallback in ms

---

## Audit Verification

All setTimeout/setInterval calls in codebase:
```
src/protocol/ws-sender.ts:50    setTimeout(() => {...}, timeoutMs)         [ms - correct]
src/utils/wait.ts:7             setTimeout(resolve, ms)                    [ms - correct]
src/index.ts:21                 setTimeout(() => process.exit(0), 15000)   [ms - correct]
extension/content-script.js:212 setTimeout(resolve, 100)                   [ms - correct]
extension/content-script.js:246 setTimeout(resolve, 50)                    [ms - correct]
extension/content-script.js:275 setTimeout(resolve, 10)                    [ms - correct]
extension/content-script.js:535 setTimeout(resolve, ms)                    [ms - SHOULD RECEIVE ms]
extension/content-script.js:542 setInterval(...)                         [ms - correct]
extension/content-script.js:562 setInterval(...)                         [ms - correct]
extension/content-script.js:615 setTimeout(resolve, 50)                    [ms - correct]
extension/content-script.js:624 setTimeout(resolve, 50)                    [ms - correct]
extension/background.js:491     setTimeout(reconnect, 5000)                [ms - correct]
extension/background.js:821     setTimeout(resolve, timeout)               [ms - SHOULD RECEIVE ms]
extension/background.js:1114    setTimeout(resolve, 10000)                 [ms - correct]
```

**Boundary Crossings (where unit conversion is needed):**
1. `src/tools/common.ts:92` → `extension/background.js:821` (browser_wait time)
2. `src/tools/common.ts:177` → `extension/content-script.js:529` (browser_wait_for mode=time)
3. `src/tools/common.ts:177` → `extension/content-script.js:542,562` (browser_wait_for mode=text/text_gone)

---

## Conclusion

Three issues identified:
1. ✅ **FIXED:** getConsoleLogs response parsing (Task 1)
2. ⚠️ **PENDING:** browser_wait time unit mismatch (conversion needed in 03-07)
3. ⚠️ **PENDING:** browser_wait_for timeout unit mismatch (conversion needed in 03-07)

No other timeout-related issues found. All hardcoded delays and internal timeouts use milliseconds correctly. Only the user-facing API boundaries need unit conversion.

**Next Steps for 03-07:**
1. Implement seconds→milliseconds conversion in src/tools/common.ts
2. Create TIMEOUT_CONTRACT.md documentation
3. Add runtime assertions for suspiciously low timeout values
4. Verify fixes with integration tests
