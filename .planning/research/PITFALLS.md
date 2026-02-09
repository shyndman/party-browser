# Domain Pitfalls: Browser MCP Core

**Domain:** Browser MCP Server with Extension Bridge
**Researched:** February 2026
**Confidence:** HIGH (based on production MCP issues, Chromium bug reports, and monorepo migration case studies)

## Critical Pitfalls

Mistakes that cause rewrites or production outages.

### Pitfall 1: Zombie Native Host Processes Without Socket

**What goes wrong:**
The Chrome native host process enters a "zombie" state where the process is running but never created its Unix socket (`/tmp/claude-mcp-browser-bridge-{user}`). All browser automation fails with "Browser extension is not connected" even though the process is visible in `ps aux`. The process started but never initialized its socket listener.

**Why it happens:**
- Race condition between process startup and socket creation
- Extension doesn't verify socket existence before reporting "ready"
- No health check between extension and native host
- Long-running processes accumulate state that prevents clean re-initialization
- Chrome/Chromium bug where native host processes aren't killed properly (Issue 365046214)

**Consequences:**
- All browser automation tools fail silently
- Users must manually kill processes and restart extension
- Blocks critical user workflows without clear error messages
- Requires manual intervention to recover

**Prevention:**
1. Implement socket existence verification in extension before reporting ready state
2. Add heartbeat/health check between extension and native host
3. If socket doesn't exist but process is running, respawn automatically
4. Implement process cleanup on extension unload/service worker termination
5. Add socket creation timeout with automatic retry logic

**Warning Signs:**
- "Browser extension is not connected" errors despite extension being installed
- Process visible in `ps aux | grep chrome-native-host` but socket missing
- Issues reported as Linux-specific but can occur on all platforms

**Suggested Phase:**
**Phase 1: Lifecycle Hardening** - This is the foundation. Without reliable lifecycle management, nothing else works.

---

### Pitfall 2: Orphaned MCP Server Processes on Client Disconnect

**What goes wrong:**
When MCP clients disconnect (Claude Code closes, crashes, or user kills terminal), the stdio-based MCP server processes are left running as orphans. Over time these accumulate, causing resource exhaustion, database locks (SQLite), and memory leaks.

**Why it happens:**
- Stdio transport lacks explicit connection-close signaling
- Node.js process not attached to parent process lifecycle
- No SIGTERM/SIGINT handling on parent disconnect
- Servers assume they should keep running for reconnect attempts

**Consequences:**
- Growing memory usage over days/weeks of use
- SQLite database locks from multiple processes accessing same DB
- Port/socket conflicts on restart
- System resource exhaustion requiring manual cleanup

**Prevention:**
1. Implement parent process heartbeat detection
2. Add `process.on('disconnect')` handler for stdio transport cleanup
3. Set up periodic health checks that exit if parent is gone
4. Use process groups to ensure cascade termination
5. Implement process monitoring/self-termination after idle timeout

**Warning Signs:**
- Multiple `node` processes with same MCP server name in `ps aux`
- SQLite "database is locked" errors
- Memory usage growing linearly with usage sessions
- Port already in use errors on restart

**Suggested Phase:**
**Phase 1: Lifecycle Hardening** - Process cleanup is core to reliability.

---

### Pitfall 3: Extension Reconnection Failures After Browser Sleep

**What goes wrong:**
When the computer sleeps/wakes or Chrome is backgrounded for extended periods, the extension-native host connection breaks. The extension fails to detect this and doesn't attempt reconnection, leaving the system in a broken state until manual intervention.

**Why it happens:**
- Service workers in Manifest V3 are ephemeral and can be terminated
- No connection state monitoring in the native messaging port
- Extension assumes connection is permanent once established
- Chrome may kill service worker during sleep/wake cycles

**Consequences:**
- Browser automation fails after idle periods
- Inconsistent user experience (works sometimes, fails others)
- Difficult to reproduce and debug
- Users blame extension reliability

**Prevention:**
1. Implement connection state monitoring with periodic ping/pong
2. Add automatic reconnection logic with exponential backoff
3. Handle `runtime.Port.onDisconnect` events properly
4. Implement connection recovery in service worker lifecycle events
5. Add connection health check before each operation

**Warning Signs:**
- Failures only after extended idle periods
- "Extension not connected" errors that resolve after page refresh
- Issues reported more frequently on laptops (sleep/wake cycles)

