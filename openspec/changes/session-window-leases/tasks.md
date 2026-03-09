## 1. Lease Model and Window Creation

- [x] 1.1 Refactor `SessionManager` lease storage from `sessionId -> tabId` to `sessionId -> { windowId, tabId }` with updated accessors/snapshots.
- [x] 1.2 Replace tab-based lease creation with window-based creation that opens one normal window per approved session and returns both IDs.
- [x] 1.3 Implement deterministic geometry calculation from the current window bounds (`+200 left`, `+400 top`, `-400 width`, `-600 height`) and apply it during window creation.

## 2. Approval and Command Routing Integration

- [x] 2.1 Update approval handling in `mcp-bridge` to create window-backed leases while preserving existing control-event payload contracts.
- [x] 2.2 Ensure command routing continues to resolve only the leased tab for each `sessionId` with no fallback behavior.
- [x] 2.3 Update logging and lease diagnostics to include both `windowId` and `tabId` in create/revoke paths.

## 3. Lifecycle and Revocation Semantics

- [x] 3.1 Add window-close listener handling in session lifecycle so closing the leased window revokes the corresponding session lease.
- [x] 3.2 Preserve and validate tab-close revocation semantics for leased tabs in the new window-backed model.
- [x] 3.3 Ensure revocation remains idempotent when close events and explicit revoke paths race.

## 4. Tests and Validation

- [x] 4.1 Extend `session-manager.test.ts` for window-backed lease creation, geometry application, and lease snapshot shape.
- [x] 4.2 Add tests for closure behavior (window close and tab close) proving lease revocation and routing denial after revocation.
- [x] 4.3 Add/adjust integration coverage for approval flow to verify one window is created per approved session and URL initialization is preserved.