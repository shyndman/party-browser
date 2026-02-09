# Requirements: Browser MCP Core

**Defined:** 2026-02-09
**Core Value:** AI clients can reliably automate a real, logged-in local browser session through a simple MCP interface.

## v1 Requirements

Requirements for the next delivery roadmap. These combine all researched table-stakes capabilities plus product guarantees explicitly described in `README.md`.

### Reliability & Lifecycle

- [ ] **RELY-01**: User session reports connection health using heartbeat/ping-pong checks
- [ ] **RELY-02**: Server automatically attempts reconnect with bounded exponential backoff after transient disconnects
- [ ] **RELY-03**: User can observe explicit connection state (`disconnected`, `connecting`, `connected`, `reconnecting`)
- [ ] **RELY-04**: Server exposes connection health signals (last successful operation, failure streak, and basic latency)
- [ ] **RELY-05**: Server performs clean shutdown without recursive close failure or orphaned runtime resources

### Error Handling & Recovery

- [ ] **ERR-01**: Tool failures return structured, categorized MCP errors with actionable messages
- [ ] **ERR-02**: Each tool operation enforces a configurable timeout with safe failure behavior
- [ ] **ERR-03**: Transient connection failures retry with backoff while non-transient failures fail fast
- [ ] **ERR-04**: Partial operation failures degrade gracefully when safe alternatives exist

### Testing & Quality

- [ ] **TEST-01**: Tool handlers have automated unit tests covering success and representative failure paths
- [ ] **TEST-02**: Extension-bridge behavior has integration tests with mocked WebSocket/extension responses
- [ ] **TEST-03**: End-to-end automation flow is covered by browser-backed tests for critical user workflows
- [ ] **TEST-04**: Coverage reporting is generated and enforced in CI for core server packages
- [ ] **TEST-05**: Pull requests run automated quality gates (typecheck, tests, build) in CI

### Contributor Experience

- [ ] **DX-01**: Repository includes contributor guidelines for setup, conventions, and PR workflow
- [ ] **DX-02**: Repository includes developer setup guide for running, testing, and debugging locally
- [ ] **DX-03**: Architecture documentation is published and cross-referenced from contributor docs
- [ ] **DX-04**: Tool API documentation is available for tool inputs, outputs, and behavior expectations
- [ ] **DX-05**: Debug logging is instrumented consistently across lifecycle and bridge operations
- [ ] **DX-06**: Contributors can build and validate this repository without hidden monorepo-only coupling

### Product Guarantees (From README)

- [ ] **CORE-01**: Automation executes locally on the user's machine without requiring remote browser execution
- [ ] **CORE-02**: Automation uses the user's existing browser profile so logged-in sessions remain usable
- [ ] **CORE-03**: Default automation flow keeps browsing activity on-device and avoids remote telemetry dependence
- [ ] **CORE-04**: Automation path preserves real-browser interaction characteristics needed to reduce basic bot-detection friction

## v2 Requirements

Deferred differentiators not explicitly requested in the provided idea document.

### Advanced Reliability and UX

- **ADV-01**: User can recover pending automation context after reconnect (session recovery)
- **ADV-02**: User receives post-action confirmation that navigation/click/type completed as intended
- **ADV-03**: Server can attempt intelligent element recovery when selectors become stale
- **ADV-04**: Developer can replay recorded operation sequences for debugging
- **ADV-05**: Error payloads include rich contextual diagnostics (state snapshot and recent operation context)
- **ADV-06**: Developer can run interactive step-through debugging for automation sequences
- **ADV-07**: Extension exposes visual connection and activity indicator for live troubleshooting

## Out of Scope

Explicitly excluded to prevent scope creep and preserve local-first product direction.

| Feature | Reason |
|---------|--------|
| Remote/cloud browser execution mode | Conflicts with local-first and privacy guarantees |
| Multi-tab or multi-window orchestration in one server process | Adds high complexity and weakens current isolation model |
| Built-in CAPTCHA solving | Legal/ethical risk and high maintenance burden |
| Persistent session storage inside MCP server | Increases security risk and duplicates browser-owned session management |
| AI-driven element selection as primary strategy | Adds non-determinism and latency compared with deterministic selectors |
| Auto-install/manage extension via store APIs | Adds credentials/dependency risk and reduces explicit user control |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RELY-01 | TBD | Pending |
| RELY-02 | TBD | Pending |
| RELY-03 | TBD | Pending |
| RELY-04 | TBD | Pending |
| RELY-05 | TBD | Pending |
| ERR-01 | TBD | Pending |
| ERR-02 | TBD | Pending |
| ERR-03 | TBD | Pending |
| ERR-04 | TBD | Pending |
| TEST-01 | TBD | Pending |
| TEST-02 | TBD | Pending |
| TEST-03 | TBD | Pending |
| TEST-04 | TBD | Pending |
| TEST-05 | TBD | Pending |
| DX-01 | TBD | Pending |
| DX-02 | TBD | Pending |
| DX-03 | TBD | Pending |
| DX-04 | TBD | Pending |
| DX-05 | TBD | Pending |
| DX-06 | TBD | Pending |
| CORE-01 | TBD | Pending |
| CORE-02 | TBD | Pending |
| CORE-03 | TBD | Pending |
| CORE-04 | TBD | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 0
- Unmapped: 24 ⚠

---
*Requirements defined: 2026-02-09*
*Last updated: 2026-02-09 after initial definition*
