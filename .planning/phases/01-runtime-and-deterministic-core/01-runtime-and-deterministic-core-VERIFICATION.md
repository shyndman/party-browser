---
phase: 01-runtime-and-deterministic-core
verified: 2026-02-09T22:43:51Z
status: gaps_found
score: 3/7 must-haves verified
gaps:
  - truth: "Operator can run npm install and npm run build in this repository without monorepo-only dependency failures."
    status: failed
    reason: "`npm install --dry-run` fails with EUNSUPPORTEDPROTOCOL because `package.json` still contains `workspace:*` devDependencies."
    artifacts:
      - path: "package.json"
        issue: "Lines 32-36 reference monorepo-only workspace packages (@r2r/@repo) that are not installable in standalone npm context."
    missing:
      - "Remove or replace `workspace:*` devDependencies with publishable npm deps or local package alternatives."
      - "Re-run `npm install` successfully in a clean standalone checkout."
---

# Phase 1: Runtime and Deterministic Core Verification Report

**Phase Goal:** Operators and users can run the server locally and perform deterministic baseline page control for discovery setup.
**Verified:** 2026-02-09T22:43:51Z
**Status:** gaps_found
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Operator can run npm install and npm run build in this repository without monorepo-only dependency failures. | ✗ FAILED | `npm install --dry-run` returns `EUNSUPPORTEDPROTOCOL` for `workspace:*`; `npm run build` passes, but install requirement fails. |
| 2 | Server startup path resolves all runtime imports from this package itself. | ✓ VERIFIED | No `@repo/*` or `@r2r/*` imports in `src/`; `npm run smoke:tools` starts `dist/index.js` and completes MCP handshake. |
| 3 | User can run deterministic waits by time, text appearance, and text disappearance using browser_wait_for. | ? UNCERTAIN | `src/protocol/tool-definitions.ts` and `src/tools/common.ts` implement modes and handler wiring, but end-to-end wait behavior needs live extension/tab validation. |
| 4 | User can close the active browser session cleanly using browser_close. | ? UNCERTAIN | `src/tools/common.ts` sends `browser_close`; runtime closure behavior in real browser session cannot be proven by static checks alone. |
| 5 | User can still navigate and capture accessibility snapshots through the registered Phase 1 toolset. | ? UNCERTAIN | `browser_navigate` + `browser_snapshot` are registered and handlers exist, but functional snapshot output requires connected browser session. |
| 6 | Operator can start the MCP server locally and verify the pre-scraping toolset is registered. | ✓ VERIFIED | `scripts/smoke-list-tools.mjs` successfully initializes server and confirms required tools are present. |
| 7 | Operator has a repeatable smoke command to confirm build + startup + tool listing before using the server. | ✓ VERIFIED | `package.json` provides `smoke` and `smoke:tools`; `npm run smoke:tools` passes with 4/4 required tools found. |