**Suggested Phase:**
**Phase 1: Lifecycle Hardening** - Reconnection is part of lifecycle reliability.

---

### Pitfall 4: Flaky E2E Tests Due to Extension Loading Race Conditions

**What goes wrong:**
End-to-end tests for browser automation tools fail intermittently because they don't wait for extension initialization. Tests start before extension is fully loaded and connected to native host, causing random failures that waste CI time and erode trust in test suite.

**Why it happens:**
- Playwright/extension testing requires explicit extension loading
- No standard pattern for "extension ready" detection in tests
- Extension initialization is asynchronous and non-deterministic
- Service worker startup time varies based on system load

**Consequences:**
- CI failures that aren't real bugs (flaky tests)
- Developers ignore test failures
- Reduced confidence in test suite
- Time wasted debugging phantom issues

**Prevention:**
1. Implement explicit "extension ready" signal in test fixtures
2. Add polling/wait logic for extension initialization before test execution
3. Use Playwright's `test.extend()` to provide connected extension fixture
4. Add retry logic for extension-dependent operations
5. Isolate extension state between tests (fresh profile per test)

**Warning Signs:**
- Tests pass locally but fail in CI
- Same test passes/fails inconsistently
- Failures occur more on slower CI runners
- Extension icons/popups not appearing in screenshots

**Suggested Phase:**
**Phase 2: Testing Infrastructure** - Test reliability is prerequisite for velocity.

---

### Pitfall 5: Breaking Internal Dependencies When Extracting Package

**What goes wrong:**
When extracting a package from a monorepo to standalone, hidden internal dependencies surface at publish time. The package appears to work in the monorepo but fails when installed externally because it relies on hoisted dependencies, workspace symlinks, or internal utilities that weren't packaged.

**Why it happens:**
- Monorepo hoisting hides undeclared dependencies
- Internal packages are symlinked but not published
- Build scripts rely on monorepo-specific paths
- TypeScript project references aren't resolved in isolation
- Dev dependencies in monorepo root are used at runtime

**Consequences:**
- Published package is broken for external users
- Contributors can't run the project standalone
- Runtime errors that don't appear in monorepo development
- Reputation damage from broken releases

**Prevention:**
1. Use `isolate-package` or similar to create standalone build before publishing
2. Verify package works in clean environment before each publish
3. Declare all dependencies explicitly (no hoisting reliance)
4. Bundle internal dependencies or publish them separately
5. Test installation from npm registry before tagging release

**Warning Signs:**
- `Cannot find module` errors after npm install
- Works in monorepo but fails in standalone project
- Missing type definitions for internal packages
- Build succeeds but runtime fails

**Suggested Phase:**
**Phase 3: Decoupling** - The extraction itself is where this risk manifests.

---

### Pitfall 6: Version Coordination Hell in Partial Decoupling

**What goes wrong:**
When some packages stay in monorepo while others are extracted, version coordination becomes error-prone. Breaking changes in shared libraries require synchronized releases across repositories, but the decoupled timeline makes this difficult.

**Why it happens:**
- Shared libraries in monorepo are sym-linked to consuming packages
- Every change to shared library is immediately used by all consumers
- Breaking changes require updating all consumers simultaneously
- With decoupled packages, this synchronization is manual and error-prone

**Consequences:**
- Version incompatibilities between extracted package and monorepo
- Runtime errors from API mismatches
- Forced lock-step releases that defeat decoupling benefits
- Developer confusion about which versions are compatible

**Prevention:**
1. Minimize shared dependencies before decoupling
2. Use semantic versioning strictly for shared libraries
3. Implement compatibility testing between extracted package and monorepo
4. Document version compatibility matrix
5. Consider keeping shared libraries in monorepo and publishing them
6. Use peer dependencies for optional shared functionality

**Warning Signs:**
- Type errors after updating one package but not another
- Runtime errors: "X is not a function" or "Cannot read property of undefined"
- Need to coordinate release timing across repositories
- Complex dependency chains requiring multiple PRs

**Suggested Phase:**
**Phase 3: Decoupling** - Version strategy is critical to decoupling success.

---

### Pitfall 7: Chrome Native Messaging Registry Conflicts

**What goes wrong:**
When multiple versions of the browser extension/native host exist (development, production, different user profiles), the native messaging host registry can point to the wrong executable. Chrome launches the wrong native host, causing version mismatches and mysterious failures.

