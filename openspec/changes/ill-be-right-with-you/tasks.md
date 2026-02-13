## 1. Hub Package Scaffold And Contracts

- [x] 1.1 Create new workspace package `packages/hub` with `package.json`, `tsconfig.json`, and base scripts for `build`, `typecheck`, `dev`, and `test`.
- [x] 1.2 Add hub build/test orchestration scripts at the workspace root so hub can be run with the existing monorepo workflow.
- [x] 1.3 Create `packages/hub/src/index.ts` bootstrap for hub runtime startup and shutdown handling.
- [x] 1.4 Create `packages/hub/src/protocol/messages.ts` with strict message types and required field definitions for control-plane and session-scoped envelopes.
- [x] 1.5 Define hub-side error code catalog in `packages/hub/src/errors.ts` for protocol, routing, auth, revoke, and kill-switch deny paths.
- [x] 1.6 Add runtime message validation guards that hard-fail on missing required fields and unknown message types.

## 2. Hub Session Authority And Routing State

- [x] 2.1 Implement `packages/hub/src/state/session-store.ts` with 64-bit session ID minting and active-map collision retry.
- [x] 2.2 Implement connection binding rules in session store (`sessionId -> MCP connection`) with mismatch rejection support.
- [x] 2.3 Implement session lifecycle states for pending, active, and revoked/ended transitions.
- [x] 2.4 Implement `packages/hub/src/state/waiting-room-store.ts` for pending join entries including hub-stamped `join_request_time`.
- [x] 2.5 Implement waiting-room sort helper using `join_request_time ASC` and `sessionId` lexicographic tie-break for deterministic presentation.
- [x] 2.6 Implement revoke idempotency and precedence logic so revoke wins over concurrent approve/command actions.

## 3. Hub Routing Flows

- [x] 3.1 Implement `packages/hub/src/router/mcp-router.ts` for MCP ingress handling of blocking `join_request` and session-scoped commands.
- [x] 3.2 Implement `packages/hub/src/router/extension-router.ts` for extension ingress handling of waiting-room decisions and kill-switch events.
- [x] 3.3 Implement `packages/hub/src/router/command-router.ts` to forward only validated session-scoped commands to extension.
- [x] 3.4 Implement blocking join flow completion path (resolve only after Join/Reject decision).
- [x] 3.5 Implement global revoke path triggered by kill switch off and extension disconnect fallback.
- [x] 3.6 Emit explicit decision/error responses back to MCP requester with machine-readable codes.

## 4. MCP Package Refactor To Hub Topology

- [x] 4.1 Update `packages/mcp/src/server.ts` to remove direct extension websocket ownership assumptions.
- [x] 4.2 Update `packages/mcp/src/context.ts` to use hub transport abstraction instead of direct extension message sender.
- [x] 4.3 Update `packages/mcp/src/protocol/ws-messages.ts` to align with hub contract message names and payload requirements.
- [x] 4.4 Update `packages/mcp/src/protocol/ws-sender.ts` to include required envelope fields and hub-correlated request handling.
- [x] 4.5 Add join-request command path from MCP to hub with required fields (`name`, `reason`, `url`) and blocking behavior.
- [x] 4.6 Ensure all MCP tool invocations requiring browser control are session-scoped and hard-fail without valid session routing.

## 5. Extension Lease Model Refactor

- [x] 5.1 Refactor `packages/extension/src/session/session-manager.ts` from singleton session state to `sessionId -> tabId` lease map.
- [x] 5.2 Add lease lifecycle operations in session manager: create lease, get lease, revoke lease, revoke all.
- [x] 5.3 Ensure approved session lease creation opens tab at requested URL (not default blank page).
- [x] 5.4 Update command target resolution logic to require `sessionId` and reject missing/unknown session routes.
- [x] 5.5 Preserve explicit no-fallback behavior for tab targeting (no active-tab or implicit-session fallbacks).
- [x] 5.6 Ensure revocation clears lease state and prevents subsequent command execution for revoked sessions.

## 6. Extension Messaging And Waiting-Room UI

- [x] 6.1 Update `packages/extension/src/types/messages.ts` to add hub-facing waiting-room and session envelope message contracts.
- [x] 6.2 Update `packages/extension/src/messaging/mcp-bridge.ts` to process hub control-plane events and session-scoped commands.
- [x] 6.3 Update `packages/extension/entrypoints/background.ts` runtime routes for waiting-room list retrieval and Join/Reject actions.
- [x] 6.4 Propagate kill-switch state changes from background to hub and handle reconnect/disconnect revoke interactions.
- [x] 6.5 Extend `packages/extension/entrypoints/popup/index.html` with waiting-room list UI and action controls.
- [x] 6.6 Extend `packages/extension/entrypoints/popup/index.ts` to render waiting-room rows with local AM/PM time, name, reason, and requested URL.
- [x] 6.7 Implement popup action handlers for Join and Reject decisions and refresh behavior for deterministic ordering.

## 7. Hard-Error And No-Fallback Enforcement

- [x] 7.1 Audit all touched hub routing paths to ensure malformed/unknown messages return explicit hard errors.
- [x] 7.2 Audit all touched MCP paths to ensure missing/invalid session routing never falls back to implicit behavior.
- [x] 7.3 Audit all touched extension command paths to ensure missing/invalid lease always hard-denies execution.
- [x] 7.4 Remove or refactor legacy direct-message compatibility paths in touched runtime routes where they conflict with strict contract behavior.
- [x] 7.5 Verify kill-switch-disabled behavior hard-denies command execution even when upstream route state is stale.

## 8. Automated Test Suite (Net-New)

- [x] 8.1 Add and configure test tooling for packages touched by this change (hub, MCP, extension) so tests are executable in CI/local.
- [x] 8.2 Add hub unit tests for session ID generation, collision retry, connection binding, and revoke idempotency.
- [x] 8.3 Add waiting-room unit tests for required-field validation, timestamp stamping, and deterministic sort tie-break behavior.
- [x] 8.4 Add extension unit tests for lease map operations and strict command-deny behavior on missing/invalid session IDs.
- [x] 8.5 Add integration tests for blocking join lifecycle across MCP -> hub -> extension with Join and Reject outcomes.
- [x] 8.6 Add integration tests for kill-switch global revoke covering both pending and active sessions.
- [x] 8.7 Add race tests for approve-vs-revoke, command-vs-revoke, and duplicate revoke idempotency.
- [x] 8.8 Add contract tests proving hard-fail/no-fallback behavior for malformed envelopes and unknown session routes.

## 9. Verification, Readiness, And Final Commit

- [x] 9.1 Run package typechecks for `packages/hub`, `packages/mcp`, and `packages/extension` and fix all failures.
- [x] 9.2 Run build commands for `packages/hub`, `packages/mcp`, and `packages/extension` and fix all failures.
- [x] 9.3 Run the full automated test suite introduced in this change and resolve all failures.
- [x] 9.4 Perform one manual multi-client validation scenario to confirm session isolation and waiting-room operator control.
- [x] 9.5 Update change artifacts if implementation details materially diverge from proposal/design/specs.
- [ ] 9.6 Create a single comprehensive commit containing implementation and tests after all verification passes.
