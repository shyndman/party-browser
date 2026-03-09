## Context

PartyBrowser currently treats approval as a tab-lease event: `session.approved` drives `SessionManager.createLease(sessionId, url)`, which creates a background tab and records `sessionId -> tabId`. That model preserves strict session routing, but it does not provide a dedicated automation surface per session. This change introduces a window-backed lease surface for each approved session and applies deterministic geometry tuned for maximized-operator workflows.

## Goals / Non-Goals

**Goals:**
- Create one dedicated browser window per approved session.
- Keep strict explicit routing guarantees (no active-tab fallback, no implicit session targeting).
- Preserve command execution against the approved URL context for each session.
- Apply deterministic placement/sizing for the created window: +200px left inset, +400px top inset, -200px right inset, -200px bottom inset.
- Keep operational ergonomics simple: window opens in normal state (not auto-minimized).

**Non-Goals:**
- Cross-browser window-management parity beyond current Firefox extension target.
- Off-screen placement or background-unfocused guarantees.
- Introducing a new scheduling/orchestration layer for multi-window layout policies.

## Decisions

### 1) Move from tab-only lease records to window-backed lease records
**Decision:** Store lease metadata as `{ windowId, tabId }` per `sessionId`.

**Rationale:** Command routing still targets tabs, but lifecycle ownership now belongs to the dedicated window. Persisting both identifiers avoids brittle reverse lookups and enables direct cleanup semantics for either tab or window closure.

**Alternatives considered:**
- Keep `sessionId -> tabId` only and infer `windowId` ad hoc via `browser.tabs.get`: rejected due to repeated async lookups and weaker closure handling.
- Route commands by `windowId` directly: rejected because existing command plumbing and content-bridge contracts are tab-addressed.

### 2) Create normal windows with deterministic insets derived from current window bounds
**Decision:** On approval, create a normal browser window using geometry derived from the currently focused window bounds:
- `left = base.left + 200`
- `top = base.top + 400`
- `width = base.width - 400`
- `height = base.height - 600`

**Rationale:** User workflow assumes maximized primary windows, so using current-window bounds is deterministic without relying on unsupported Firefox display APIs.

**Alternatives considered:**
- `browser.system.display` workarea sizing: rejected because Firefox does not currently expose this API for extensions.
- Off-screen placement/focus suppression: rejected as unsupported or unreliable in Firefox.

### 3) Keep existing approval and routing contracts, changing only lease surface semantics
**Decision:** Do not change hub control-plane envelopes or command payload contracts; only extension-side lease creation and lifecycle handling change.

**Rationale:** Avoids avoidable protocol churn while preserving compatibility with existing MCP and hub behavior.

**Alternatives considered:**
- Add new control event fields for geometry: rejected for now; static policy is sufficient and avoids coupling geometry policy to hub protocol.

## Risks / Trade-offs

- **[Window focus interruption on approval]** → Accept as explicit product behavior; operator can minimize with local shortcut.
- **[Window/tab lifecycle divergence]** (tab closed while window remains, or window closed with tab teardown races) → Centralize revocation on first observed closure and keep revocation idempotent.
- **[Geometry mismatch if operator is not maximized]** → Base geometry on active window bounds by design; document as expected behavior.

## Migration Plan

1. Update lease model and approval-time creation path in extension session manager and bridge logic.
2. Update revocation listeners to handle both tab and window closure consistently.
3. Update and extend extension unit/integration tests for window creation geometry and one-window-per-session semantics.
4. Update change specs/tasks and handoff notes for implementation.

Rollback strategy: revert to tab-creation lease path while preserving existing session routing validation.

## Open Questions

- Should geometry be configurable later via extension settings, or remain fixed policy?
- Should approval-time window creation honor multi-monitor target preferences in a future change?