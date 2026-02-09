# Phase 01: Lifecycle Safety, Local Guarantees, and SDK Baseline - Research

**Researched:** 2026-02-09  
**Domain:** MCP SDK v1.x lifecycle management, WebSocket shutdown patterns, process cleanup  
**Confidence:** HIGH

## Summary

This phase addresses critical infrastructure issues in the browser-mcp server: upgrading the MCP SDK from v1.8.0 to v1.26.x, fixing a recursive close bug that causes infinite loops during shutdown, and establishing proper lifecycle management to prevent orphaned processes.

The current codebase has three major lifecycle issues: (1) an infinite recursion bug in `server.ts` where `server.close()` calls itself, (2) aggressive process termination without verification in `port.ts`, and (3) no graceful shutdown coordinator. Additionally, the SDK version (1.8.0) is 18+ versions behind current, missing important security fixes.

**Primary recommendation:** Upgrade to `@modelcontextprotocol/sdk@^1.26.0`, fix the recursive close bug by storing the original method reference before overriding, implement a proper shutdown coordinator that closes resources in reverse initialization order, and replace aggressive kill signals with graceful WebSocket cleanup.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | ^1.26.0 | MCP protocol implementation | Latest stable with security fix for cross-client data leaking (GHSA-345p-7cg4-v4c7); v2 is pre-alpha and not production-ready |
| `ws` | ^8.18.1 | WebSocket server for browser extension bridge | Industry standard for Node.js WebSocket servers; used by current codebase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^3.24.2+ | Schema validation | Required peer dependency for MCP SDK; maintain compatibility |

### SDK Version Decision
| Consideration | Decision |
|---------------|----------|
| **Current** | `@modelcontextprotocol/sdk@^1.8.0` |
| **Target** | `@modelcontextprotocol/sdk@^1.26.0` |
| **NOT v2** | v2 (main branch) is pre-alpha; production should use v1.x branch |
| **Breaking changes** | Minimal between 1.8.0 and 1.26.x in v1 line; primarily security fixes and OAuth improvements |

**Installation:**
```bash
npm install @modelcontextprotocol/sdk@^1.26.0 zod
```

## Architecture Patterns

### Recommended Shutdown Order

Resources must be closed in **reverse initialization order** to prevent orphaned connections:

```
1. Close active WebSocket connections (clients)
2. Close WebSocket server
3. Close MCP server transport
4. Close MCP server
5. Exit process
```

### Pattern 1: Safe Method Override (Fix Recursive Close)
**What:** Store original method reference before overriding to prevent infinite recursion  
**When to use:** When extending class behavior without subclassing  
**Example:**
```typescript
// Source: Verified from protocol.ts analysis - Protocol.close() calls transport.close()
// Fix for server.ts lines 85-89

// WRONG - causes infinite recursion:
server.close = async () => {
  await server.close(); // Calls the NEW server.close, recursing forever
  await wss.close();
  await context.close();
};

// CORRECT - store original reference:
const originalClose = server.close.bind(server);
server.close = async () => {
  await originalClose(); // Calls the Protocol.close method
  await wss.close();
  await context.close();
};
```

### Pattern 2: Graceful Shutdown Coordinator
**What:** Central coordinator handling SIGINT/SIGTERM with timeout fallback  
**When to use:** Any server with multiple resource types  
**Example:**
```typescript
// Source: Pattern derived from SDK tests and MCP examples
class ShutdownCoordinator {
  private resources: Array<{ name: string; close: () => Promise<void> }> = [];
  private isShuttingDown = false;

  register(name: string, closeFn: () => Promise<void>) {
    this.resources.push({ name, close: closeFn });
  }

  async shutdown(timeoutMs = 15000): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    const timeout = setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, timeoutMs);

    // Close in reverse order
    for (const resource of [...this.resources].reverse()) {
      try {
        await resource.close();
      } catch (error) {
        console.error(`Error closing ${resource.name}:`, error);
      }
    }

    clearTimeout(timeout);
    process.exit(0);
  }
}

// Usage in index.ts:
const coordinator = new ShutdownCoordinator();

coordinator.register('mcp-server', () => server.close());
coordinator.register('websocket-server', () => wss.close());
coordinator.register('context', () => context.close());

process.on('SIGINT', () => coordinator.shutdown());
process.on('SIGTERM', () => coordinator.shutdown());
```

### Pattern 3: Safe Error Suppression During Cleanup
**What:** Use `.catch(() => {})` for cleanup operations that may fail  
**When to use:** In test cleanup or shutdown where errors don't matter  
**Example:**
```typescript
// Source: From SDK test files (stateManagementStreamableHttp.test.ts)
afterEach(async () => {
  // Clean up resources - errors during cleanup are suppressed
  await mcpServer.close().catch(() => {});
  await serverTransport.close().catch(() => {});
  server.close();
});
```

