# Project Research Summary

**Project:** Browser MCP Core
**Domain:** Local-first browser automation MCP server (stdio <-> WebSocket extension bridge)
**Researched:** 2026-02-09
**Confidence:** HIGH

## Executive Summary

Browser MCP Core is a local connection-broker product: it translates MCP tool calls from AI clients over stdio into browser actions executed through a Chrome extension over WebSocket. The research is consistent across stack, features, architecture, and pitfalls: teams that succeed here prioritize lifecycle reliability and protocol boundaries over feature breadth. In practical terms, this means fixing shutdown/process hygiene first, then hardening connection state and error contracts, then scaling confidence with tests and CI.

Recommended approach is opinionated: ship a reliability-first MVP before adding advanced capability. Start with the critical MCP SDK upgrade (`@modelcontextprotocol/sdk` v1.26.x), eliminate lifecycle hazards (recursive close, orphaned processes, zombie native hosts), and introduce a testable architecture boundary (Bridge + Connection Manager + DI). Build table-stakes reliability features (heartbeat, reconnection, structured errors, health monitoring) before investing in high-complexity differentiators.

Top risks are operational, not UI/feature: broken reconnect behavior after sleep/wake, hidden monorepo dependency coupling, and flaky extension E2E due to initialization races. Mitigation is clear: explicit lifecycle state machines, deterministic shutdown ordering, fixture-based extension readiness checks, and standalone package validation in CI before release.

## Key Findings

### Recommended Stack

The stack recommendation is strong and modern: keep TypeScript + `ws` + `tsup`, but upgrade MCP SDK immediately for security/lifecycle fixes and standardize testing with Vitest + MCP-specific mocks. Use Node 24 LTS as the forward baseline while keeping CI coverage for Node 22/24 during transition.

**Core technologies:**
- `@modelcontextprotocol/sdk@^1.26.0`: MCP protocol core - closes known security/lifecycle gaps and improves transport/session handling.
- `Node.js@^24`: runtime baseline - longest support runway and better ESM/WebSocket ergonomics.
- `TypeScript@^5.7`: implementation language - aligns with NodeNext/ESM and improves tooling performance.
- `ws@^8.18`: extension bridge transport - mature, predictable WebSocket implementation.
- `vitest` + `mcp-testing-kit` + `vitest-websocket-mock`: test stack - enables unit/integration coverage without real browser dependency.
- `pnpm@^10` + `@biomejs/biome`: DX and CI efficiency - faster installs, stricter dependency graph, simpler lint/format workflow.

**Critical version requirements:**
- Upgrade MCP SDK to `^1.26.0` immediately (security advisory + lifecycle stability).
- Set engine target to Node 24 (`>=24.0.0`) once compatibility checks pass.

### Expected Features

Research converges on reliability-first table stakes for launch, with differentiators layered only after the connection foundation is stable.

**Must have (table stakes):**
- WebSocket heartbeat/ping-pong and connection state visibility.
- Automatic reconnection with exponential backoff.
- Structured, typed MCP error responses and per-operation timeout controls.
- Unit + integration tests for tool handlers and extension bridge.
- CI pipeline for typecheck/lint/test/build.
- Contributor docs (`CONTRIBUTING.md`, `DEVELOPMENT.md`) and debug instrumentation.

**Should have (competitive):**
- Action confirmation (verify operation outcomes, not just dispatch).
- Rich error context (last good state, console/log context).
- Intelligent element recovery for stale DOM references.
- Operation replay/trace for debugging.

**Defer (v2+):**
- Session recovery/replay across reconnects.
- Interactive step-through debugging.
- Full real-browser E2E matrix until deterministic extension fixtures are mature.

### Architecture Approach

Adopt a layered broker architecture with explicit failure boundaries: Entry/Lifecycle -> MCP Server -> Bridge Adapter -> Connection Manager -> Extension. Keep MCP server thin, move browser semantics into a Bridge, and isolate WebSocket complexity in a Connection Manager with a finite state machine. Enforce deterministic shutdown order and dependency injection for testability.

**Major components:**
1. Entry + Lifecycle Manager - signal handling, startup/shutdown ordering, process cleanup.
2. MCP Server Layer - protocol compliance and request routing only (no browser business logic).
3. Bridge Layer - tool dispatch, error translation, connection-aware command mediation.
4. Connection Manager - WebSocket lifecycle, heartbeat, reconnection, health tracking.
5. Tool/Service Layer - automation operations behind abstractions, not direct socket calls.

### Critical Pitfalls

