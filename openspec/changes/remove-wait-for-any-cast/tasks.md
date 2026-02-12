## 1. Update wait_for payload dispatch

- [x] 1.1 Replace `as any` payload send in `packages/mcp/src/tools/common.ts` with mode-specific typed dispatch.
- [x] 1.2 Preserve existing runtime validation and user-facing result text behavior.

## 2. Verify

- [x] 2.1 Run MCP package typecheck/tests (or nearest available verification command) to confirm no regressions.
