# Roadmap: Browser MCP Core

## Overview

This roadmap delivers Browser MCP Core as a reliability-first local automation server that remains compatible with MCP clients and the Browser MCP extension. The sequence starts by locking down lifecycle, local-execution guarantees, and MCP SDK baseline safety, then hardens connection/error behavior, and then protects behavior with automated quality gates.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Lifecycle Safety, Local Guarantees, and SDK Baseline** - Local-first execution, shutdown behavior, and MCP SDK baseline are reliable and safe.
- [ ] **Phase 2: Connection Reliability and Error Contracts** - Connection state, retry behavior, and error surfaces are explicit and resilient.
- [ ] **Phase 3: Automated Quality and CI Confidence** - Core behavior is protected by repeatable tests and enforced gates.

## Phase Details

### Phase 1: Lifecycle Safety, Local Guarantees, and SDK Baseline
**Goal**: Users can trust that automation stays local, uses their existing browser profile, starts/stops cleanly, and runs on a current safe MCP SDK baseline.
**Depends on**: Nothing (first phase)
**Requirements**: STACK-01, RELY-05, CORE-01, CORE-02, CORE-03, CORE-04
**Success Criteria** (what must be TRUE):
  1. User can run automation workflows entirely on their machine without requiring remote browser execution.
  2. User can automate authenticated sites using their existing browser profile without re-authenticating through a separate session store.
  3. User can stop the server and restart it without recursive close failures or orphaned server/bridge resources.
  4. Maintainer can run the server on `@modelcontextprotocol/sdk` `^1.26.x` and validate existing tool/resource flows without compatibility regression.
  5. User-observed automation continues to behave as real-browser interaction (navigation/input timing and profile context) needed for baseline bot-friction reduction.
**Plans**: 3 plans across 2 waves

Plans:
- [ ] 01-01: Upgrade MCP SDK to ^1.26.x — Update package.json, install dependencies, verify typecheck (Wave 1)
- [ ] 01-02: Fix recursive close and implement graceful shutdown — Fix server.ts close bug, create shutdown coordinator, add SIGINT/SIGTERM handlers, enhance WebSocket close (Wave 2)
- [ ] 01-03: Replace aggressive process cleanup with graceful termination — Update port.ts to use SIGTERM with SIGKILL fallback (Wave 2)

### Phase 2: Connection Reliability and Error Contracts
**Goal**: Users can observe connection health and receive predictable failure handling during bridge/tool operations.
**Depends on**: Phase 1
**Requirements**: RELY-01, RELY-02, RELY-03, RELY-04, ERR-01, ERR-02, ERR-03, ERR-04, DX-05
**Success Criteria** (what must be TRUE):
  1. User can observe current connection state transitions (`disconnected`, `connecting`, `connected`, `reconnecting`) during normal operation and recovery.
  2. User sees automatic reconnect attempts with bounded exponential backoff after transient disconnects, and fail-fast behavior for non-transient failures.
  3. User receives structured MCP errors with actionable messages, including timeout-driven failure outcomes when operations exceed configured limits.
  4. User can inspect health/debug signals (last successful operation, failure streak, basic latency, and lifecycle/bridge debug logs) to diagnose issues.
**Plans**: TBD

Plans:
- [ ] 02-01: TBD during phase planning

### Phase 3: Automated Quality and CI Confidence
**Goal**: Maintainers can trust changes because critical workflows are covered by automated tests and CI enforcement.
**Depends on**: Phase 2
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. Contributor can run automated unit tests that verify tool handlers across success and representative failure paths.
  2. Contributor can run integration tests that validate extension-bridge behavior with mocked WebSocket/extension responses.
  3. Contributor can execute browser-backed tests for critical end-to-end automation workflows and get deterministic pass/fail feedback.
  4. Pull requests fail automatically when typecheck, test, coverage, or build gates are not met.
**Plans**: TBD

Plans:
- [ ] 03-01: TBD during phase planning

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 1.1 -> 1.2 -> 2 -> 2.1 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Lifecycle Safety, Local Guarantees, and SDK Baseline | 0/TBD | Not started | - |
| 2. Connection Reliability and Error Contracts | 0/TBD | Not started | - |
| 3. Automated Quality and CI Confidence | 0/TBD | Not started | - |
