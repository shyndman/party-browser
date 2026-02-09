# Architecture Patterns: Browser MCP Core

**Project:** Browser MCP Core  
**Domain:** Local MCP server + browser extension bridge for browser automation  
**Researched:** 2025-02-09  
**Overall Confidence:** HIGH (based on MCP SDK docs, WebSocket patterns, and TypeScript best practices)

---

## Executive Summary

The Browser MCP Core sits at a critical intersection: it's a local MCP server using stdio transport to communicate with AI clients, while maintaining WebSocket connections to browser extension tabs. This dual-transport architecture creates unique lifecycle challenges—particularly the **shutdown recursion bug risk** identified in the current codebase where `server.close()` calls itself.

Key architectural insight: This is fundamentally a **connection broker** pattern. The MCP server brokers between AI client requests (via stdio) and browser tab capabilities (via WebSocket). Success depends on clear failure boundaries between these two domains and a testable design that allows mocking the browser connection.

---

## Current Architecture Analysis

### Existing Layered Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Entry (index.ts)                                           │
│  - CLI setup, stdio transport, exit watchdog                │
├─────────────────────────────────────────────────────────────┤
│  Server (server.ts)                                         │
│  - MCP Server instance, request handlers                    │
│  - WebSocket server creation                                │
│  - ⚠️ BUG: Recursive close() override (line 85-89)          │
├─────────────────────────────────────────────────────────────┤
│  Context (context.ts)                                       │
│  - WebSocket state management                               │
│  - Message sending abstraction                              │
│  - Single-connection model (closes existing on new)         │
├─────────────────────────────────────────────────────────────┤
│  Tools (tools/*.ts)                                         │
│  - Tool definitions with schema + handler                   │
│  - Context injection for browser communication              │
├─────────────────────────────────────────────────────────────┤
│  Utils (utils/*.ts)                                         │
│  - Port management, logging, aria snapshots                 │
└─────────────────────────────────────────────────────────────┘
```

### Critical Issues Identified

#### 1. Shutdown Recursion Bug (HIGH SEVERITY)

**Location:** `src/server.ts:85-89`

```typescript
server.close = async () => {
  await server.close();  // ← Infinite recursion!
  await wss.close();
  await context.close();
};
```

**Why this happens:** The code overrides `server.close` but calls the same method recursively. This will cause a stack overflow on shutdown.

**Fix pattern:** Store original close, call it last:

```typescript
const originalClose = server.close.bind(server);
server.close = async () => {
  await context.close();
  await wss.close();
  await originalClose();
};
```

#### 2. Single-Connection Fragility

**Location:** `src/server.ts:36-40`

The current implementation forcefully closes existing WebSocket connections when new ones arrive. This "last-one-wins" approach is acceptable for single-tab local use but creates race conditions:

- Tool execution in progress when connection swaps
- No graceful handoff or queue draining
- Extension state becomes orphaned

#### 3. No Test Harness

The architecture lacks dependency injection points. The `Context` class directly instantiates WebSocket dependencies, making unit testing impossible without network calls.

---

## Recommended Architecture

### Pattern: Layered Broker with Clear Failure Domains

```
┌─────────────────────────────────────────────────────────────────┐
│                        ENTRY LAYER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ CLI Parser   │  │ Transport    │  │ Lifecycle Manager    │   │
│  │ (commander)  │  │ (stdio)      │  │ (shutdown sequence)  │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       MCP SERVER LAYER                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  MCP Server (@modelcontextprotocol/sdk)                  │   │
│  │  - Capability negotiation                                │   │
│  │  - Request routing                                       │   │
│  │  - Protocol compliance                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                      BRIDGE/ADAPTER LAYER                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Tool Router  │  │ Connection   │  │ Message Serializer   │   │
│  │              │  │ Manager      │  │                      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CONNECTION LAYER                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          Connection Manager (WebSocket)                  │   │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────┐   │   │
│  │  │ Connection │  │ Connection │  │ Connection       │   │   │
│  │  │ Pool       │  │ State      │  │ Health Monitor   │   │   │
│  │  └────────────┘  └────────────┘  └──────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXTENSION LAYER                             │
│                    (Browser Extension)                           │
└─────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

#### 1. Entry Layer

**Responsibility:** Process lifecycle, signal handling, transport setup

**Key Pattern:** Lifecycle Manager with ordered shutdown

```typescript
class LifecycleManager {
  private disposables: Array<() => Promise<void>> = [];
  private isShuttingDown = false;

  register(name: string, dispose: () => Promise<void>) {
    this.disposables.push(dispose);
  }

  async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.error(`Shutting down: ${signal}`);

    // Reverse order: last registered = first cleaned up
    for (const dispose of [...this.disposables].reverse()) {
      try {
        await dispose();
      } catch (e) {
        console.error('Shutdown error:', e);
      }
    }

    process.exit(0);
  }
}
```

**Why:** Prevents recursion, ensures deterministic cleanup order, handles concurrent shutdown signals.

#### 2. MCP Server Layer

**Responsibility:** Protocol compliance, capability advertisement, request dispatch

**Key Pattern:** Thin wrapper around SDK, delegates to Bridge Layer

```typescript
// server.ts - Keep minimal, delegate to bridge
export async function createServer(bridge: Bridge): Promise<Server> {
  const server = new Server(
    { name, version },
    { capabilities: { tools: {}, resources: {} } }
  );

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Delegate to bridge - no business logic here
    return bridge.handleToolCall(request);
  });

  return server;
}
```

**Why:** Separation of concerns—protocol handling vs. business logic. Makes testing easier (mock the bridge).

#### 3. Bridge/Adapter Layer

**Responsibility:** Translate between MCP protocol and browser extension messages

**Key Pattern:** Adapter with connection state awareness

```typescript
interface Bridge {
  handleToolCall(request: CallToolRequest): Promise<ToolResult>;
  getConnectionState(): ConnectionState;
}

class BrowserBridge implements Bridge {
  constructor(
    private connectionManager: ConnectionManager,
    private toolRegistry: ToolRegistry
  ) {}

  async handleToolCall(request: CallToolRequest): Promise<ToolResult> {
    const connection = this.connectionManager.getActiveConnection();
    if (!connection) {
      return {
        content: [{ type: 'text', text: 'No browser tab connected' }],
        isError: true
      };
    }

    const tool = this.toolRegistry.get(request.params.name);
    return tool.execute(connection, request.params.arguments);
  }
}
```

**Why:** Clear boundary between "what the AI wants" and "what the browser can do." Allows mocking for tests.

#### 4. Connection Layer

**Responsibility:** WebSocket lifecycle, connection pooling, health monitoring

**Key Pattern:** Connection Manager with state machine

```typescript
type ConnectionState = 
  | 'connecting' 
  | 'connected' 
  | 'disconnecting' 
  | 'disconnected';

interface ManagedConnection {
  id: string;
  ws: WebSocket;
  state: ConnectionState;
  connectedAt: Date;
  lastActivity: Date;
}

class ConnectionManager {
  private connections = new Map<string, ManagedConnection>();
  private activeConnectionId: string | null = null;

  // For single-tab mode: new connection replaces old
  // For multi-tab mode: connections coexist, routing by tab ID
  async handleNewConnection(ws: WebSocket): Promise<string> {
    const id = generateId();

    // Single-tab: clean up existing
    if (this.activeConnectionId) {
      await this.disconnect(this.activeConnectionId);
    }

    this.connections.set(id, {
      id,
      ws,
      state: 'connecting',
      connectedAt: new Date(),
      lastActivity: new Date()
    });

    this.activeConnectionId = id;
    this.setupConnectionHandlers(id, ws);

    return id;
  }

  async sendMessage<T>(
    connectionId: string, 
    type: string, 
    payload: unknown,
    options?: { timeoutMs?: number }
  ): Promise<T> {
    const conn = this.connections.get(connectionId);
    if (!conn || conn.state !== 'connected') {
      throw new ConnectionError('Not connected');
    }

    // Use injected message sender for testability
    return this.messageSender.send(conn.ws, type, payload, options);
  }
}
```

**Why:** Isolates WebSocket complexity. Supports both single-tab (current) and multi-tab (future) modes. Testable via message sender injection.

---

## Data Flow and Failure Boundaries

### Normal Operation Flow

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌────────────┐
│  AI      │────▶│  MCP Server  │────▶│   Bridge     │────▶│ Connection │
│  Client  │     │  (stdio)     │     │  (translate) │     │  Manager   │
└──────────┘     └──────────────┘     └──────────────┘     └─────┬──────┘
                                                                  │
                                                                  ▼
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌────────────┐
│  AI      │◀────│  MCP Server  │◀────│   Bridge     │◀────│ Connection │
│  Client  │     │  (stdio)     │     │  (translate) │     │  Manager   │
└──────────┘     └──────────────┘     └──────────────┘     └────────────┘
```

### Failure Scenarios and Boundaries

#### Scenario 1: Browser Extension Disconnected Mid-Request

**Failure boundary:** Bridge Layer

```typescript
async handleToolCall(request): Promise<ToolResult> {
  try {
    const result = await this.connectionManager.sendMessage(...);
    return { content: [{ type: 'text', text: result }] };
  } catch (e) {
    // Boundary: Convert connection errors to MCP errors
    if (e instanceof ConnectionError) {
      return {
        content: [{ 
          type: 'text', 
          text: 'Browser disconnected. Please reconnect via the extension.' 
        }],
        isError: true
      };
    }
    throw e; // Let MCP Server handle unexpected errors
  }
}
```

**Why:** AI client gets actionable error, not a crash.

#### Scenario 2: WebSocket Server Crashes

**Failure boundary:** Connection Layer with graceful degradation

```typescript
class ConnectionManager {
  private reconnectAttempts = 0;
  private readonly maxReconnects = 3;

  async startServer(): Promise<void> {
    try {
      this.wss = new WebSocketServer({ port: this.port });
      this.setupWssHandlers();
      this.reconnectAttempts = 0;
    } catch (e) {
      if (this.reconnectAttempts < this.maxReconnects) {
        this.reconnectAttempts++;
        await delay(1000 * this.reconnectAttempts);
        return this.startServer();
      }
      throw e;
    }
  }
}
```

**Why:** Retry transient failures, escalate persistent ones.

#### Scenario 3: MCP Server Shutdown

**Failure boundary:** Lifecycle Manager with ordered cleanup

```typescript
// Shutdown order (reverse of startup):
// 1. Stop accepting new MCP requests
// 2. Wait for in-flight requests to complete (with timeout)
// 3. Close WebSocket connections
// 4. Close WebSocket server
// 5. Close MCP server transport
// 6. Exit process

async shutdown(): Promise<void> {
  // Signal: no new requests
  this.state = 'shutting_down';

  // Wait for in-flight with timeout
  await Promise.race([
    this.waitForInflight(),
    delay(5000) // 5s timeout
  ]);

  // Close connections (graceful)
  await this.connectionManager.closeAll();

  // Close servers
  await this.wss.close();
  await this.mcpServer.close();
}
```

**Why:** No orphaned connections, no lost state, no recursion.

---

## Patterns to Follow

### Pattern 1: Dependency Injection for Testability

**Current:**
```typescript
// Hard to test - requires actual WebSocket
class Context {
  async sendSocketMessage(...) {
    const { sendSocketMessage } = createSocketMessageSender(this.ws);
    return sendSocketMessage(...);
  }
}
```

**Improved:**
```typescript
interface MessageSender {
  send<T>(type: string, payload: unknown, options?: { timeoutMs?: number }): Promise<T>;
}

class Context {
  constructor(
    private connectionManager: ConnectionManager,
    private messageSenderFactory: (ws: WebSocket) => MessageSender
  ) {}

  async sendMessage<T>(...): Promise<T> {
    const connection = this.connectionManager.getActiveConnection();
    const sender = this.messageSenderFactory(connection.ws);
    return sender.send(...);
  }
}

// Test with mock
const mockSender: MessageSender = {
  send: jest.fn().mockResolvedValue({ result: 'mocked' })
};
const context = new Context(mockConnectionManager, () => mockSender);
```

**Why:** Test without network, mock responses, verify behavior.

### Pattern 2: State Machine for Connection Lifecycle

```typescript
type ConnectionState = 
  | { type: 'idle' }
  | { type: 'connecting'; since: Date }
  | { type: 'connected'; ws: WebSocket; since: Date }
  | { type: 'disconnecting'; reason: string }
  | { type: 'disconnected'; error?: Error };

class Connection {
  private state: ConnectionState = { type: 'idle' };

  transition(newState: ConnectionState): void {
    const validTransitions: Record<string, string[]> = {
      'idle': ['connecting'],
      'connecting': ['connected', 'disconnected'],
      'connected': ['disconnecting', 'disconnected'],
      'disconnecting': ['disconnected'],
      'disconnected': ['connecting']
    };

    const allowed = validTransitions[this.state.type];
    if (!allowed.includes(newState.type)) {
      throw new Error(
        `Invalid transition: ${this.state.type} → ${newState.type}`
      );
    }

    this.state = newState;
  }
}
```

**Why:** Prevents invalid state transitions, makes behavior predictable.

### Pattern 3: Circuit Breaker for External Calls

```typescript
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private readonly threshold = 5;
  private readonly timeout = 30000;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      throw new Error('Circuit breaker is open');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }

  private onFailure(): void {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'open';
      setTimeout(() => this.state = 'half-open', this.timeout);
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }
}
```

**Why:** Prevents cascading failures when browser extension becomes unresponsive.

### Pattern 4: Structured Logging with Context

```typescript
import { createLogger, format } from '@repo/utils';

const logger = createLogger({
  service: 'browser-mcp',
  format: format.json()
});

class ToolExecutor {
  async execute(toolName: string, args: unknown, context: RequestContext) {
    const log = logger.child({
      tool: toolName,
      requestId: context.requestId,
      connectionId: context.connectionId
    });

    log.info('Tool execution started', { args });

    try {
      const result = await this.doExecute(toolName, args);
      log.info('Tool execution completed', { duration: context.elapsed });
      return result;
    } catch (e) {
      log.error('Tool execution failed', { error: e.message, stack: e.stack });
      throw e;
    }
  }
}
```

**Why:** Trace requests across components, debug production issues.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Recursive Close Override

**Don't:**
```typescript
server.close = async () => {
  await server.close(); // Stack overflow!
  await cleanup();
};
```

**Do:**
```typescript
const originalClose = server.close.bind(server);
server.close = async () => {
  await cleanup();
  await originalClose();
};
```

### Anti-Pattern 2: Direct WebSocket Access in Tools

**Don't:**
```typescript
export const navigate: Tool = {
  handle: async (context, params) => {
    context.ws.send(...); // Direct access, hard to test
  }
};
```

**Do:**
```typescript
export const navigate: Tool = {
  handle: async (bridge, params) => {
    await bridge.sendBrowserCommand('navigate', params);
  }
};
```

### Anti-Pattern 3: Silent Connection Replacement

**Don't:**
```typescript
wss.on('connection', (ws) => {
  if (context.hasWs()) {
    context.ws.close(); // Silent, might interrupt operation
  }
  context.ws = ws;
});
```

**Do:**
```typescript
wss.on('connection', async (ws) => {
  if (connectionManager.hasActiveConnection()) {
    logger.warn('New connection replacing active connection');
    await connectionManager.gracefullyReplaceConnection(ws);
  } else {
    await connectionManager.acceptConnection(ws);
  }
});
```

### Anti-Pattern 4: Monolithic Context Class

**Don't:**
```typescript
class Context {
  ws: WebSocket;
  async sendSocketMessage(...) { ... }
  async captureSnapshot() { ... }
  async getConsoleLogs() { ... }
  // Everything in one class
}
```

**Do:**
```typescript
class Context {
  constructor(
    private connectionManager: ConnectionManager,
    private snapshotService: SnapshotService,
    private consoleService: ConsoleService
  ) {}
  // Delegate to specialized services
}
```

---

## Suggested Build Order and Dependencies

### Phase 1: Foundation (Critical Path)

**Goal:** Fix shutdown bug, establish test harness

1. **Lifecycle Manager** (1-2 days)
   - Ordered shutdown sequence
   - Signal handling
   - No dependencies

2. **Test Infrastructure** (2-3 days)
   - Dependency injection container
   - Mock message sender
   - Basic unit test harness
   - Depends on: Lifecycle Manager (for integration tests)

3. **Fix Shutdown Recursion** (1 day)
   - Apply fix to server.ts
   - Add regression test
   - Depends on: Test Infrastructure

**Parallel safe:** Yes, each can be worked independently after Lifecycle Manager

### Phase 2: Connection Reliability

**Goal:** Eliminate single-connection fragility

4. **Connection Manager** (3-4 days)
   - State machine implementation
   - Connection pooling (prep for multi-tab)
   - Health monitoring
   - Depends on: Lifecycle Manager, Test Infrastructure

5. **Bridge Layer** (2-3 days)
   - Abstract browser communication
   - Error translation
   - Depends on: Connection Manager

6. **Refactor Server.ts** (1-2 days)
   - Thin wrapper using Bridge
   - Remove business logic
   - Depends on: Bridge Layer

**Parallel safe:** Connection Manager and Bridge can be developed in parallel with clear interface contract

### Phase 3: Robustness

**Goal:** Production-ready error handling

7. **Circuit Breaker** (1-2 days)
   - Failure detection
   - Recovery logic
   - Depends on: Connection Manager

8. **Structured Logging** (1-2 days)
   - Request tracing
   - Context propagation
   - Can be done in parallel with Circuit Breaker

9. **Multi-Tab Support** (3-5 days)
   - Tab identification
   - Connection routing
   - Depends on: Connection Manager

**Parallel safe:** Circuit Breaker and Logging are independent

### Dependency Graph

```
┌─────────────────┐
│ Lifecycle       │
│ Manager         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Test            │     │ Connection      │
│ Infrastructure  │◀────│ Manager         │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │              ┌────────┴────────┐
         │              │                 │
         │              ▼                 ▼
         │       ┌─────────────┐  ┌─────────────┐
         │       │ Circuit     │  │ Multi-Tab   │
         │       │ Breaker     │  │ Support     │
         │       └─────────────┘  └─────────────┘
         │
         ▼
┌─────────────────┐
│ Bridge Layer    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Refactor        │
│ Server.ts       │
└─────────────────┘
```

---

## Scalability Considerations

### At Current Scale (Single User, Single Tab)

Current architecture is sufficient with bug fixes. Focus on:
- Shutdown reliability
- Basic error handling
- Test coverage

### At 10x Scale (Multiple Tabs, Concurrent Operations)

Need:
- Connection Manager with proper pooling
- Request queueing per tab
- Resource limits (max concurrent operations)

### At 100x Scale (Multiple Users, Cloud Deployment)

Architecture shift required:
- Separate transport layer (HTTP instead of stdio)
- Session management
- Horizontal scaling with load balancer
- Database for session persistence

**Note:** This conflicts with "local-first" constraint. For local-only deployment, 10x scale is the practical limit.

---

## MCP-Specific Considerations

### Transport Choice: stdio (Correct for Local)

The current stdio transport is appropriate for local MCP servers:
- AI client spawns server as subprocess
- stdin/stdout for JSON-RPC messages
- Automatic cleanup on client exit

**Alternative (HTTP/SSE):** Only needed for remote deployments where client and server are separate processes on different machines.

### Capability Negotiation

Current implementation advertises tools statically. Future enhancement:

```typescript
// Dynamic capability discovery based on browser state
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const baseTools = [...snapshotTools, ...commonTools];

  // Add browser-specific tools only if connected
  if (connectionManager.hasActiveConnection()) {
    const capabilities = await connectionManager.getBrowserCapabilities();
    if (capabilities.supportsConsole) {
      baseTools.push(custom.getConsoleLogs);
    }
  }

  return { tools: baseTools.map(t => t.schema) };
});
```

### Error Code Mapping

MCP SDK v1.8+ uses structured error codes:

```typescript
import { ProtocolError, ProtocolErrorCode } from '@modelcontextprotocol/sdk';

// Map internal errors to protocol errors
function mapError(error: Error): ProtocolError {
  if (error instanceof ConnectionError) {
    return new ProtocolError(
      ProtocolErrorCode.InternalError,
      'Browser not connected'
    );
  }
  if (error instanceof ValidationError) {
    return new ProtocolError(
      ProtocolErrorCode.InvalidParams,
      error.message
    );
  }
  return new ProtocolError(
    ProtocolErrorCode.InternalError,
    'Internal server error'
  );
}
```

---

## Sources

### Primary Sources (HIGH Confidence)

1. **MCP TypeScript SDK Documentation** (Context7)
   - `/modelcontextprotocol/typescript-sdk`
   - Error handling patterns, transport architecture
   - Version: 1.8.0+

2. **MCP Best Practices Guide** (Official)
   - https://modelcontextprotocol.info/docs/best-practices/
   - Architectural principles, production operations
   - Accessed: 2025-02-09

3. **WebSocket Graceful Shutdown** (OneUptime)
   - https://oneuptime.com/blog/post/2026-02-02-websocket-graceful-shutdown/view
   - Connection lifecycle management patterns
   - Published: 2026-02-02

### Secondary Sources (MEDIUM Confidence)

4. **WebSocket Reconnection Logic** (OneUptime)
   - https://oneuptime.com/blog/post/2026-01-27-websocket-reconnection-logic/view
   - Exponential backoff, state management
   - Published: 2026-01-27

5. **Browser Automation Best Practices** (Nadim Tuhin)
   - https://nadimtuhin.com/blog/browser-automation-best-practices
   - Connection management, cleanup patterns
   - Published: 2025-12-03

6. **TypeScript Dependency Injection Patterns** (Snow Lynx)
   - https://www.snowlynxsoftware.net/blog/modern-typescript-patterns.html
   - DI patterns for testability
   - Published: 2025-03-15

### Code Analysis (HIGH Confidence)

7. **Current codebase analysis**
   - `src/server.ts` - Recursive close bug identified at line 85-89
   - `src/context.ts` - Single-connection fragility
   - `src/index.ts` - Basic exit watchdog

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Shutdown patterns | HIGH | MCP SDK docs + WebSocket best practices well-established |
| Component boundaries | HIGH | Standard layered architecture pattern |
| Connection management | HIGH | WebSocket patterns documented extensively |
| Testability patterns | MEDIUM-HIGH | TypeScript DI well-understood, specific MCP patterns emerging |
| MCP protocol specifics | HIGH | SDK documentation comprehensive |
| Multi-tab scaling | MEDIUM | Theoretical—no MCP browser automation precedents found |

---

## Research Flags for Roadmap

| Phase | Flag | Reason |
|-------|------|--------|
| Connection Manager | YELLOW | Multi-tab connection routing needs validation with extension architecture |
| Bridge Layer | YELLOW | Message protocol with extension not documented, interface assumptions may change |
| Circuit Breaker | GREEN | Standard pattern, well-understood implementation |
| Multi-Tab Support | RED | Needs deeper research on extension capabilities and tab identification |
| HTTP Transport | RED | Out of scope for local-first constraint, but may be needed for some use cases |

---

## Recommendations Summary

1. **Immediate:** Fix shutdown recursion bug using stored reference pattern
2. **Phase 1:** Implement Lifecycle Manager and test infrastructure
3. **Phase 2:** Extract Connection Manager with state machine
4. **Phase 3:** Add Bridge Layer for clean protocol translation
5. **Future:** Consider multi-tab support only after validating extension architecture

The recommended architecture preserves the local-first model while adding the reliability and testability needed for production use.
