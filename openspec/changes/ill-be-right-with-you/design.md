## Context

PartyBrowser currently assumes a single implicit automation session and a direct MCP-to-extension control path. That model is easy to reason about for one client, but it cannot safely support multiple simultaneous MCP clients, explicit human admission, or deterministic revocation semantics under race conditions.

This change introduces a hub between MCP clients and the extension, with the following constraints already locked:
- One browser extension connection forever; many MCP clients over time.
- Human-gated admission via waiting-room interactions.
- No implicit fallbacks and no backward-compatibility lane.
- Revocation always wins over approval/command races.
- Join requests block until the operator decides Join or Reject.

Primary stakeholders are the operator (who controls admission), MCP client authors (who need strict protocol behavior), and maintainers (who need deterministic routing/debuggability).

## Goals / Non-Goals

**Goals:**
- Establish the hub as authoritative for session lifecycle and routing.
- Require explicit `sessionId` routing for all command traffic.
- Move extension execution ownership to per-session tab leases (`sessionId -> tabId`).
- Provide waiting-room presentation and operator controls for Join/Reject decisions.
- Preserve deterministic behavior under concurrency with revoke-wins precedence.
- Ship a full automated test suite (unit + integration + race/concurrency cases).

**Non-Goals:**
- Backward compatibility for legacy non-session-routed command paths.
- Implicit tab targeting or default-session behavior.
- Admission policy automation (for now, the operator decides per request).
- Timeout policy optimization for blocked join requests in this phase.
- Multi-browser support.

## Decisions

### 1) Hub owns session authority and routing
**Decision:** The hub mints and manages `sessionId` values, binds `sessionId -> MCP connection`, and enforces routing/authorization checks on every session-scoped message.

**Rationale:** The extension has only one multiplexed connection and cannot safely infer client identity from connection shape. Centralizing authority in hub state avoids split-brain identity checks.

**Alternatives considered:**
- Extension as session authority: rejected because it cannot distinguish MCP clients on the single multiplexed channel.
- MCP self-issued session IDs: rejected due to spoofing ambiguity and authority fragmentation.

### 2) Session ID format is 64-bit random, collision-checked against active sessions
**Decision:** `sessionId` is a 64-bit random token minted by hub. Hub retries generation on active-map collision.

**Rationale:** At the expected scale (1-2 active clients typically), 64-bit randomness is practically collision-safe while keeping IDs compact and fast to pass around.

**Alternatives considered:**
- UUIDv4/128-bit IDs: acceptable but unnecessary overhead for current scale.
- Monotonic counters: rejected due to easier predictability and weaker isolation properties.

### 3) Join request is blocking and user-mediated
**Decision:** MCP `join_request` remains unresolved until the operator chooses Join or Reject in the waiting room.

**Rationale:** This guarantees explicit human gating and prevents silent auto-admission paths.

**Alternatives considered:**
- Immediate ack + async callback: rejected for now because it complicates app-layer behavior and weakens the clear admission boundary.
- Auto-approve policy: rejected; contradicts the human-gated requirement.

### 4) Waiting-room presentation model
**Decision:** Waiting-room rows are sorted for display by `join_request_time ASC`, then `sessionId` lexicographic tie-break. Admission order is operator-chosen and not implied by list position.

**Rationale:** Stable rendering improves operator trust, while preserving manual decision freedom.

**Alternatives considered:**
- FIFO admission semantics: rejected as too restrictive for operator workflows.
- Client-provided timestamps: rejected for ordering authority due to clock skew concerns.

### 5) Extension executes via explicit per-session tab leases
**Decision:** Extension stores and enforces `sessionId -> tabId` mapping. Commands without valid active lease are hard errors.

**Rationale:** This is the simplest model that supports concurrent clients while preserving strict isolation between sessions.

**Alternatives considered:**
- Single global tab ownership: rejected; cannot support multi-client concurrency.
- Dynamic fallback to active tab: rejected per no-fallback rule.

### 6) Revocation precedence and kill-switch behavior
**Decision:** Revocation is an idempotent terminal transition that wins over conflicting approvals/commands. Kill switch off causes global revoke in hub; extension also hard-denies local execution.

**Rationale:** Deterministic conflict resolution is required to avoid partial authorization states.

**Alternatives considered:**
- Last-write-wins timestamp policy: rejected because it allows approval after revoke in race windows.
- Best-effort revoke only: rejected; correctness cannot depend on message delivery.

### 7) Protocol strictness: no fallback, no backward compat
**Decision:** Missing/invalid `sessionId`, missing required join fields, unknown route types, and connection/session mismatches are immediate hard errors.

**Rationale:** Previous implicit fallback behavior obscured actual system state and made debugging hard.

**Alternatives considered:**
- Soft defaulting for absent fields: rejected by explicit project requirement.
- Legacy compatibility shim: rejected as a breaking-change anti-goal.

### 8) Test strategy is first-class scope
**Decision:** The change ships with a comprehensive automated suite:
- Unit tests for hub state transitions and routing guards.
- Integration tests for MCP <-> hub <-> extension message flow.
- Deterministic race tests (approve/revoke, command/revoke, kill-switch while pending/active).
- Contract tests for hard-error/no-fallback behavior.

**Rationale:** The change introduces concurrency-sensitive state transitions where regressions are expensive without strong automation.

## Risks / Trade-offs

- **[Blocking join may cause MCP-side timeouts]** -> Accept in this phase; tune timeout policy later from observed operator behavior.
- **[Hub becomes a central failure domain]** -> Keep hub state machine small and test-heavy; fail closed on uncertain routing decisions.
- **[Race-condition complexity across three actors]** -> Encode explicit state transitions and precedence rules; add race-focused integration tests.
- **[Operator can accumulate many pending rows over long sessions]** -> Keep waiting-room presentation stable and explicit; no hidden auto-admission.
- **[Breaking change disrupts existing clients]** -> Intentional; document strict protocol requirements and update MCP client side in lockstep.

## Migration Plan

1. Implement hub protocol contracts and state machine first, behind local development wiring.
2. Update MCP client path to use explicit join flow and session-scoped envelopes.
3. Refactor extension session management to `sessionId -> tabId` leases and strict command routing.
4. Add waiting-room UI actions and kill-switch propagation to hub global revoke.
5. Add and run full automated suite (unit/integration/race/contract).
6. Validate end-to-end in local multi-client scenarios.

Rollback strategy:
- If deployment validation fails, revert the change set as a whole (single comprehensive commit rollback) and restore previous runtime topology.
- Because no backward-compat lane is added, partial rollout is not supported; promote only once all actors are updated together.

## Open Questions

- What exact timeout values should MCP clients use for blocking `join_request` in normal workflows?
- Should rejected sessions be retained in short-lived operator history for visibility, or removed immediately from active views?
- Do we want optional diagnostics in waiting-room rows (for example, transient connection metadata) in a later iteration?
