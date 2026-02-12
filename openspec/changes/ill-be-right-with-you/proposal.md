## Why

Gate the unleashing of bots on a personal browser with explicit human interaction. At the same time, support multiple simultaneous MCP clients without stepping on each other, so each approved agent gets its own isolated tab lease.

## What Changes

- Add a human-operated waiting-room flow where MCP clients request admission and block until a Join or Reject decision is made.
- Introduce a hub as the single session and routing authority for all MCP clients and the one browser extension connection.
- Require explicit session routing for all command traffic using hub-minted 64-bit session IDs.
- Move extension execution from singleton session ownership to per-session tab leasing (`sessionId -> tabId`).
- Route kill-switch state to the hub and enforce global revocation behavior when kill switch is turned off or browser connection drops.
- Enforce deterministic conflict rules where revocation always wins over concurrent approvals or commands.
- Include a full automated test suite covering unit, integration, and concurrency/race behavior for hub routing, waiting-room decisions, and extension tab leasing.
- **BREAKING**: No backward-compatibility lane for legacy non-session-routed traffic.
- **BREAKING**: Remove implicit fallback behavior; missing or invalid routing/session data must produce hard errors.

## Capabilities

### New Capabilities
- `hub-session-authority`: Hub mints session IDs, binds `sessionId -> MCP connection`, and enforces authoritative routing/revocation.
- `waiting-room-admission`: Waiting-room list and operator decision flow (Join/Reject) for pending MCP admission requests.
- `session-routed-tab-leases`: Extension executes commands by explicit `sessionId` and maintains per-session tab leases.
- `kill-switch-global-revocation`: Kill switch propagates to hub and revokes all pending/active sessions globally.

### Modified Capabilities
- None.

## Impact

- Affected systems:
  - New hub runtime/service for session authority and routing.
  - MCP protocol envelope and join request/response contracts.
  - Extension background messaging and session manager state model.
  - Popup/background UX for waiting-room presentation and decisions.
- Affected behavior:
  - Join request is intentionally blocking until operator decision.
  - Waiting-room display order is presentation-only (`join_request_time ASC`, then `sessionId` tie-break), not admission policy.
  - Session IDs are 64-bit random values with active-map collision checks.
- Test coverage expectations:
  - Full suite includes deterministic tests for revoke-wins precedence, command/revoke races, kill-switch global revocation, and strict no-fallback error paths.
  - Integration tests validate end-to-end routing across MCP client(s), hub, and extension for session-bound command execution.
- Operational consequences:
  - MCP clients may time out while waiting for operator decision by design.
  - System correctness does not require revoke-event delivery; authoritative revoke state and disconnect handling remain sufficient.
- Future foundation:
  - Establishes the control plane needed for richer multi-agent orchestration features in later changes.

## Current Baseline (Validated)

- Workspace/package structure today:
  - The workspace currently contains two packages only: `packages/mcp` and `packages/extension`.
  - There is no existing hub package/service in the current codebase.
- MCP transport model today:
  - MCP server maintains a single extension WebSocket reference in context.
  - When a new extension WebSocket connects, the previous connection is closed/replaced.
- Extension session model today:
  - Session ownership is singleton state (`sessionTabId`, `sessionId`) managed by `SessionManager`.
  - There is no existing `sessionId -> tabId` multi-lease map.
- Kill switch behavior today:
  - Kill switch toggling disconnects/reconnects the extension WebSocket transport.
  - Runtime command handling has explicit kill-switch rejection paths.
- UI surface today:
  - Popup/background status and kill-switch controls exist.
  - Waiting-room list and Join/Reject operator controls do not exist yet.
- Test baseline today:
  - MCP and extension test scripts are currently placeholders (tests not implemented), so the full automated suite in this change is net-new scope.

## Implementation Blueprint (Detailed)

This section turns the proposal into an execution-oriented contract for implementation.

### 1) Responsibilities and trust boundaries

- Hub (new) is routing/session authority:
  - Mints 64-bit `sessionId`.
  - Binds `sessionId -> MCP connection`.
  - Maintains waiting-room state and active/revoked state.
  - Enforces all cross-connection routing checks.
- Extension is execution authority:
  - Maintains `sessionId -> tabId` lease map.
  - Executes only when both kill switch and lease are valid.
  - Rejects execution locally when invalid, regardless of upstream state.
