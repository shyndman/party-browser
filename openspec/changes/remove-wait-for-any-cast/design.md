## Context

The `wait_for` tool currently parses arguments with a discriminated union and then sends a WebSocket payload using `as any`. This weakens type guarantees at the exact boundary where `SocketMessageMap` is intended to enforce protocol correctness.

## Goals / Non-Goals

**Goals:**
- Remove the `as any` cast from `wait_for` payload dispatch.
- Keep runtime behavior and response text unchanged.
- Keep changes localized to the existing call site.

**Non-Goals:**
- Redesigning `wait_for` schema definitions.
- Changing protocol message formats.
- Refactoring unrelated tools.

## Decisions

### Decision 1: Use mode-specific payload construction

Build and dispatch payloads in mode-specific branches (`time`, `text`, `text_gone`) so TypeScript can narrow discriminated unions naturally. This avoids broad casts, keeps intent clear at the call site, and aligns with the existing `SocketMessageMap["wait_for"]` contract.

### Decision 2: Keep runtime validation and result text stable

Preserve the existing runtime checks and user-facing result messages to avoid behavior drift in this cleanup-focused change.
