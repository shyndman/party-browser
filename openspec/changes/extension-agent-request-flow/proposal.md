## Why

PartyBrowser currently supports operator-managed waiting-room approvals for MCP clients, but it cannot initiate an agent run from the extension UI itself. This change adds a direct extension request flow so users can submit a prompt from the popup, run an agent against the current tab, and review persisted results without manual CLI orchestration.

## What Changes

- Add an extension-initiated request flow with freeform prompt capture and immediate request creation.
- Add hub-side process orchestration to spawn `opencode run` jobs for both title preflight and main `partywebsurfer` execution.
- Bind request targeting to the focused tab at request time, while still requiring waiting-room approval before browser automation begins.
- Add request lifecycle controls for cancel, reject, tab-close termination, and 5-minute post-approval execution timeout with hard process termination.
- Add persisted request history (last 10 entries, FIFO eviction) with immutable generated titles, prompt retention, safe markdown rendering, and popout detail page.
- Add popup UI restructuring into Waiting Room and History tabs, including in-progress visibility and cancel controls.
- Parse `opencode run --format json` output to derive title and final markdown summary.

## Capabilities

### New Capabilities
- `extension-agent-requests`: Extension-originated request creation, cancellation, and history presentation.
- `hub-agent-process-orchestration`: Hub process spawning, supervision, timeout enforcement, and termination semantics for request-backed agent runs.
- `opencode-json-result-ingestion`: Deterministic ingestion of structured `opencode run --format json` events for title and summary extraction.

### Modified Capabilities
- `waiting-room-admission`: Extend admission behavior to include extension-originated requests while preserving explicit Join/Reject operator control.
- `session-routed-tab-leases`: Update lease behavior to use request-time tab targeting and propagate tab-close revocation into request termination.

## Impact

- **Extension (`packages/extension`)**: Popup UI, background message handling, request/history persistence, popout page, and additional control commands/events.
- **Hub (`packages/hub`)**: New request store, process orchestration, timeout/cancel/reject/close termination paths, startup cleanup for request workspaces, and new control-plane events.
- **MCP/agent integration**: `opencode run` invocation contracts for preflight title generation and main `partywebsurfer` run, plus parsing structured JSON events.
- **Data/storage**: New persisted request-history schema in extension storage; temp workspace lifecycle under `/tmp/partybrowser/requests/<requestId>`.
- **Tests**: New coverage required for hub orchestration state transitions, popup/history behavior, and timeout/cancel/reject/tab-close termination correctness.