**Why it happens:**
- Native messaging host JSON is registered per-user or per-system
- Multiple installations overwrite each other's registry entries
- Chrome caches native host paths and doesn't refresh without restart
- Development and production installations conflict

**Consequences:**
- Extension connects to wrong version of native host
- Features missing or behaving unexpectedly
- Hard to reproduce issues due to environment-specific registry state
- Silent failures where wrong code runs without error

**Prevention:**
1. Use distinct host names for dev/prod versions (e.g., `com.mycompany.browser-mcp-dev`)
2. Implement version handshake between extension and native host
3. Add registry validation in extension setup documentation
4. Provide diagnostic tools to check native host registration
5. Consider using portable/standalone installs during development

**Warning Signs:**
- Features work in dev but not in production build
- Extension console shows unexpected version numbers
- Native host logs show old code paths
- Registry points to wrong installation directory

**Suggested Phase:**
**Phase 1: Lifecycle Hardening** - Registry management is part of reliable startup.

---

### Pitfall 8: Test Isolation Failures in Browser Extension Tests

**What goes wrong:**
E2E tests for browser automation share state through the browser extension (local storage, IndexedDB, service worker state), causing tests to interfere with each other. Test A leaves state that breaks Test B, creating order-dependent failures.

**Why it happens:**
- Extension state persists across page navigations
- Service workers maintain state between tests
- Native host is singleton per browser instance
- Playwright doesn't automatically isolate extension state

**Consequences:**
- Tests pass in isolation but fail in full suite
- Order-dependent failures that are hard to debug
- CI failures that don't reproduce locally
- Reduced test coverage due to fear of adding tests

**Prevention:**
1. Use fresh browser profile for each test or test file
2. Implement extension state reset utility
3. Clear native host state between tests
4. Run tests in isolated worker processes
5. Use Playwright's `storageState: 'clean'` option for extension contexts

**Warning Signs:**
- Test fails only when run after specific other test
- Tests pass with `--workers=1` but fail with parallelism
- State from previous test visible in current test
- IndexedDB/storage contents leak between tests

**Suggested Phase:**
**Phase 2: Testing Infrastructure** - Isolation is fundamental to test reliability.

---

## Moderate Pitfalls

### Pitfall 9: Missing Cleanup on Uncaught Exceptions

**What goes wrong:**
When the MCP server crashes due to an uncaught exception, socket files, temp directories, and child processes are left behind. Over time these accumulate and cause resource exhaustion or conflicts on restart.

**Prevention:**
1. Implement `process.on('uncaughtException')` cleanup handlers
2. Use `finally` blocks for resource cleanup
3. Implement process exit hooks with `process.on('exit')`
4. Add startup cleanup of stale resources from previous runs

**Suggested Phase:** Phase 1: Lifecycle Hardening

---

### Pitfall 10: Testing Only Happy Path for Browser Actions

**What goes wrong:**
Tests focus on successful browser automation scenarios but don't cover timeout, permission denied, element not found, or navigation interrupted cases. Production bugs occur in these edge cases that weren't tested.

**Prevention:**
1. Add explicit error case tests for each browser tool
2. Test timeout scenarios with intentionally slow pages
3. Test permission denied flows
4. Test element that disappears during interaction

**Suggested Phase:** Phase 2: Testing Infrastructure

---

### Pitfall 11: Implicit Monorepo Tooling Dependencies

**What goes wrong:**
The extracted package relies on monorepo-level tooling (turborepo caching, workspace lint rules, shared tsconfig) that isn't available when standalone. This causes build/test failures for external contributors.

**Prevention:**
1. Copy or inline shared configs before extraction
2. Verify standalone build in CI before allowing merge
3. Document all assumed tooling for contributors
4. Provide devcontainer or setup script for consistent environment

**Suggested Phase:** Phase 3: Decoupling

---

### Pitfall 12: Extension ID Hardcoding

**What goes wrong:**
Code hardcodes extension IDs for native messaging or cross-extension communication. When extension is loaded unpacked (development) or published to different stores, the ID changes and communication breaks.

**Prevention:**
1. Use runtime extension ID retrieval (`chrome.runtime.id`)
2. Accept extension ID as configuration parameter
3. Document how to find and configure extension ID for development
4. Use key-based ID stabilization for development

**Suggested Phase:** Phase 1: Lifecycle Hardening

