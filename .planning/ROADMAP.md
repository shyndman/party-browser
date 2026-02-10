# Roadmap: Browser MCP Pre-Scraping Interface

## Overview

This roadmap delivers a selector-first pre-scraping workflow where an LLM performs discovery and a procedural stage executes repeatable extraction. The phases are organized by dependency: first establish a reliable runtime and deterministic core primitives, then complete discovery interactions, then finalize handoff and repeatable execution readiness. Each phase is scoped to observable user outcomes so planning and verification can be done against concrete behaviors.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Runtime and Deterministic Core** - Local operability plus stable navigation, waiting, snapshot, and session closure.
- [ ] **Phase 2: Interactive Selector Discovery** - Discovery-time interactions and LLM-guided selector generation.
- [ ] **Phase 02.1: Session and Transport Stabilization (INSERTED)** - Bridge-oriented session ownership and deterministic tab targeting.
- [ ] **Phase 3: Handoff and Repeatable Execution Readiness** - Inspection visibility and exportable handoff for no-LLM procedural execution.

## Phase Details

### Phase 1: Runtime and Deterministic Core
**Goal**: Operators and users can run the server locally and perform deterministic baseline page control for discovery setup.
**Depends on**: Nothing (first phase)
**Requirements**: RUNT-01, RUNT-02, AUTO-01, AUTO-02, AUTO-07, DISC-01
**Success Criteria** (what must be TRUE):
  1. Operator can install dependencies and complete a successful local build from this repository.
  2. Operator can start the MCP server locally and confirm the pre-scraping toolset is registered.
  3. User can navigate to a URL, wait for required conditions, and get deterministic wait outcomes on repeated runs.
  4. User can capture a structured accessibility snapshot and close the active browser session cleanly.
**Plans**: 3 plans

Plans:
- [ ] 01-01-PLAN.md - Remove monorepo-only imports and restore standalone local build.
- [ ] 01-02-PLAN.md - Implement deterministic wait-for and explicit close tools in MCP runtime.
- [ ] 01-03-PLAN.md - Add local startup/tool-registration smoke checks and operator runbook updates.

### Phase 2: Interactive Selector Discovery
**Goal**: Users can perform full discovery interactions and complete an LLM-guided pass that yields actionable selectors.
**Depends on**: Phase 1
**Requirements**: AUTO-03, AUTO-04, AUTO-05, AUTO-06, DISC-02, DISC-05, FLOW-01
**Success Criteria** (what must be TRUE):
  1. User can click, type, select dropdown options, and send keyboard input against live targets during discovery.
  2. User can run controlled page/element inspection via evaluate and receive usable inspection output.
  3. User can capture screenshots during discovery for visual verification of page state.
  4. User can run an LLM-guided discovery pass that outputs selectors suitable for procedural extraction.
**Plans**: 4 plans in 2 waves

Plans:
- [ ] 02-01-PLAN.md — Implement browser_evaluate tool for JavaScript execution in page context
- [ ] 02-02-PLAN.md — Verify and enhance browser_screenshot tool with proper error handling
- [ ] 02-03-PLAN.md — Verify and refine all interactive tools (click, type, select, keyboard)
- [ ] 02-04-PLAN.md — Create LLM-guided selector discovery workflow documentation

### Phase 02.1: Single browser bridge + session-owned tab model (no active-tab fallback, no per-call tabId overrides) (INSERTED)

**Goal:** Stabilize transport/session behavior so startup is reliable, tab targeting is deterministic, and bridge-oriented multi-session work can proceed cleanly.
**Depends on:** Phase 2
**Success Criteria** (what must be TRUE):
  1. MCP tools can be listed even when browser transport is unavailable.
  2. Transport startup failures are explicit (for example port already in use) and never kill unrelated processes.
  3. Browser command execution targets a session-owned tab only (no active-tab fallback, no per-call tabId override).
  4. Bridge migration scope is captured so Phase 3 can depend on a stable session model.
**Ad-hoc work already completed (to formalize in planning):**
  - Port default alignment fix (extension and MCP both use 3456).
  - MCP startup decoupled from WebSocket bind so tool registration remains available.
  - browser_wait_for schema compatibility hardened for strict tool validators.
  - Extension now enforces session-bound tab targeting.
**Plans:** 6 plans in 4 waves (3 original + 3 gap closure)

Plans:
- [x] 02.1-01-PLAN.md — Bridge process ownership, kill switch integration, transport cleanup, and explicit startup failure handling.
- [x] 02.1-02-PLAN.md — Session-owned tab model: navigate-time tab creation, SESSION_NOT_INITIALIZED error codes, tab grouping and title prefix, session lifecycle state machine.
- [x] 02.1-03-PLAN.md — Regression checks: schema validation, error code standardization, no-retry verification, startup reliability tests, Phase 3 migration scope documentation.
- [x] 02.1-04-PLAN.md — Gap 1 Fix: Session ownership cleared on WebSocket close to prevent auto-reuse
- [x] 02.1-05-PLAN.md — Gap 2 Fix: Machine-readable error codes added to transport gate
- [x] 02.1-06-PLAN.md — Gap 3 Fix: Universal [CODE] prefix for all tool execution errors

### Phase 3: Handoff and Repeatable Execution Readiness
**Goal**: Discovery results can be inspected, packaged, and handed off for procedural scraping without LLM involvement.
**Depends on**: Phase 02.1 (Session-owned tab model MUST be stable)
**Requirements**: DISC-03, DISC-04, FLOW-02

**Dependencies from Phase 02.1:**
- Session lifecycle state machine (UNINITIALIZED → NAVIGATING → ACTIVE → CLOSED)
- Navigate-time tab creation and session binding
- SCREAMING_SNAKE_CASE error codes for programmatic handling
- No in-flight request retry (commands fail fast on transport drop)
- Background reconnection without command replay

**Success Criteria** (what must be TRUE):
   1. User can inspect captured network activity from discovery sessions to debug selector and timing behavior.
   2. User can inspect browser console output from discovery sessions to diagnose failures.
   3. User can persist or export a selector handoff artifact that a procedural scraping stage can execute without LLM involvement.
**Plans**: 2 plans in 2 waves

Plans:
- [x] 03-01-PLAN.md — Session-scoped network and console capture infrastructure (browser_network_requests, browser_console_messages tools)
- [x] 03-02-PLAN.md — Selector artifact export for procedural scraping handoff (browser_export_selectors tool, JSON artifact format)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 02.1 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Runtime and Deterministic Core | 3/3 | ✓ Complete | 2026-02-09 |
| 2. Interactive Selector Discovery | 4/4 | ✓ Complete | 2026-02-09 |
| 02.1 Session and Transport Stabilization (INSERTED) | 6/6 | ✓ Complete | 2026-02-10 |
| 3. Handoff and Repeatable Execution Readiness | 2/2 | ✓ Complete | 2026-02-10 |
