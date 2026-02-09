# Coding Conventions

**Analysis Date:** 2026-02-09

## Naming Patterns

**Files:**
- TypeScript source: `kebab-case.ts` (e.g., `aria-snapshot.ts`, `port.ts`, `snapshot.ts`)
- Test files: Co-located with source, suffix `.test.js` (e.g., `gsd-tools.test.js`)

**Functions:**
- Use `camelCase` for all functions and methods
- Async functions prefix with action verb: `createServer()`, `sendSocketMessage()`, `captureAriaSnapshot()`
- Boolean checks prefix with `is` or `has`: `isPortInUse()`, `hasWs()`

**Variables:**
- Use `camelCase` for all variables
- Private class properties prefix with underscore: `_ws`
- Descriptive names over abbreviations: `validatedParams` not `vp`

**Types:**
- Use `PascalCase` for type aliases and interfaces: `Tool`, `ToolResult`, `Context`
- Type suffix for type aliases: `ToolSchema`, `ResourceResult`
- Use explicit type imports: `import type { Context }`

**Constants:**
- True constants (module-level, never reassigned): `SCREAMING_SNAKE_CASE`
  - Example: `MODEL_PROFILES`, `noConnectionMessage`
- Regular variables: `camelCase` even if `const`

**Classes:**
- Use `PascalCase` for class names: `Context`
- Private fields prefix with underscore: `_ws: WebSocket | undefined`

## Code Style

**Formatting:**
- 2-space indentation
- Double quotes for all strings
- Semicolons at end of statements
- Trailing commas in multi-line arrays/objects
- Max line length: ~100 characters (observed, not enforced)

**Example:**
```typescript
export const navigate: ToolFactory = (snapshot) => ({
  schema: {
    name: NavigateTool.shape.name.value,
    description: NavigateTool.shape.description.value,
    inputSchema: zodToJsonSchema(NavigateTool.shape.arguments),
  },
  handle: async (context, params) => {
    const { url } = NavigateTool.shape.arguments.parse(params);
    await context.sendSocketMessage("browser_navigate", { url });
    if (snapshot) {
      return captureAriaSnapshot(context);
    }
    return {
      content: [
        {
          type: "text",
          text: `Navigated to ${url}`,
        },
      ],
    };
  },
});
```

**Linting:**
- No explicit ESLint/Prettier configuration detected
- Relies on TypeScript strict mode for code quality

## Import Organization

**Order:**
1. External npm packages
2. Monorepo workspace packages (`@repo/*`)
3. Internal project imports (`@/*`)
4. JSON imports

**Example:**
```typescript
import { zodToJsonSchema } from "zod-to-json-schema";

import { mcpConfig } from "@repo/config/mcp.config";
import { wait } from "@repo/utils";

import { isPortInUse, killProcessOnPort } from "@/utils/port";

import packageJSON from "../package.json";
```

**Path Aliases:**
- `@/*` maps to `./src/*` (from `tsconfig.json`)
- `@repo/*` for workspace packages

## TypeScript Patterns

**Type Annotations:**
- Explicit return types on exported functions
- Explicit parameter types on function signatures
- Type inference allowed for local variables

```typescript
export async function createWebSocketServer(
  port: number = mcpConfig.defaultWsPort,
): Promise<WebSocketServer> {
  // implementation
}
```

**Type Exports:**
- Export types alongside implementations
- Use `export type` for type-only exports

```typescript
export type { Tool, ToolFactory } from "./tool";
```

**Generics:**
- Use descriptive type parameter names
- Constrain when applicable: `T extends MessageType<SocketMessageMap>`

## Error Handling

**Patterns:**
- Try/catch blocks for all async operations that may fail
- Custom error messages for user-facing errors
- Return error state via `isError` flag in ToolResult

```typescript
try {
  const result = await tool.handle(context, request.params.arguments);
  return result;
} catch (error) {
  return {
    content: [{ type: "text", text: String(error) }],
    isError: true,
  };
}
```

**Validation:**
- Use Zod schemas for runtime validation
- Parse params before use: `const { url } = NavigateTool.shape.arguments.parse(params);`

## Logging

**Framework:** `console.error` only

**Pattern:** Standard input/output is reserved for MCP transport, so `console.error` is used for debugging:

```typescript
export const debugLog: typeof console.error = (...args) => {
  console.error(...args);
};
```

**In code:**
```typescript
} catch (error) {
  console.error(`Failed to kill process on port ${port}:`, error);
}
```

## Comments

**When to Comment:**
- JSDoc for public API functions and complex logic
- Inline comments for non-obvious workarounds
- File headers for CLI tools explaining usage

**JSDoc Pattern:**
```typescript
/**
 * Logs a message to the console
 *
 * `console.error` is used since standard input/output is used as transport for MCP
 */
```

**Inline Comments:**
- Use for section separators in large files
- Example: `// ─── Model Profile Table ─────────────────────────────────────────────────────`

## Function Design

**Size:** Functions are small and focused (typically 10-30 lines)

**Parameters:**
- Use destructuring for options objects
- Provide defaults where sensible
- Maximum 3-4 parameters before using options object

**Return Values:**
- Always return typed results
- Use early returns for guard clauses
- Consistent return shapes within functions

## Module Design

**Exports:**
- Named exports preferred over default exports
- Export factory functions as const arrow functions
- Export both types and values

```typescript
export const navigate: ToolFactory = (snapshot) => ({ /* ... */ });
export type { Tool, ToolFactory };
```

**Barrel Files:**
- No barrel files detected
- Import directly from source files

## Class Design

**Pattern:**
- Private fields with underscore prefix
- Getter/setter for controlled access
- Constructor-less when possible (direct field initialization)

```typescript
export class Context {
  private _ws: WebSocket | undefined;

  get ws(): WebSocket {
    if (!this._ws) {
      throw new Error(noConnectionMessage);
    }
    return this._ws;
  }

  set ws(ws: WebSocket) {
    this._ws = ws;
  }

  hasWs(): boolean {
    return !!this._ws;
  }
}
```

---

*Convention analysis: 2026-02-09*
