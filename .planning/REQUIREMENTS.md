# Requirements: Browser MCP Pre-Scraping Interface

**Defined:** 2026-02-09
**Core Value:** An LLM can consistently derive actionable selectors from live page context so downstream procedural scraping is reliable.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Runtime Foundation

- [ ] **RUNT-01**: Operator can install dependencies and complete a successful local build from this repository.
- [ ] **RUNT-02**: Operator can start the MCP server locally and see the pre-scraping toolset registered.

### Core Automation Tools

- [ ] **AUTO-01**: User can navigate to a URL via `browser_navigate`.
- [ ] **AUTO-02**: User can wait for time/text/text disappearance via `browser_wait_for`.
- [ ] **AUTO-03**: User can click a target element via `browser_click`.
- [ ] **AUTO-04**: User can type text into a target element via `browser_type`.
- [ ] **AUTO-05**: User can select one or more dropdown values via `browser_select_option`.
- [ ] **AUTO-06**: User can issue keyboard input via `browser_press_key`.
- [ ] **AUTO-07**: User can close the active browser page/session via `browser_close`.

### Discovery and Inspection Tools

- [ ] **DISC-01**: User can capture a structured accessibility snapshot for selector reasoning via `browser_snapshot`.
- [ ] **DISC-02**: User can evaluate JavaScript for controlled page/element inspection via `browser_evaluate`.
- [ ] **DISC-03**: User can inspect captured network activity via `browser_network_requests`.
- [ ] **DISC-04**: User can inspect browser console output via `browser_console_messages`.
- [ ] **DISC-05**: User can capture page screenshots for visual verification via `browser_take_screenshot`.

### Pre-Scraping Workflow

- [ ] **FLOW-01**: User can run an LLM-guided discovery pass that outputs selectors suitable for procedural extraction.
- [ ] **FLOW-02**: User can persist or export a selector handoff artifact that procedural scraping can execute without LLM involvement.

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Capabilities

- **ADVN-01**: User can persist authenticated browser session state across runs.
- **ADVN-02**: User can discover/select targets inside Shadow DOM with dedicated helpers.
- **ADVN-03**: User can use incremental snapshots to reduce repeated LLM context size.
- **ADVN-04**: User can resume automated flow after manual human handoff for CAPTCHA/MFA.
- **ADVN-05**: User can enable optional anti-bot hardening strategies for hostile targets.
- **ADVN-06**: User can use self-healing selector updates when previously valid selectors drift.
- **ADVN-07**: User can generate procedural code artifacts from validated discovery flows.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| CDP-based dialog handling (`browser_handle_dialog`) | Explicit project constraint: no DevTools/CDP-based implementation for core capabilities |
| Arbitrary browser code execution (`browser_run_code`) | Increases security and control risk for v1 selector-first scope |
| Coordinate/vision-first controls (`*_xy`, wheel/drag coordinates) | Brittle for selector-centric pre-scraping and not required for v1 value |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RUNT-01 | Phase 1 | Pending |
| RUNT-02 | Phase 1 | Pending |
| AUTO-01 | Phase 1 | Pending |
| AUTO-02 | Phase 1 | Pending |
| AUTO-03 | Phase 2 | Pending |
| AUTO-04 | Phase 2 | Pending |
| AUTO-05 | Phase 2 | Pending |
| AUTO-06 | Phase 2 | Pending |
| AUTO-07 | Phase 1 | Pending |
| DISC-01 | Phase 1 | Pending |
| DISC-02 | Phase 2 | Pending |
| DISC-03 | Phase 3 | Pending |
| DISC-04 | Phase 3 | Pending |
| DISC-05 | Phase 2 | Pending |
| FLOW-01 | Phase 2 | Pending |
| FLOW-02 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-09*
*Last updated: 2026-02-09 after roadmap mapping*