### Anti-Patterns to Avoid
- **Recursive method override:** Never call `obj.method()` inside `obj.method = () => { ... }` without storing original
- **Aggressive process killing:** Using `kill -9` in `killProcessOnPort()` can leave resources in undefined state
- **No cleanup timeout:** Without a timeout, shutdown can hang indefinitely
- **Wrong close order:** Closing MCP server before WebSocket server leaves connections orphaned

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP protocol handling | Custom JSON-RPC implementation | `@modelcontextprotocol/sdk` Server class | Protocol negotiation, capability exchange, error handling are complex and security-sensitive |
| WebSocket lifecycle | Manual connection tracking | `ws` library with proper event handlers | Handles ping/pong, frame parsing, close codes; 8.18.1 is well-tested |
| Shutdown timeout | `setTimeout` + manual tracking | `Promise.race()` with timeout pattern | Cleaner, more testable, handles cleanup |
| Process signal handling | Multiple scattered `process.on()` calls | Centralized shutdown coordinator | Easier to reason about, prevents race conditions |

**Key insight:** The MCP SDK's `Protocol.close()` simply delegates to `this._transport?.close()` — but this is intentional. The transport owns the actual connection, and the Protocol layer is a framing layer on top. Don't add unnecessary complexity.

## Common Pitfalls

### Pitfall 1: Infinite Recursion on Close
**What goes wrong:** Server hangs or crashes with "Maximum call stack size exceeded" during shutdown  
**Why it happens:** `server.close = async () => { await server.close(); ... }` creates a recursive loop because `server.close` now refers to the new function  
**How to avoid:** Always store the original method reference with `.bind()` before overriding  
**Warning signs:** Server process doesn't exit, CPU spikes to 100%, stack overflow errors

### Pitfall 2: Orphaned WebSocket Connections
**What goes wrong:** Browser extension shows "connected" but server is dead; port remains in use  
**Why it happens:** WebSocket server closes before notifying clients, leaving browser in unknown state; OS keeps port bound  
**How to avoid:** Close client WebSockets first with close codes, then close server, use `wss.clients.forEach()` to notify all  
**Warning signs:** "Port already in use" errors on restart, browser extension thinks it's connected but commands fail

### Pitfall 3: Uncaught Async Errors During Shutdown
**What goes wrong:** Unhandled promise rejections crash process during cleanup  
**Why it happens:** Async close operations throw but aren't awaited or caught  
**How to avoid:** Always `await resource.close().catch(() => {})` during shutdown  
**Warning signs:** Crash with "UnhandledPromiseRejection" during exit

### Pitfall 4: Missing SIGTERM Handling
**What goes wrong:** Server doesn't shut down cleanly in Docker containers or process managers  
**Why it happens:** Only handling SIGINT, but Docker sends SIGTERM by default  
**How to avoid:** Listen for both `SIGINT` and `SIGTERM`  
**Warning signs:** Docker containers take 10s to stop (forced kill after timeout)

## Code Examples

### Safe Server Close Override
```typescript
// Source: Pattern verified from SDK source analysis
// File: src/server.ts - Fixed version

export async function createServerWithTools(options: Options): Promise<Server> {
  // ... existing setup code ...

  const wss = await createWebSocketServer();
  wss.on("connection", (websocket) => {
    if (context.hasWs()) {
      context.ws.close();
    }
    context.ws = websocket;
  });

  // ... request handlers ...

  // FIX: Store original close before overriding
  const originalClose = server.close.bind(server);
  server.close = async () => {
    await originalClose();  // Calls Protocol.close() → transport.close()
    await wss.close();       // Close WebSocket server
    await context.close();   // Close context/WebSocket connection
  };

  return server;
}
```

### Graceful WebSocket Server Shutdown
```typescript
// Source: Best practice from WebSocket graceful shutdown patterns
// File: src/ws.ts - Enhanced version

import { WebSocketServer, WebSocket } from "ws";

export async function createWebSocketServer(port: number): Promise<WebSocketServer> {
  // ... existing port cleanup and server creation ...
  
  const wss = new WebSocketServer({ port });
  
  // Enhance close behavior to notify clients
  const originalClose = wss.close.bind(wss);
  wss.close = (callback?: (err?: Error) => void) => {
    // Notify all connected clients
    wss.clients.forEach((ws: WebSocket) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1001, "Server shutting down"); // 1001 = Going Away
      }
    });
    
    // Then close the server
    return originalClose(callback);
  };
  
  return wss;
}
```

