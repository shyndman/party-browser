# Phase 1: Runtime and Deterministic Core - Research

**Researched:** 2026-02-09
**Domain:** Standalone MCP runtime hardening and deterministic baseline browser tools
**Confidence:** HIGH

## Summary

Phase 1 should focus on making this repository independently operable and ensuring the minimal deterministic discovery toolset is both present and verifiable. The current code already includes `browser_navigate` and `browser_snapshot` pathways, but local build/start is blocked by monorepo-only imports (`@repo/*`, `@r2r/*`) and the wait/close requirements are not fully aligned with the roadmap requirement set.

The most reliable path is to build a local compatibility layer in `src/` (configs + tool schemas + socket message typings) and migrate existing imports to those local modules. This keeps runtime behavior explicit and removes dependency on unavailable workspace packages.

For deterministic control, Phase 1 should implement `browser_wait_for` semantics (time/text/text disappearance) with explicit validation, timeout behavior, and consistent responses. Session lifecycle should include `browser_close` as a first-class tool so discovery runs can cleanly terminate browser state.

**Primary recommendation:** First eliminate monorepo import blockers, then implement deterministic wait/close primitives, then add a local operability smoke path that proves build + startup + tool registration.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | `^1.26.0` | MCP server + stdio transport | Already in repo and aligned with current MCP server patterns |
| `typescript` | `^5.6.2` | Type safety and build contracts | Existing codebase standard |
| `tsup` | `^8.4.0` | ESM bundling for CLI binary | Already used for distributable output |
| `ws` | `^8.18.1` | Browser extension websocket server | Existing runtime transport |
| `zod` + `zod-to-json-schema` | `^3.24.x` | Tool argument validation and MCP schema projection | Existing tool definition pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `commander` | `^13.1.0` | CLI entrypoint + versioning | Keep for executable UX |
| `shx` | `^0.3.4` | Cross-platform post-build chmod | Keep for package publishing path |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Local typed message map | `any` payloads everywhere | Faster initially, but weak safety and harder deterministic behavior |
| Local config modules | Hard-coded constants in each tool | Fewer files short-term, more drift and inconsistency |

## Architecture Patterns

### Recommended Project Structure
```
src/
├── config/                 # Local app + MCP runtime config
├── protocol/               # Tool schemas and websocket message typings
├── tools/                  # MCP tool implementations
├── utils/                  # Runtime helpers (ports, snapshots, logging)
└── index.ts                # CLI entrypoint
```

### Pattern 1: Local Compatibility Boundary
**What:** Replace monorepo imports with local `src/config/*` and `src/protocol/*` modules.
**When to use:** Any package intended to build outside its source monorepo.
**Example:** `src/context.ts` and `src/tools/*.ts` import local types/config rather than `@repo/*`.

### Pattern 2: Deterministic Wait as a Contract
**What:** `browser_wait_for` should support explicit condition types (time/text/text_gone) with clear parse + timeout semantics.
**When to use:** Discovery flows where page readiness varies and fixed sleeps are flaky.
**Example:** Tool handler maps validated wait mode to socket message payload and returns stable user-facing status text.

### Anti-Patterns to Avoid
- **Fixed-sleep only waits:** Causes nondeterministic runs and brittle behavior.
- **Implicit close semantics:** Relying on process exit instead of explicit `browser_close` leaves session state unclear.
- **Scattered configs:** Duplicated timeouts/ports in multiple files create drift.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP request plumbing | Custom JSON-RPC router | `@modelcontextprotocol/sdk` handlers | SDK already provides capability-safe wiring |
| Tool input parsing | Manual object checks | `zod` schemas converted with `zod-to-json-schema` | Single source for validation + MCP schema |
| Websocket server lifecycle | Ad hoc socket startup logic in many files | `createWebSocketServer` helper + shared config | Centralized lifecycle and easier determinism |

**Key insight:** Hand-rolled protocol and validation code tends to look simple initially but quickly becomes the source of nondeterministic behavior and hidden edge-case failures.

## Common Pitfalls

### Pitfall 1: Build Success in Monorepo, Failure in Package Repo
**What goes wrong:** Build depends on unavailable workspace aliases and fails locally.
**Why it happens:** Runtime package imports private monorepo modules (`@repo/*`).
**How to avoid:** Provide local compatibility modules and update imports before feature expansion.
**Warning signs:** `Could not resolve "@repo/..."` during `npm run build`.

### Pitfall 2: Wait Tool Looks Present But Misses Required Semantics
**What goes wrong:** Tool exists, but only supports fixed duration (`browser_wait`) while requirement expects conditional wait behavior.
**Why it happens:** Product requirement evolved faster than tool contract.
**How to avoid:** Implement `browser_wait_for` modes directly in schema + handler and document exact behavior.
**Warning signs:** Repeated flaky outcomes and inability to wait for text disappearance.

### Pitfall 3: Session Cleanup Not Explicitly Testable
**What goes wrong:** Sessions may remain open because closure is implicit.
**Why it happens:** No first-class close tool in exposed toolset.
**How to avoid:** Add `browser_close` tool and include it in Phase 1 smoke verification.
**Warning signs:** Follow-up runs inherit unknown page/tab state.

## Code Examples

### Local schema + MCP tool registration pattern
```typescript
const tools: Tool[] = [navigate(true), waitFor, close, snapshot];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((tool) => tool.schema),
}));
```

### Deterministic wait handler pattern
```typescript
const args = WaitForTool.shape.arguments.parse(params);
await context.sendSocketMessage("browser_wait_for", args);
return { content: [{ type: "text", text: `Wait condition met: ${args.mode}` }] };
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monorepo-coupled package imports | Package-local compatibility layer | Needed for standalone distribution | Makes local build/start reproducible |
| Duration-only waits | Condition-driven waits (`time`/`text`/`text_gone`) | Required by Phase 1 outcomes | Improves determinism and operator trust |

## Open Questions

1. **Where should deterministic timeout defaults live?**
   - What we know: Wait behavior needs stable defaults and clear override points.
   - What's unclear: Whether timeout should be global config-only or per-tool defaults with overrides.
   - Recommendation: Define a single timeout source in local MCP config and allow tool-level override only where required.

2. **How strict should local operability be for missing extension connection?**
   - What we know: Server can start without an active browser tab; tools fail at call time.
   - What's unclear: Whether startup should hard-fail if extension is disconnected.
   - Recommendation: Keep startup permissive, keep tool-time errors actionable (current pattern).

## Sources

### Primary (HIGH confidence)
- Local codebase inspection (`src/index.ts`, `src/server.ts`, `src/context.ts`, `src/tools/*`).
- Local build run (`npm run build`) showing unresolved monorepo imports.
- `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md` for Phase 1 target behaviors.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - already present in package and implementation.
- Architecture: HIGH - based on current code structure and known blockers.
- Pitfalls: HIGH - directly observed from current build/runtime constraints.

**Research date:** 2026-02-09
**Valid until:** 2026-03-11
