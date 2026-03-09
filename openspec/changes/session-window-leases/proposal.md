## Why

Session approvals currently create a background tab lease, which keeps automation isolated but makes the automation surface hard to manage when operators want a dedicated workspace. We want each approved session to get its own browser window with predictable geometry so operators can quickly find, position, and manually minimize it.

## What Changes

- Replace approval-time lease creation from `browser.tabs.create` to `browser.windows.create` for session execution surfaces.
- Store and enforce session routing as a window-backed lease, while continuing to route all commands to the leased tab inside that window.
- Apply deterministic window geometry on creation: inset 200px from left/right/bottom and 400px from top, based on the maximized active browser window bounds.
- Preserve one-window-per-session behavior and keep hard session routing/no-fallback guarantees.
- Keep existing tab-close/window-close revocation semantics so closed leased surfaces immediately revoke the session.

## Capabilities

### New Capabilities
- `session-window-geometry`: Defines deterministic sizing/positioning rules for the automation window created at session approval.

### Modified Capabilities
- `session-routed-tab-leases`: Changes approval behavior from creating a leased tab in the current window to creating a dedicated leased window while preserving strict session-scoped routing semantics.

## Impact

- Extension session lifecycle (`packages/extension/src/session/session-manager.ts`) and approval handling (`packages/extension/src/messaging/mcp-bridge.ts`).
- Extension command routing assumptions that currently track `sessionId -> tabId` only.
- Tests for session lease lifecycle and approval-side surface creation (`packages/extension/src/session/session-manager.test.ts` and integration coverage).
- Documentation/spec expectations describing approved-session surface behavior and geometry.