# Architecture

**Analysis Date:** 2026-02-09

## Pattern Overview

**Overall:** Layered Architecture with Factory Pattern

This is an MCP (Model Context Protocol) server that enables AI applications to automate browser interactions. It bridges AI clients (Claude, VS Code, etc.) with a Chrome extension via WebSocket communication.

**Key Characteristics:**
- Single-purpose CLI application with stdio transport
- Request-response pattern for tool invocations
- Stateful WebSocket connection management
- Schema-driven tool definitions using Zod validation
- Monorepo-dependent (relies on `@repo/*` and `@r2r/*` packages)

## Layers

**Entry Point Layer:**
- Purpose: Application bootstrap and CLI handling
- Location: `src/index.ts`
- Contains: CLI setup, tool registration, server initialization
- Depends on: Server, Tool, Resource, Config packages
- Used by: Operating system via CLI execution

**Transport Layer:**
- Purpose: WebSocket server for browser extension communication
- Location: `src/ws.ts`
- Contains: WebSocket server creation, port management
- Depends on: `ws` library, `@repo/config`, `@repo/utils`, port utilities
- Used by: Server layer, Context layer

**Server Layer:**
- Purpose: MCP protocol implementation and request routing
- Location: `src/server.ts`
- Contains: Server initialization, request handlers, tool/resource dispatch
- Depends on: MCP SDK, Context, Tools, Resources, WebSocket server
- Used by: Entry point

**Context Layer:**
- Purpose: Connection state and message passing to browser
- Location: `src/context.ts`
- Contains: WebSocket management, typed message sending
- Depends on: `ws` library, `@r2r/messaging`, `@repo/config`, `@repo/messaging`, `@repo/types`
- Used by: Server, Tools, Resources

**Tool Layer:**
- Purpose: Browser automation operations
- Location: `src/tools/`
- Contains: Tool definitions (snapshot, navigation, click, type, etc.)
- Depends on: Context, utilities, Zod schemas from `@repo/types`
- Used by: Server layer

**Resource Layer:**
- Purpose: Read-only data sources (currently placeholder)
- Location: `src/resources/resource.ts`
- Contains: Resource interface and types
- Depends on: Context
- Used by: Server layer

**Utility Layer:**
- Purpose: Shared helper functions
- Location: `src/utils/`
- Contains: ARIA snapshot capture, logging, port utilities
- Depends on: Context, Tool types
- Used by: Tools

## Data Flow

**Tool Execution Flow:**

1. AI client (Claude/VS Code/etc.) sends request via stdio to MCP server
2. `StdioServerTransport` receives and decodes the MCP request
3. `Server.setRequestHandler(CallToolRequestSchema, ...)` routes to matching tool
4. Tool handler extracts context and parameters
5. Tool sends WebSocket message to browser extension via `context.sendSocketMessage()`
6. Browser extension executes action in Chrome
7. Browser extension returns result via WebSocket
8. Tool formats result into MCP ToolResult format
9. Response sent back through transport to AI client

**WebSocket Connection Flow:**

1. Server startup calls `createWebSocketServer()` on configured port (default 4455)
2. Browser extension connects via WebSocket
3. `Context` stores the WebSocket connection
4. Multiple connections trigger cleanup of previous connection
5. All tool operations use this connection for browser communication

**State Management:**
- **State:** Stored in `Context` class (WebSocket connection)
- **Scope:** Per-server instance, single WebSocket connection at a time
- **Persistence:** None (in-memory only, lost on server restart)

## Key Abstractions

**Tool:**
- Purpose: Represents an MCP tool callable by AI
- Definition: `src/tools/tool.ts`
- Pattern: Object with schema (metadata) and handle (implementation)
- Example Tools:
  - `snapshot`: Captures page state
  - `click`: Clicks element
  - `navigate`: Loads URL
  - `screenshot`: Captures page image

**ToolFactory:**
- Purpose: Creates tool variants (with/without snapshot capture)
- Definition: `src/tools/tool.ts`
- Pattern: Factory function returning Tool
- Usage: Navigation tools can optionally capture post-action snapshots

**Resource:**
- Purpose: Represents readable data sources for AI
- Definition: `src/resources/resource.ts`
- Pattern: Object with schema (metadata) and read (implementation)
- Note: Currently no active resources defined

**Context:**
- Purpose: Encapsulates runtime state and browser communication
- Definition: `src/context.ts`
- Pattern: Service class with typed message sending
- Key Methods: `sendSocketMessage()`, `hasWs()`, `close()`

## Entry Points

**CLI Entry Point:**
- Location: `src/index.ts`
- Triggers: Command-line execution via `mcp-server-browsermcp` bin
- Responsibilities:
  - Parse CLI arguments with Commander
  - Define tool and resource collections
  - Initialize server with transport
  - Setup exit handlers for graceful shutdown

**Binary Configuration:**
- Entry: `dist/index.js` (compiled from `src/index.ts`)
- Declared: `package.json` → `bin.mcp-server-browsermcp`

## Error Handling

**Strategy:** Try-catch at request handler level with error transformation

**Patterns:**
1. Tool execution errors caught in `CallToolRequestSchema` handler
2. Errors wrapped in MCP `ToolResult` with `isError: true`
3. Context errors (no connection) throw descriptive messages
4. Zod validation errors bubble up from tool argument parsing

**Example Error Flow:**
```
Tool execution throws → caught in server.ts → wrapped in ToolResult → sent to client
```

## Cross-Cutting Concerns

**Logging:**
- Framework: Native `console.error` only
- Pattern: `src/utils/log.ts` provides `debugLog` wrapper
- Note: Stdio used for MCP transport, so logging uses stderr

**Validation:**
- Framework: Zod schemas defined in `@repo/types`
- Pattern: Schema validation in tool handlers before execution
- Location: Tool files (`src/tools/common.ts`, `src/tools/snapshot.ts`, etc.)

**Authentication:**
- Pattern: None in server; auth handled by browser extension
- Connection: Single WebSocket connection per server instance

**Port Management:**
- Pattern: Kill existing processes before binding
- Location: `src/utils/port.ts`
- Behavior: Aggressive cleanup with platform-specific commands

---

*Architecture analysis: 2026-02-09*