1. **Zombie native host without socket** - add socket existence checks, heartbeat, and auto-respawn logic before declaring ready.
2. **Orphaned MCP server processes** - detect parent disconnect/idle and self-terminate with full cleanup hooks.
3. **Sleep/wake reconnection failures** - monitor port disconnects and enforce backoff reconnect state machine.
4. **Flaky extension E2E races** - require explicit extension-ready fixture and isolated browser profiles.
5. **Monorepo extraction breakage/version drift** - validate standalone package in clean CI and enforce strict dependency/version contracts.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Lifecycle Hardening + Security Baseline
**Rationale:** Reliability blockers and security risk are immediate and foundational; every other phase depends on this.
**Delivers:** MCP SDK upgrade, recursive-close fix, deterministic shutdown manager, parent disconnect handling, socket/process health checks.
**Addresses:** Table-stake reliability state and clean shutdown.
**Avoids:** Zombie host, orphaned process, crash-leaked resources.

### Phase 2: Connection Reliability Architecture
**Rationale:** Once lifecycle is safe, enforce clean protocol boundaries and resilient connection behavior.
**Delivers:** Bridge abstraction, Connection Manager state machine, heartbeat, reconnection/backoff, structured error mapping.
**Uses:** `ws`, upgraded MCP SDK, TypeScript NodeNext patterns.
**Implements:** Layered broker boundaries from architecture research.
**Avoids:** Silent connection replacement, cascading connection failures, untyped error surfaces.

### Phase 3: Testing and CI Reliability
**Rationale:** After architecture stabilizes, lock behavior with tests to prevent regression while velocity increases.
**Delivers:** Vitest unit/integration coverage, websocket mocks, extension-ready fixtures, CI gates (typecheck/lint/test/build), baseline coverage reporting.
**Addresses:** QA table stakes and contributor confidence.
**Avoids:** Flaky E2E races, happy-path-only coverage, untrusted CI signal.

### Phase 4: Decoupling + Contributor Experience
**Rationale:** Publishability and external contribution should come after behavior is stable and test-guarded.
**Delivers:** Standalone package validation, explicit dependency declarations, compatibility matrix, docs completion, release readiness checks.
**Uses:** pnpm strict graph, packaging guardrails.
**Avoids:** Hidden monorepo dependency failures, version coordination drift, broken external installs.

### Phase Ordering Rationale

- Lifecycle reliability first because all tool execution and testing assume healthy process/socket ownership.
- Architecture boundary second because it reduces coupling and enables meaningful unit/integration tests.
- Testing third because stable abstractions drastically reduce test flake and maintenance cost.
- Decoupling last because extraction amplifies unresolved lifecycle and dependency issues.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Extension protocol contract details and connection handoff semantics still need interface validation.
- **Phase 4:** Standalone extraction strategy (shared package ownership, semver boundaries, compatibility policy) needs targeted dependency research.
- **Future multi-tab phase:** High uncertainty around extension/tab routing behavior; requires dedicated phase research before scoping.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Lifecycle cleanup and shutdown sequencing patterns are well-documented.
- **Phase 3 (unit/integration portion):** Vitest + mock-driven testing patterns are established and repeatable.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Strong official-source backing (MCP SDK release/security notes, Node LTS schedule) plus mature ecosystem tools. |
| Features | MEDIUM-HIGH | Table stakes are clear; differentiators are directionally sound but less validated by direct MCP-specific precedent. |
| Architecture | HIGH | Findings align with code-level analysis and standard broker/lifecycle design patterns. |
| Pitfalls | HIGH | Multiple real-world incident patterns across MCP/extension/process lifecycle domains. |

**Overall confidence:** HIGH

### Gaps to Address

- Extension-native host protocol specifics: confirm handshake fields, connection replacement semantics, and recovery responsibilities before final phase tasking.
- Multi-tab support viability: validate extension constraints before roadmap includes any multi-tab commitment.
- Decoupling boundaries: identify which internal packages are published vs bundled and define ownership/version policy early in planning.
- Runtime baseline transition: verify Node 24 adoption path for all contributors/CI environments before hard enforcement.

## Sources

### Primary (HIGH confidence)
- `/modelcontextprotocol/typescript-sdk` - MCP SDK lifecycle, error handling, and server patterns.
- https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v1.26.0 - security/lifecycle upgrade rationale.
- https://nodejs.org/en/about/previous-releases - Node LTS planning baseline.
- https://modelcontextprotocol.info/docs/best-practices/ - MCP architectural and operational practices.
- Chrome/Edge/MDN native messaging docs - extension/native host lifecycle and constraints.

### Secondary (MEDIUM confidence)
- OneUptime WebSocket reliability posts (heartbeat, reconnect, graceful shutdown patterns).
- Playwright/extension testing community guidance and issue threads on flake/isolation patterns.
- Monorepo decoupling literature (`isolate-package`, Turborepo/Nx guidance, version coordination case studies).

### Tertiary (LOW confidence)
- Blog/opinion content on package manager/tooling comparisons and advanced differentiator patterns; useful directionally, requires project-specific validation.

---
*Research completed: 2026-02-09*
*Ready for roadmap: yes*
