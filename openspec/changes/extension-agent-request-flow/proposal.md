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
- `waiting-room-admission`: Extend admission behavior to include extension-originated requests while preserving explicit Join/Reject operator control.
- `session-routed-tab-leases`: Update lease behavior to use request-time tab targeting and propagate tab-close revocation into request termination.

### Modified Capabilities
- None.

## Impact

- **Extension (`packages/extension`)**: Popup UI, background message handling, request/history persistence, popout page, and additional control commands/events.
- **Hub (`packages/hub`)**: New request store, process orchestration, timeout/cancel/reject/close termination paths, startup cleanup for request workspaces, and new control-plane events.
- **MCP/agent integration**: `opencode run` invocation contracts for preflight title generation and main `partywebsurfer` run, plus parsing structured JSON events.
- **Data/storage**: New persisted request-history schema in extension storage; temp workspace lifecycle under `/tmp/partybrowser/requests/<requestId>`.
- **Tests**: New coverage required for hub orchestration state transitions, popup/history behavior, and timeout/cancel/reject/tab-close termination correctness.

## Third-Party Dependencies (Verified)

### Existing dependencies already present

- `packages/hub` already ships with `ws` and `winston` runtime dependencies; no additional websocket/logging library is required for request orchestration scaffolding.
- `packages/extension` currently has no runtime UI dependencies; markdown rendering/sanitization for History/Popout is currently unstated and must be chosen.

### Missing dependency: safe markdown rendering in extension UI

The new History preview + popout renderer needs a markdown parser plus HTML sanitizer. The current spec requires safe markdown rendering but does not yet name concrete packages.

Option A (recommended): `marked` + `dompurify`
- Version ranges: `marked@^17.0.0`, `dompurify@^3.3.0`
- Verified API usage from official docs:
  - `marked.parse(markdown)` generates HTML.
  - `DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })` sanitizes output before insertion.
- Verified call ordering: parse markdown first, then sanitize generated HTML, then render.

Option B: `markdown-it` + `dompurify`
- Version ranges: `markdown-it@^14.1.0`, `dompurify@^3.3.0`
- Verified API usage from official docs:
  - `const md = markdownit({ html: false, linkify: true })`
  - `md.render(markdown)` generates HTML.
  - `DOMPurify.sanitize(...)` sanitizes before render.

### Missing external runtime prerequisite: OpenCode CLI availability

The change depends on `opencode run` execution from hub. This is an external runtime dependency (not a package import), and should be specified explicitly.

Runtime options:
- Option A (recommended): treat OpenCode CLI as host prerequisite available on PATH (`opencode`), installed via OpenCode official install methods (`curl -fsSL https://opencode.ai/install | bash` or `npm install -g opencode-ai`).
- Option B: support `PARTYBROWSER_OPENCODE_BIN` override and fall back to PATH `opencode`.

Verified CLI contract inputs (from `opencode run --help` in current environment):
- `--agent`, `--model`, `--dir`, and `--format json` are available and sufficient for this change.

## Current Baseline (Validated)

- Extension popup currently supports status + kill switch + waiting-room decisions only:
  - `PopupMessageKinds` includes `GET_STATUS`, `TOGGLE_KILL_SWITCH`, `GET_KILL_SWITCH_STATE`, `GET_WAITING_ROOM_LIST`, and `WAITING_ROOM_DECISION`.
  - Popup UI renders waiting-room rows and Join/Reject buttons; no request form, no history tab, and no popout page.
- Extension persistence currently stores only transport config (`serverPort`) in `browser.storage.local`; request/history storage is not implemented.
- Extension lease behavior currently creates a new background tab on approval (`createLeaseTab` uses `browser.tabs.create({ active: false })`), then binds `sessionId -> tabId`.
- Extension already revokes leases when leased tabs close (`tab_closed` path), but this is not currently wired to terminate a spawned local agent process.
- Hub control-plane commands are currently limited to `waiting_room.list`, `waiting_room.decide`, and `kill_switch.set`; there is no extension-originated request create/cancel command contract.
- Hub runtime currently routes websocket protocol traffic only; there is no process-spawn/orchestration code in `packages/hub/src`.
- Waiting-room entries are currently created from MCP `join_request` messages (`name`, `reason`, `url`) routed through `join_session`; there is no extension-originated request source today.
- MCP join transport currently allows only one in-flight join request per connection (`pendingJoinRequest`) and defaults to a 10-minute request timeout.
- Repository currently contains OpenCode setup documentation (`README.md`) but no runtime `opencode run` invocation path in extension/hub code, and no in-repo `partywebsurfer` agent definition.
- Test baseline exists for hub runtime/state, MCP context, and extension session-manager, but there is no existing test coverage for extension request orchestration/history/popout behavior.

## Assumption Corrections Applied

- Prior wording treated waiting-room/session lease capabilities as pre-existing baseline capabilities. Verified baseline OpenSpec state currently has only `type-safe-wait-for-payload` as an active spec under `openspec/specs/`; therefore this change keeps `waiting-room-admission` and `session-routed-tab-leases` scoped as capabilities defined within this change set.
