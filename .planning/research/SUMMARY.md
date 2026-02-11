# Project Research Summary

**Project:** blindflight
**Domain:** MCP server + Firefox extension structural migration (v1.1)
**Researched:** 2026-02-11
**Confidence:** HIGH

## Executive Summary

This milestone is a structural re-platform of an already shipped system, not a product expansion. The winning approach across `STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, and `PITFALLS.md` is: migrate to a pnpm workspace, move the extension to TypeScript on WXT, preserve Firefox MV2 behavior, and perform a single clean-break rename to `blindflight` with `browser_` prefixes removed everywhere.

The strongest roadmap signal is dependency order. Workspace foundation comes first, then extension TS+WXT migration, then protocol hardening and naming/rebrand sweep, then full behavior-parity validation. This order minimizes breakage because WXT/MV2 and package boundaries are prerequisites for safe protocol and naming changes.

The major risks are migration-specific, not feature-specific: WXT entrypoint lifecycle mistakes, MV2 background persistence/regression in `webRequest`, schema drift between server and extension, and breakage from renamed tools. Mitigation is explicit phase gates with parity tests, strict protocol contract checks, and no scope creep beyond behavior-preserving refactor work.

## Key Findings

### Recommended Stack

`STACK.md` supports a conservative stack tuned for this milestone's constraints.

**Core technologies:**
- `pnpm@10.x`: workspace orchestration with strict local dependency boundaries.
- `Node.js@22.x`: target runtime for WXT 0.20+ and modern ESM tooling.
- `TypeScript@5.7+`: full extension migration and stronger MCP-extension contracts.
- `WXT@0.20.x`: extension framework for TS build pipeline with explicit Firefox MV2 output.
- `@modelcontextprotocol/server@1.26.x`, `playwright@1.51.x`, `ws@8.x`, `zod@3.25+`: retain stable runtime behavior from v1.0.

**Critical versions/constraints:**
- Pin MCP SDK to stable v1.x (`1.26.x`), not v2 pre-alpha.
- Keep Firefox MV2 output explicit in WXT config.
- Keep WebSocket transport and protocol envelopes behavior-compatible.

### Expected Features

`FEATURES.md` confirms milestone success criteria are structural and behavior-stable.

**Must have (table stakes):**
- Full extension migration to TypeScript + WXT.
- pnpm workspace split with `packages/mcp` and `packages/extension`.
- Clean-break removal of `browser_` tool prefixes.
- Rebrand to `blindflight` across package/binary/manifest/docs.
- Firefox MV2 compatibility preserved with parity tests.

**Should have (if no behavior drift):**
- Protocol contract hardening (typed envelopes, error-code consistency).
- Internal modularization of oversized extension background logic.

**Defer (v2+):**
- MV3 migration, Chrome expansion, UI redesign, and all net-new browser capabilities.

### Architecture Approach

`ARCHITECTURE.md` recommends a two-package workspace with strict runtime boundary: MCP server in `packages/mcp` and extension runtime in `packages/extension`, communicating through stable WebSocket JSON envelopes. Keep protocol semantics unchanged while renaming message/tool identifiers in a single coordinated sweep.

**Major components:**
1. `packages/mcp` - MCP tool registration, protocol server, and command dispatch.
2. `packages/extension` - WXT entrypoints (`background.ts`, `content.ts`, popup) with MV2 behavior parity.
3. Protocol contract layer - shared message/error definitions consumed consistently on both sides.
4. Build/release scripts - workspace builds, Firefox artifact packaging, and rebrand-safe naming.

### Critical Pitfalls

Top pitfalls from `PITFALLS.md` that should become phase gates:

1. **WXT entrypoint misuse** - any `browser.*` calls at module scope can break build/runtime; keep API access inside entrypoint `main()`.
2. **MV2 background persistence regressions** - `webRequest` capture can silently fail without explicit persistent MV2 behavior.
3. **Workspace import/config drift** - missing `workspace:*` deps and TS project references break cross-package contracts.
4. **Protocol schema drift during TS migration** - subtle envelope changes can break server-extension interoperability.
5. **Rename blast radius** - clients break if rename is incomplete or inconsistent across tools/docs/config.

### Rejected Alternatives (Conflicts with Locked Decisions)

- **Alias compatibility for `browser_*` names**: rejected. Locked decision requires clean-break removal with no compatibility aliases.
- **Re-prefixing tools as `bf_*`**: rejected. Locked decision is remove `browser_` prefix, not replace with a new prefix.
- **MV3-first or dual-target migration in this milestone**: rejected. Locked decision is preserve Firefox MV2 compatibility now.
- **Adding a third workspace package (for example `packages/shared`/`packages/types`) as required structure**: rejected for milestone baseline. Locked structure is `packages/mcp` and `packages/extension`.
- **Adopting Vue starter UI from `tmp/blindflight-extension`**: rejected. Locked decision is behavior stability and no net-new capabilities/UI redesign.

## Implications for Roadmap

Based on combined research, use this phase structure:

### Phase 1: Workspace Foundation
**Rationale:** Every downstream change depends on stable package boundaries.
**Delivers:** pnpm workspace, `packages/mcp`, `packages/extension`, root scripts, reproducible installs/builds.
**Addresses:** Structural table stakes from `FEATURES.md`.
**Avoids:** Cross-package import/config failures.

### Phase 2: Extension TS + WXT Migration (MV2)
**Rationale:** Highest structural risk; must be stabilized early.
**Delivers:** `background.ts`, `content.ts`, popup migration, WXT config with Firefox MV2 parity.
**Uses:** WXT/TypeScript stack guidance from `STACK.md` plus local reference entrypoint patterns.
**Avoids:** Entrypoint lifecycle mistakes, content-script timing drift, background persistence regressions.

### Phase 3: Protocol Contract Stabilization
**Rationale:** Safe rename and rebrand require stable, explicit message contracts first.
**Delivers:** Typed envelopes/error codes, serialization parity checks, contract tests.
**Implements:** Architecture boundary recommendations from `ARCHITECTURE.md`.
**Avoids:** Schema drift and silent interoperability failures.

### Phase 4: Clean-Break Rename + Rebrand
**Rationale:** Must execute in one coordinated sweep to satisfy locked decisions.
**Delivers:** `blindflight` naming everywhere and full `browser_` prefix removal without aliases.
**Addresses:** Rebrand + naming table stakes.
**Avoids:** Partial rename/orphaned references causing operator/client breakage.

### Phase 5: Behavior Parity Validation Gate
**Rationale:** No net-new capability mandate requires hard verification before release.
**Delivers:** parity suite for tool semantics, protocol envelopes, MV2 manifest/permissions, and build artifacts.
**Addresses:** behavior stability contract.
**Avoids:** shipping refactor-induced behavior drift.

### Phase Ordering Rationale

- Workspace before migration: avoids mixed topology and import ambiguity.
- Migration before rename: reduces debugging dimensions when behavior changes appear.
- Contract hardening before clean-break rename: makes failures obvious and diagnosable.
- Dedicated validation gate last: enforces the no-net-new-capability constraint.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** WXT MV2 persistence details and content-script timing parity checks.
- **Phase 3:** precise contract sharing approach within two-package constraint.

Phases with standard patterns (can likely skip extra research):
- **Phase 1:** pnpm workspace bootstrapping is well documented.
- **Phase 4:** mechanical rename/rebrand execution is straightforward with checklist discipline.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Strong official docs + concrete version guidance in `STACK.md`. |
| Features | HIGH | Milestone scope is explicit, constrained, and internally consistent. |
| Architecture | MEDIUM-HIGH | Core structure is clear; exact two-package contract-sharing details need implementation choices. |
| Pitfalls | HIGH | Risks are concrete, reproducible, and directly tied to this migration type. |

**Overall confidence:** HIGH

### Gaps to Address

- **Tool rename migration support docs:** client/operator migration instructions are required because no alias fallback is allowed.
- **Protocol sharing within two-package workspace:** decide final ownership/export mechanism without adding mandatory third package.
- **Parity harness completeness:** define exact baseline fixtures for tool responses and wire envelopes before coding.
- **Reference-template influence boundaries:** borrow WXT entrypoint/build patterns from `tmp/blindflight-extension`, but avoid Vue/module adoption in this milestone.

## Sources

### Primary (HIGH confidence)
- `.planning/research/STACK.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`
- WXT docs (`wxt.dev`) and Mozilla MV2 docs cited in the research files.

### Local reference influence
- `tmp/blindflight-extension/wxt.config.ts` - confirms starter WXT wiring pattern.
- `tmp/blindflight-extension/package.json` - confirms practical WXT script layout (`dev:firefox`, `build:firefox`, `postinstall: wxt prepare`).
- `tmp/blindflight-extension/entrypoints/background.ts` and `tmp/blindflight-extension/entrypoints/content.ts` - reinforces entrypoint-style migration pattern.

---
*Research completed: 2026-02-11*
*Ready for roadmap: yes*