**Score:** 3/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/protocol/tool-definitions.ts` | Local tool schema/type definitions, including wait_for/close contracts | ✓ VERIFIED | Exists (183 lines), substantive, imported by tool modules and used at runtime. |
| `src/protocol/ws-messages.ts` | Local websocket message map with wait_for/close payloads | ✓ VERIFIED | Exists (53 lines), substantive, used by `Context.sendSocketMessage` typing. |
| `src/config/mcp.config.ts` | Local MCP runtime configuration replacing monorepo config dependency | ✗ STUB | Exists but only 11 lines vs plan `min_lines: 15`; wiring exists in `src/context.ts` and `src/ws.ts`. |
| `src/tools/common.ts` | Wait-for and close handlers with deterministic output | ✓ VERIFIED | Exists (181 lines), includes parse + socket send + deterministic response text. |
| `src/index.ts` | Tool registration includes wait_for and close | ✓ VERIFIED | Registers `common.waitFor` and `common.close` in server toolset. |
| `scripts/smoke-list-tools.mjs` | Scripted startup + list-tools verification against local build | ✓ VERIFIED | Exists (219 lines), spawns `dist/index.js`, performs initialize + `tools/list`, asserts required tools. |
| `package.json` | Script entrypoints for smoke verification | ✓ VERIFIED | Contains `smoke` and `smoke:tools` scripts linked to smoke script. |
| `README.md` | Local setup, smoke verification, startup runbook | ✓ VERIFIED | Contains install/build/smoke/start steps and expected no-tab behavior guidance. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/index.ts` | `src/protocol/tool-definitions.ts` | Tool imports reference local protocol module | ⚠️ PARTIAL | No direct protocol import in `src/index.ts`; link is indirect via `src/tools/common.ts`/`snapshot.ts`. |
| `src/context.ts` | `src/protocol/ws-messages.ts` | `sendSocketMessage` typing uses local message map | ✓ WIRED | Direct type imports (`MessageType`, `MessagePayload`, `SocketMessageMap`) enforce local protocol map usage. |
| `src/tools/common.ts` | `src/protocol/ws-messages.ts` | wait-for/close handlers use typed message names | ✓ WIRED | Handlers call `context.sendSocketMessage("browser_wait_for"|"browser_close", ...)`, constrained by `Context` generic typing. |
| `src/index.ts` | `src/tools/common.ts` | Registered tool list includes new handlers | ✓ WIRED | `common.waitFor` and `common.close` are included in `commonTools`. |
| `scripts/smoke-list-tools.mjs` | `dist/index.js` | Spawn local build and perform list-tools handshake | ✓ WIRED | Script resolves `../dist/index.js` and spawns `node` with MCP JSON-RPC handshake. |
| `package.json` | `scripts/smoke-list-tools.mjs` | npm scripts execute smoke path | ✓ WIRED | `smoke` and `smoke:tools` invoke the smoke script directly. |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| RUNT-01 | ✗ BLOCKED | Standalone `npm install` fails due `workspace:*` devDependencies in `package.json`. |
| RUNT-02 | ✓ SATISFIED | Local server starts and required tools are programmatically listed by smoke test. |
| AUTO-01 | ? NEEDS HUMAN | Navigation/snapshot handlers are wired, but real browser-tab interaction not validated in this check. |
| AUTO-02 | ? NEEDS HUMAN | Wait-for modes are implemented, but deterministic behavior under repeated real-page runs needs manual validation. |
| AUTO-07 | ? NEEDS HUMAN | `browser_close` is wired; clean browser-session teardown needs live extension/session test. |
| DISC-01 | ✗ BLOCKED | Phase baseline is not fully operator-ready while standalone install path remains broken. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `package.json` | 32 | `"@r2r/messaging": "workspace:*"` | 🛑 Blocker | Breaks standalone npm install; directly blocks local operability goal. |
| `package.json` | 33 | `"@repo/config": "workspace:*"` | 🛑 Blocker | Same install failure mode for standalone operators. |
| `package.json` | 34 | `"@repo/messaging": "workspace:*"` | 🛑 Blocker | Same install failure mode for standalone operators. |
| `package.json` | 35 | `"@repo/types": "workspace:*"` | 🛑 Blocker | Same install failure mode for standalone operators. |
| `package.json` | 36 | `"@repo/utils": "workspace:*"` | 🛑 Blocker | Same install failure mode for standalone operators. |
| `README.md` | 92 | "cannot yet be built on its own" stale statement | ⚠️ Warning | Contradicts new runbook; may mislead operators about current support status. |

### Human Verification Required

### 1. Deterministic Wait Behavior

**Test:** With extension connected to a live page, call `browser_wait_for` repeatedly for `mode=time`, `mode=text`, and `mode=text_gone` under controlled page changes.
**Expected:** Each mode succeeds/fails consistently with stable response text and timeout behavior across repeated runs.
**Why human:** Requires live browser + extension timing behavior; not inferable from static code checks.

### 2. Session Closure Behavior

**Test:** Connect a tab, issue `browser_close`, then attempt another browser tool call.
**Expected:** Session closes cleanly and subsequent calls fail with explicit no-connection guidance until reconnect.
**Why human:** Requires real extension/tab lifecycle behavior and websocket teardown observation.

### 3. Snapshot/Navigate End-to-End

**Test:** Run `browser_navigate` then `browser_snapshot` on a known page with stable content.
**Expected:** Navigation succeeds and snapshot output is structured and usable for discovery setup.
**Why human:** Snapshot quality and real-time page integration require runtime browser execution.

### Gaps Summary

Phase 1 is close, but the core operability gate is still failing: standalone npm install is broken by monorepo `workspace:*` devDependencies. Build and smoke checks pass in the current environment, and key deterministic tools are wired and registered, but the install blocker prevents claiming full local operator readiness. Additional live-browser checks are still required to confirm deterministic wait and clean close behavior end-to-end.

---

_Verified: 2026-02-09T22:43:51Z_
_Verifier: Claude (gsd-verifier)_