---

## Minor Pitfalls

### Pitfall 13: Socket Path Collisions in Multi-User Systems

**What goes wrong:**
Socket paths like `/tmp/mcp-bridge` collide when multiple users run the same extension on a shared system (servers, CI, containers).

**Prevention:**
Include username or unique identifier in socket path: `/tmp/mcp-bridge-{user}-{pid}`

**Suggested Phase:** Phase 1: Lifecycle Hardening

---

### Pitfall 14: Publishing With Dev Dependencies in Bundle

**What goes wrong:**
Published npm package includes dev dependencies (test runners, build tools) that bloat install size and slow `npm install`.

**Prevention:**
1. Use `files` array in package.json to whitelist includes
2. Add `.npmignore` to exclude dev artifacts
3. Verify bundle size before publish

**Suggested Phase:** Phase 3: Decoupling

---

### Pitfall 15: Lack of Diagnostic Tools

**What goes wrong:**
When lifecycle issues occur, users and developers lack tools to diagnose the problem. Logs are insufficient or scattered across extension, native host, and MCP server.

**Prevention:**
1. Implement unified logging with correlation IDs
2. Provide diagnostic command/script to check system state
3. Include version information in all log entries
4. Create troubleshooting guide with diagnostic steps

**Suggested Phase:** Phase 1: Lifecycle Hardening (foundational), Phase 4: Documentation

---

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|----------------|------------|
| Phase 1: Lifecycle | Process cleanup | Zombie processes | Implement parent heartbeat detection |
| Phase 1: Lifecycle | Socket management | Socket without process | Add health checks before operations |
| Phase 1: Lifecycle | Reconnection | Fail after sleep/wake | Implement automatic reconnection logic |
| Phase 2: Testing | E2E setup | Extension loading race | Use explicit ready signals in fixtures |
| Phase 2: Testing | Test isolation | State leakage | Fresh browser profile per test |
| Phase 2: Testing | Coverage gaps | Only happy path | Explicit error case test requirements |
| Phase 3: Decoupling | Dependencies | Hidden internal deps | Use isolate-package before publish |
| Phase 3: Decoupling | Versioning | Coordination hell | Strict semver + compatibility testing |
| Phase 3: Decoupling | Tooling | Monorepo assumptions | Verify standalone build in CI |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Lifecycle Pitfalls | HIGH | Multiple production issue reports (Claude Code, Chromium bugs) |
| Testing Pitfalls | HIGH | Well-documented Playwright/extension testing challenges |
| Decoupling Pitfalls | HIGH | Extensive monorepo migration literature and tools |

---

## Sources

### Lifecycle Reliability
- GitHub: anthopics/claude-code Issue #15463 - "Chrome native host enters zombie state"
- Chromium Bug Tracker: Issue 365046214 - "Chromium unable to kill native messaging processes"
- text/plain: "Improving Native Message Host Reliability on Windows" (ericlaw, 2023)
- pgEdge Blog: "MCP Transport: Architecture, Boundaries, and Failure Modes" (2026)
- GitHub: thedotmack/claude-mem Issue #752 - "Multiple MCP servers left running"

### Browser Extension & Native Messaging
- Chrome Developers: "Native messaging" documentation
- Microsoft Edge Developer: "Native messaging" documentation
- MDN: "Native messaging" documentation
- Chromium Extensions Google Groups: "Error communicating with native host"

### Testing
- GitHub: microsoft/playwright Issue #30421 - Extension testing limitations
- DEV Community: "How I Built E2E Tests for Chrome Extensions Using Playwright and CDP"
- BrowserStack: "Playwright for Chrome Extension Testing"
- Better Stack: "9 Playwright Best Practices and Pitfalls to Avoid"
- Medium: "Stop writing flaky tests: How to avoid common Playwright mistakes"

### Monorepo Decoupling
- GitHub: 0x80/isolate-package - Tool for isolating monorepo packages
- Graphite: "Common pitfalls when adopting a monorepo"
- Medium: "The Real-World Monorepo Guide: What They Don't Tell You"
- Zocdoc Tech: "Monorepo Magic: Escaping Version Hell By Decoupling Dependencies"
- benlorantfy.com: "The Problem with Monorepos and Shared Libraries"
- Turborepo: "Publishing libraries" documentation
- Nx: "Versioning and Releasing Packages in a Monorepo"