- MCP process is a requester:
  - Submits blocking join requests.
  - Uses returned `sessionId` for all subsequent commands.
  - Handles hard errors as terminal for invalid/missing routing state.

### 2) Assumption audit resolved to concrete baseline

- Existing MCP topology is single extension websocket (not multi-tenant):
  - Verified in `packages/mcp/src/server.ts` and `packages/mcp/src/context.ts`.
- Existing extension session model is singleton (not lease-map):
  - Verified in `packages/extension/src/session/session-manager.ts`.
- Existing extension message types are `mcpCommand` and direct legacy command types:
  - Verified in `packages/extension/src/types/messages.ts` and `packages/extension/src/messaging/mcp-bridge.ts`.
- Existing popup/background supports status + kill switch only (no waiting-room controls):
  - Verified in `packages/extension/entrypoints/popup/index.ts`, `packages/extension/entrypoints/popup/index.html`, and `packages/extension/entrypoints/background.ts`.
- Existing test harness is placeholder scripts (no executable suite yet):
  - Verified in `packages/mcp/package.json` and `packages/extension/package.json`.

### 3) Proposed repository changes (explicit)

#### New package

- Add `packages/hub` (new package; does not exist today) with:
  - `package.json` (workspace package metadata and scripts)
  - `src/index.ts` (hub process bootstrap)
  - `src/protocol/messages.ts` (hub wire schemas/types)
  - `src/state/session-store.ts` (session lifecycle + bindings)
  - `src/state/waiting-room-store.ts` (pending requests list)
  - `src/router/mcp-router.ts` (MCP ingress routing)
  - `src/router/extension-router.ts` (extension ingress routing)
  - `src/router/command-router.ts` (session command routing)
  - `src/errors.ts` (hard-error code catalog)

#### MCP package updates

- `packages/mcp/src/server.ts`:
  - Replace direct extension websocket ownership assumptions with hub-client transport behavior.
  - Route tool calls through required `sessionId` contract after successful join.
- `packages/mcp/src/context.ts`:
  - Replace direct extension message sender usage with hub message sender abstraction.
  - Preserve current human-readable no-connection messaging semantics where applicable.
- `packages/mcp/src/protocol/ws-sender.ts` and `packages/mcp/src/protocol/ws-messages.ts`:
  - Refactor to hub envelope contracts (`requestId`, `sessionId` for session-scoped calls).

#### Extension package updates

- `packages/extension/src/session/session-manager.ts`:
  - Replace singleton state (`sessionTabId`, `sessionId`) with lease map model.
  - Add lifecycle operations: create lease, lookup lease, revoke lease, revoke all.
- `packages/extension/src/messaging/mcp-bridge.ts` and `packages/extension/src/types/messages.ts`:
  - Add hub message types for waiting-room updates, join decisions, and session-scoped command routing.
  - Remove implicit/legacy fallback routing paths from runtime behavior.
- `packages/extension/entrypoints/background.ts`:
  - Forward kill-switch state transitions to hub.
  - Reject commands when kill switch disabled or lease missing.
  - Expose waiting-room action routes for popup UI.
- `packages/extension/entrypoints/popup/index.ts` and `packages/extension/entrypoints/popup/index.html`:
  - Add waiting-room list rendering and Join/Reject actions.
  - Display required fields: local time (AM/PM), name, reason, requested URL.

### 4) Wire contract (strict and explicit)

#### 4.1 Control-plane messages (non-session-scoped)

- `join_request` (MCP -> hub):
  - Required: `type`, `name`, `reason`, `url`.
  - No default values.
  - Hub stamps `join_request_time` on receipt.
  - Request remains pending until operator decision.
- `join_decision` (hub -> MCP):
  - Required: `type`, `decision` (`join` | `reject`), `sessionId` when `join`, optional `rejectReason` when `reject`.
- `kill_switch_state` (extension -> hub):
  - Required: `type`, `isEnabled`.

#### 4.2 Session-scoped command envelope

- Required fields for all session-scoped command requests/responses:
  - `requestId` (hub-authoritative request correlation)
  - `sessionId`
  - `type`
  - `payload`
- Validation rules:
  - Missing any required field => hard protocol error.
  - Unknown `sessionId` => hard routing error.
  - Connection/session mismatch => hard authorization error.
  - No fallback to implicit tab/session under any condition.

