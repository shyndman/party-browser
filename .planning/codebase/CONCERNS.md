# Codebase Concerns

**Analysis Date:** 2025-02-09

## Critical Issues

### Infinite Recursion in Server Close
- **Issue:** `server.ts` line 85-89 has a critical bug where `server.close` calls itself recursively
- **Files:** `src/server.ts`
- **Impact:** Application will crash with stack overflow when attempting to shut down
- **Fix approach:** Rename the original close method before overriding, or use a different reference to the original close function

```typescript
// Current problematic code (lines 85-89):
server.close = async () => {
  await server.close();  // Infinite recursion!
  await wss.close();
  await context.close();
};
```

## Tech Debt

### Zero Test Coverage
- **Issue:** No unit tests, integration tests, or E2E tests exist for this MCP server
- **Files:** Entire `src/` directory
- **Impact:** Changes to tools, error handling, or server logic have no safety net; regressions likely
- **Fix approach:** 
  - Add Jest or Vitest test framework
  - Unit test each tool's handler logic with mocked context
  - Integration tests for WebSocket communication
  - Test coverage target: 80%+

### Missing Linting and Formatting Configuration
- **Issue:** No ESLint, Prettier, or biome configuration files present
- **Files:** Root directory (config files missing)
- **Impact:** Code style inconsistent; potential bugs not caught (unused variables, type issues)
- **Fix approach:** 
  - Add `eslint.config.js` with TypeScript support
  - Add `.prettierrc` for consistent formatting
  - Add pre-commit hooks with husky

### Standalone Build Impossibility
- **Issue:** Package depends on workspace packages that are not published: `@r2r/messaging`, `@repo/config`, `@repo/messaging`, `@repo/types`, `@repo/utils`
- **Files:** `package.json` (lines 29-34)
- **Impact:** Repository cannot be built outside the monorepo; contributors cannot run the code
- **Fix approach:** 
  - Either publish these packages to npm
  - Or inline the required types and utilities into this repo
  - Document the monorepo dependency clearly

## Security Considerations

### Aggressive Process Termination
- **Risk:** `killProcessOnPort()` in `src/utils/port.ts` kills any process on the WebSocket port without verification
- **Files:** `src/utils/port.ts` (lines 15-27)
- **Current mitigation:** Only kills on the configured port (default 4444)
- **Recommendations:** 
  - Check process name/command before killing (e.g., verify it's a browser extension process)
  - Add confirmation prompt or flag to skip killing
  - Use graceful shutdown (SIGTERM before SIGKILL)
  - Log what process was killed for debugging

### No Input Sanitization on WebSocket Messages
- **Risk:** User-provided URLs and element selectors are passed directly to browser extension without sanitization
- **Files:** `src/tools/common.ts`, `src/tools/snapshot.ts`
- **Impact:** Potential for injection attacks if browser extension doesn't properly validate
- **Recommendations:** 
  - Add URL validation before sending to extension
  - Sanitize element selectors to prevent XPath/CSS injection

### Console Error to stderr
- **Risk:** `debugLog` uses `console.error` which writes to stderr, potentially interfering with MCP stdio transport
- **Files:** `src/utils/log.ts`
- **Impact:** If log output gets mixed with MCP protocol messages, communication breaks
- **Recommendations:** 
  - Use a proper logging library that writes to file instead of stdio
  - Or ensure all logs go through MCP's logging mechanism

## Performance Bottlenecks

### Synchronous Process Killing Blocks Event Loop
- **Problem:** `execSync` is used to kill processes, blocking the event loop
- **Files:** `src/utils/port.ts` (lines 18, 22)
- **Cause:** `execSync` runs synchronously, freezing the server during process termination
- **Improvement path:** Use `exec` or `spawn` with promises instead of `execSync`

### No Connection Pooling for WebSocket
- **Problem:** Only one WebSocket connection is supported at a time; new connections close existing ones
- **Files:** `src/server.ts` (lines 35-41)
- **Impact:** Cannot automate multiple browser tabs simultaneously
- **Improvement path:** Implement connection pool or session management

## Fragile Areas

### Platform-Specific Shell Commands
- **Files:** `src/utils/port.ts` (lines 17-23)
- **Why fragile:** Uses Windows batch (`FOR /F`) and Unix (`lsof`, `xargs`) commands that may not exist on all systems
- **Safe modification:** Add feature detection and fallback strategies
- **Test coverage:** No cross-platform tests exist

### Error Message String Matching
- **Files:** `src/context.ts` (lines 39-42)
- **Why fragile:** Relies on exact string matching for error translation (`e.message === mcpConfig.errors.noConnectedTab`)
- **Risk:** Error message changes in dependencies break error handling
- **Test coverage:** No tests for error scenarios

### No WebSocket Reconnection Logic
- **Files:** `src/context.ts`, `src/server.ts`
- **Why fragile:** If browser extension disconnects, the context throws errors but doesn't attempt reconnection
- **User impact:** Must restart MCP server to reconnect after browser extension reload
- **Fix approach:** Add reconnection retry logic with exponential backoff

### Empty Resources Array
- **Files:** `src/index.ts` (line 42)
- **Why fragile:** Resources capability is declared but empty - MCP clients may expect resources to be available
- **Fix approach:** Either implement resources or remove the capability from server initialization

## Missing Critical Features

### No Request Timeout Handling
- **Problem:** Individual tool requests have no timeout; long-running browser operations could hang indefinitely
- **Blocks:** Reliable operation with slow websites or network issues

### No Request Validation
- **Problem:** Beyond Zod schema validation, there's no validation of request parameters (e.g., URL format, reasonable wait times)
- **Impact:** Invalid URLs or extreme wait times accepted without error

### No Health Check Endpoint
- **Problem:** No way to verify WebSocket connection status or browser extension availability without attempting an operation

## Dependencies at Risk

### `ws` Library Version
- **Risk:** Using `ws@^8.18.1` - while stable, WebSocket libraries can have security vulnerabilities
- **Impact:** Security issues in WebSocket handling
- **Migration plan:** Keep `ws` updated; consider pinning to specific versions in production

### MCP SDK Version
- **Risk:** Using `@modelcontextprotocol/sdk@^1.8.0` - early stage protocol, API may change
- **Impact:** Breaking changes in SDK updates
- **Migration plan:** Review changelog carefully before updating; add integration tests

## Error Handling Issues

### Generic Error Responses
- **Issue:** All tool errors return generic string messages without error codes or structured data
- **Files:** `src/server.ts` (lines 66-70)
- **Impact:** Clients cannot programmatically handle different error types
- **Fix approach:** Return structured error objects with error codes

### Silent Failures in Port Killing
- **Issue:** `killProcessOnPort` logs errors but doesn't throw or return status
- **Files:** `src/utils/port.ts` (lines 24-26)
- **Impact:** Server may continue even if port cleanup failed, causing "port in use" errors later

---

*Concerns audit: 2025-02-09*