### Enhanced Process Cleanup (Replacing Aggressive Kill)
```typescript
// Source: Pattern from SDK examples and graceful shutdown best practices
// File: src/utils/port.ts - Improved version

export function killProcessOnPort(port: number): void {
  try {
    if (process.platform === "win32") {
      // Use taskkill /T to kill process tree, /F only if necessary
      execSync(
        `FOR /F "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /PID %a /T`,
        { stdio: 'pipe' }  // Suppress output
      );
    } else {
      // Use SIGTERM (-15) first, not SIGKILL (-9)
      // Give processes time to clean up
      execSync(`lsof -ti:${port} | xargs kill -15 2>/dev/null || true`);
      
      // Wait briefly and check if port is free
      setTimeout(() => {
        try {
          execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`);
        } catch {
          // Process already terminated or no process found
        }
      }, 1000);
    }
  } catch (error) {
    // No process found on port - this is expected
  }
}
```

### MCP SDK 1.26 Compatibility Check
```typescript
// Source: Pattern for validating SDK upgrade compatibility
// Test: Verify existing tools/resources still work after upgrade

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// After upgrading to 1.26.x, verify:
// 1. Tool listing still works
// 2. Tool calling still works  
// 3. Resource listing still works (if resources implemented)
// 4. StdioServerTransport still works
// 5. Request handlers still receive expected arguments

// No API changes expected between 1.8.0 and 1.26.x in v1 line
// Primary changes: security fixes, OAuth improvements, elicitation support
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SDK v1.8.0 | SDK v1.26.0 | Feb 2026 | Security fix for cross-client data leaking; OAuth scope improvements |
| `kill -9` immediate | SIGTERM + graceful fallback | Best practice 2025 | Allows process cleanup, prevents corrupted state |
| Single signal handler (SIGINT) | Dual handler (SIGINT + SIGTERM) | Docker best practice | Proper container lifecycle support |
| Synchronous close | Async close with timeout | Reliability pattern | Prevents hanging shutdowns |
| Manual cleanup per resource | Centralized shutdown coordinator | Maintainability pattern | Easier to verify, less error-prone |

**Deprecated/outdated:**
- SDK v1.8.0: Missing security fixes, behind 18 versions
- `kill -9` as first resort: Prevents graceful cleanup, can corrupt browser extension state
- Only handling SIGINT: Doesn't work properly in Docker/container environments

## Open Questions

1. **Browser Extension State Synchronization**
   - What we know: Browser extension keeps WebSocket connection state
   - What's unclear: Does extension detect server disconnect and update UI accordingly?
   - Recommendation: Test that extension shows "disconnected" state when server closes WebSocket

2. **Build System Dependencies**
   - What we know: Current code has monorepo dependencies on `@repo/*` and `@r2r/*`
   - What's unclear: Will SDK 1.26 require peer dependency updates?
   - Recommendation: Verify `zod` peer dependency compatibility (SDK uses zod/v4 internally but supports v3.25+)

3. **Windows Process Cleanup**
   - What we know: Windows uses `taskkill` with `/F` (force) flag
   - What's unclear: Will removing `/F` cause hanging processes on Windows?
   - Recommendation: Test Windows shutdown behavior with graceful kill first

## Sources

### Primary (HIGH confidence)
- `/modelcontextprotocol/typescript-sdk` (Context7) - Server class lifecycle, Protocol.close() implementation
- `https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v1.26.0` - v1.26.0 release notes, security advisory GHSA-345p-7cg4-v4c7
- `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/src/shared/protocol.ts` - Protocol.close() source: `await this._transport?.close()`
- `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/src/server/index.ts` - Server class extends Protocol

### Secondary (MEDIUM confidence)
- `https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/migration.md` - v1 to v2 migration (confirms v1 is production, v2 is pre-alpha)
- `https://modelcontextprotocol.io/specification/2025-03-26/basic/lifecycle` - MCP lifecycle specification
- `https://oneuptime.com/blog/post/2026-02-02-websocket-graceful-shutdown/view` - WebSocket graceful shutdown patterns (Feb 2026)
- GitHub SDK test files - `afterEach` cleanup patterns using `.catch(() => {})`

### Tertiary (LOW confidence)
- `https://coreui.io/answers/how-to-handle-process-signals-in-nodejs/` - General Node.js signal handling (Dec 2025)
- `https://pm2.io/docs/runtime/best-practices/graceful-shutdown` - PM2 graceful shutdown patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official SDK releases, security advisories verified
- Architecture: HIGH - Direct source code analysis of SDK
- Pitfalls: HIGH - Recursive close bug is clearly identified and fix is straightforward
- SDK upgrade path: MEDIUM-HIGH - No breaking changes expected but need validation

**Research date:** 2026-02-09  
**Valid until:** 2026-04-09 (60 days for stable SDK, though v1.26 is fresh)

**Next actions for planner:**
1. Task: Upgrade SDK to 1.26.0 in package.json
2. Task: Fix recursive close bug in server.ts using bind pattern
3. Task: Implement shutdown coordinator in index.ts
4. Task: Replace aggressive killProcessOnPort with graceful SIGTERM approach
5. Task: Add SIGTERM handler alongside existing SIGINT
6. Task: Verify tool/resource flows work after SDK upgrade