### 5) Deterministic state and precedence rules

- Revocation is terminal and idempotent for active session state.
- Revocation wins over all competing events:
  - approve vs revoke -> revoked
  - command vs revoke -> revoked, command denied
  - duplicate revoke -> first transition only, subsequent no-op
- Waiting-room sort behavior is presentation-only:
  - Primary: `join_request_time ASC`
  - Tie-break: `sessionId` lexicographic
  - No admission policy implied by order

### 6) Blocking join behavior contract

- Join is intentionally blocking:
  - MCP call remains unresolved until operator Join/Reject.
  - MCP timeout is acceptable in this phase and does not change authority state.
- Operator decision drives completion:
  - Join => session becomes active only after hub bind and extension lease creation.
  - Reject => pending entry is terminated with explicit decision outcome.

### 7) Error model (hard-fail only)

- Error categories to standardize across hub/MCP/extension:
  - `PROTOCOL_INVALID_MESSAGE`
  - `SESSION_NOT_FOUND`
  - `SESSION_CONNECTION_MISMATCH`
  - `SESSION_REVOKED`
  - `KILL_SWITCH_DISABLED`
  - `WAITING_ROOM_DECISION_REQUIRED`
- Required behavior:
  - Errors are explicit and machine-readable.
  - Errors never trigger implicit retry/reroute/default session behavior.

### 8) Test plan and pass criteria (comprehensive)

#### 8.1 Unit tests

- Hub state machine:
  - session minting, collision retry, bind/unbind, revoke idempotency
- Waiting-room behavior:
  - required field validation, ordering, deterministic tie-break
- Extension lease manager:
  - create/revoke/revoke-all, lease lookup failures

#### 8.2 Integration tests

- MCP -> hub -> extension:
  - blocking join lifecycle end-to-end
  - command routing to correct `sessionId -> tabId`
  - strict rejection on missing/invalid routing fields
- Kill-switch flow:
  - extension toggle propagates to hub
  - global revoke effect on pending + active sessions

#### 8.3 Race/concurrency tests

- approve vs revoke (same session)
- command vs revoke (in-flight timing window)
- duplicate revoke (idempotency)
- simultaneous multi-session command execution isolation

#### 8.4 Contract/no-fallback tests

- Missing required fields fail hard.
- Unknown message type fails hard.
- Unknown `sessionId` fails hard.
- No code path silently routes to active tab/default session.

#### 8.5 Definition of done for testing

- All unit/integration/race/contract suites pass in CI/local.
- No placeholder test scripts remain for packages touched by this change.
- Repro steps documented for at least one manual multi-client scenario.

### 9) Operational and rollout details

- Logging/observability required events:
  - join request received
  - waiting-room decision recorded
  - session bound/unbound
  - revoke reason and actor (operator/kill-switch/disconnect)
  - command denied reason
- Rollout rule:
  - Ship as a cohesive change across hub + MCP + extension.
  - No partial/compatibility rollout path is supported by design.
- Commit requirement:
  - Deliver as a single comprehensive commit after implementation and full test pass.

## Third-Party Dependencies (Verified)

- New dependencies introduced by this change: None required.
- Verified in-use dependency versions (lockfile + npm registry):
  - `@modelcontextprotocol/sdk`: `1.26.0` (current)
  - `ws`: `8.19.0` (current)
  - `wxt`: `0.20.15` (current)
  - `@types/webextension-polyfill`: `0.12.4` (current)
- Verified package paths and API contracts from official docs/source:
  - MCP SDK export map includes wildcard subpath exports (`"./*"`), so existing imports such as `@modelcontextprotocol/sdk/server/index.js`, `@modelcontextprotocol/sdk/server/stdio.js`, and `@modelcontextprotocol/sdk/types.js` are valid for `1.26.0`.
  - MCP stdio call ordering is valid: create server, register handlers, then `connect(transport)`; `StdioServerTransport` docs/source indicate `connect()` starts transport handling.
  - `ws` server API used by this repo matches official `8.19.0` docs: `new WebSocketServer({ port })`, `wss.on('connection', ...)`, and message send via `ws.send(...)` gated by ready state.
  - `wxt` export map includes `./utils/define-background`, validating current import path `wxt/utils/define-background`.
