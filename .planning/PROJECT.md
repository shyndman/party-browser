# Browser MCP Pre-Scraping Interface

## What This Is

This project evolves `browser-mcp` into a reliable pre-scraping system that can be driven by an LLM. The goal is to let an LLM inspect real pages, determine robust selectors, and hand those selectors to a procedural scraping stage for repeatable extraction. The initial scope focuses on getting the current repo running cleanly and shipping a critical Playwright-MCP-like tool interface for this selector-discovery workflow.

## Core Value

An LLM can consistently derive actionable selectors from live page context so downstream procedural scraping is reliable.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Get this repository running locally in a reproducible way despite current dependency/friction points.
- [ ] Expose a critical pre-scraping MCP toolset compatible with Playwright-MCP-style usage (`navigate`, `wait_for`, `snapshot`, `click`, `type`, `select_option`, `press_key`, `evaluate`, `network_requests`, `screenshot`, `console_messages`, `close`).
- [ ] Enable a practical two-stage scraping workflow: LLM selector discovery first, procedural extraction second.
- [ ] Keep tool semantics deterministic and automation-safe for repeated scraping runs.

### Out of Scope

- CDP/DevTools-protocol-dependent dialog handling — explicitly excluded due detectability and user preference.
- Arbitrary code execution tooling equivalent to `browser_run_code` — deferred for safety and scope control.
- Coordinate/vision-first interaction tools (`*_xy`, wheel/drag-by-coordinates) — deferred because they are brittle for selector-centric scraping.

## Context

This codebase already contains an MCP server architecture with WebSocket-based browser interaction and several existing browser tools. The immediate product direction is to prioritize pre-scraping capabilities instead of broad test automation parity. A critical design input from the user is avoiding CDP-based mechanisms; this affects which Playwright-like features are feasible in v1.

## Constraints

- **Detection/Security**: No CDP/DevTools Protocol usage for core features — avoid detectable debugger attachment patterns.
- **Scope**: Focus on pre-scraping selector discovery, not full browser testing parity.
- **Architecture**: Build on existing MCP + WebSocket tool architecture already in this repository.
- **Safety**: Avoid introducing unconstrained arbitrary-code browser execution in initial scope.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Prioritize a critical first tool set for pre-scraping | Fastest path to selector-discovery value with minimal surface area | — Pending |
| Exclude CDP-based dialog handling | User explicitly rejects CDP due detectability concerns | — Pending |
| Defer coordinate-only and arbitrary code execution tools | Not critical for selector-first workflow and increases risk/complexity | — Pending |

---
*Last updated: 2026-02-09 after initialization*
