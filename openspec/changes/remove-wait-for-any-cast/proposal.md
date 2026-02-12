## Why

The `wait_for` tool currently sends its payload using `as any`, which bypasses TypeScript guarantees at the protocol boundary. Removing that cast improves type safety and makes protocol/schema changes easier to catch at compile time.

## What Changes

- Replace the `as any` payload in the `wait_for` tool with discriminated-union-safe payload dispatch
- Preserve existing runtime behavior for all supported modes (`time`, `text`, `text_gone`)
- Keep the existing user-facing result messages unchanged

## Capabilities

### New Capabilities
- `type-safe-wait-for-payload`: Sends `wait_for` messages without `any` casts while preserving mode-specific payload typing.

### Modified Capabilities
- None.

## Impact

- `packages/mcp/src/tools/common.ts`: remove the unsafe cast and build mode-specific typed payloads for `wait_for`
