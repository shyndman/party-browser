# Feature Landscape: Browser MCP Core

**Domain:** Browser Automation MCP Server  
**Researched:** 2026-02-09  
**Context:** Brownfield project transitioning to production-grade, maintainer/contributor-ready state

---

## Current State Assessment

**Implemented:**
- Basic MCP tool surface (navigate, click, type, hover, drag, select, wait, pressKey)
- WebSocket communication to Chrome extension
- ARIA snapshot capture for accessibility-based element targeting
- Screenshot capture
- Console logs access
- Connection management (single tab, aggressive port cleanup)

**Architecture:**
- Layered architecture with Context, Server, Transport, Tool layers
- Monorepo-dependent (relies on `@repo/*` and `@r2r/*` packages)
- Stdio transport for MCP client communication
- WebSocket server for browser extension bridge

**Critical Gaps:**
- No automated test coverage
- No graceful error recovery or reconnection logic
- No connection health monitoring
- No contributor onboarding documentation
- Missing standard production-grade features

---

## Table Stakes

Features users expect from a production-grade browser automation MCP server. Missing these = product feels broken or incomplete.

### Reliability & Lifecycle Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **WebSocket heartbeat/ping-pong** | Detect silent connection failures before users do | Low | Protocol-level ping/pong frames or application-level heartbeat. Critical for detecting zombie connections. |
| **Automatic reconnection with backoff** | Network failures are expected, not exceptional | Medium | Exponential backoff (1s, 2s, 4s, 8s... max 60s), max retry attempts, circuit breaker pattern. |
| **Graceful connection state management** | Users need to know if browser is connected | Low | Clear states: `disconnected` → `connecting` → `connected` → `reconnecting`. Expose via tool or resource. |
| **Connection health monitoring** | Long-running sessions need health visibility | Low | Track last successful operation, latency metrics, consecutive failures. |
| **Clean shutdown handling** | Prevent orphaned browser states | Low | Close WebSocket, clean up resources, notify extension on server exit. Current watchdog is basic. |

**Dependencies:**
```
Heartbeat detection → Automatic reconnection (need to know when to reconnect)
Connection state → Health monitoring (state enables health tracking)
```

### Error Handling & Recovery

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Structured error responses** | AI clients need to understand failures | Low | Use MCP SDK's `isError: true` consistently with descriptive messages. Categorize: connection, timeout, element-not-found, permission-denied. |
| **Timeout handling per operation** | Browser operations can hang | Low | Current 30s default is reasonable, but should be configurable per-tool. |
| **Retry with backoff for transient failures** | Network blips shouldn't fail tasks | Medium | Distinguish transient (network timeout) vs permanent (element not found). Retry only transient. |
| **Graceful degradation** | Partial functionality beats total failure | Medium | If screenshot fails, still return ARIA snapshot. If one tab fails, don't kill entire session. |

### Testing & Quality Assurance

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Unit tests for tool handlers** | Confidence in individual components | Medium | Test tool logic in isolation with mocked Context. Current codebase has zero tests. |
| **Integration tests with mocked extension** | Verify WebSocket communication | Medium | Mock WebSocket server that simulates extension responses. Test happy path + error scenarios. |
| **End-to-end tests with real browser** | Catch integration issues | High | Requires Chrome + extension setup in CI. Test actual automation workflows. |
| **Test coverage reporting** | Visibility into untested code | Low | 80%+ target for production-grade. Use c8 or nyc. |
| **CI/CD pipeline** | Automated testing on PRs | Medium | GitHub Actions: lint, typecheck, test, build on every PR. |

**Dependencies:**
```
Unit tests → Integration tests (integration builds on unit patterns)
Integration tests → E2E tests (progressive complexity)
```

### Developer Experience (Contributor-Focused)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **CONTRIBUTING.md** | Clear contribution guidelines | Low | Code style, commit conventions, PR process, issue templates. |
| **DEVELOPMENT.md** | Local setup instructions | Low | Step-by-step: clone, install, build, test, debug. Current monorepo dependency is a barrier. |
| **Architecture documentation** | Understanding the system | Low | Already partially done in `.planning/codebase/`. Needs cross-reference with code. |
| **API documentation for tools** | What tools do and expect | Low | Auto-generate from Zod schemas. Current tools have descriptions but no detailed docs. |
| **Debug logging** | Troubleshooting automation | Low | Already have `debugLog` utility. Need to add more instrumentation points. |
| **Standalone build capability** | No monorepo dependency for contributors | High | Currently relies on `@repo/*` packages. Decouple or document how to develop without monorepo. |

**Confidence:** MEDIUM (WebSearch findings, community consensus on open source best practices)

---

## Differentiators

Features that set Browser MCP apart from alternatives (Playwright MCP, Chrome DevTools MCP, etc.). Not expected, but create competitive advantage.

### Local-First Privacy

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **True local execution** | No data leaves the machine | Low | Already achieved. Emphasize in docs: no cloud proxy, no telemetry, no external services. |
| **User's actual browser profile** | Access to logged-in sessions | Low | Core value prop. Avoid bot detection via real fingerprint. Different from Playwright's isolated contexts. |
| **Private by default** | Zero network calls for automation | Low | Document: no analytics, no crash reporting, no update checks without explicit opt-in. |

### Extension Architecture Benefits

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Tab isolation** | One server per tab, no cross-tab contamination | Low | Already achieved. Better security model than global browser control. |
| **Browser-native permissions** | Leverage Chrome's permission model | Low | Extension handles permissions, not MCP server. Clear audit trail in browser. |
| **Visual connection indicator** | Extension shows connection status | Low | Extension UI can show active MCP connections, current operations. |

### Reliability Innovations

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Intelligent element recovery** | Handle DOM changes gracefully | High | If element reference goes stale, try to re-find by ARIA attributes or text content. |
| **Action confirmation** | Verify operations actually completed | Medium | After click, verify element state changed. After navigate, verify URL loaded. |
| **Session recovery** | Restore state after reconnection | High | Track operation history, replay pending operations after reconnect. |

### Developer Experience

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Operation replay/recording** | Debug automation sequences | Medium | Log all operations with timestamps, allow replay for debugging. |
| **Rich error context** | AI understands why automation failed | Medium | Include page state snapshot, last successful operation, relevant console logs in error. |
| **Interactive debugging** | Step-through automation | High | Pause on specific operations, inspect state, resume. Complex but powerful. |

**Confidence:** MEDIUM (WebSearch findings, some patterns from Playwright best practices)

---

## Anti-Features

Features to explicitly NOT build. These add complexity without proportional value, or conflict with core constraints.

### Anti-Feature 1: Remote/Cloud Execution Mode

**What:** Execute browser automation on cloud servers instead of local machine.

**Why Avoid:**
- Violates core "local-first" and "privacy" value propositions
- Requires infrastructure (servers, proxies, security hardening)
- Loses key differentiator: user's logged-in browser profile
- Increases attack surface significantly

**What to Do Instead:**
- Double down on local execution reliability
- Document how to run in Docker locally for isolation if needed
- Focus on making local execution as seamless as possible

### Anti-Feature 2: Multi-Tab/Multi-Window Coordination

**What:** Control multiple tabs or windows from single MCP server.

**Why Avoid:**
- Significant complexity increase
- Tab isolation is a security feature, not a limitation
- Users can spawn multiple MCP servers for multiple tabs
- Chrome extension architecture favors one connection per context

**What to Do Instead:**
- Document pattern: one server per tab
- Provide clear error message if user tries to connect multiple tabs
- Focus on making single-tab automation rock-solid

### Anti-Feature 3: Built-in CAPTCHA Solving

**What:** Automatic CAPTCHA detection and solving.

**Why Avoid:**
- Legal and ethical concerns
- CAPTCHA providers actively fight automation
- Arms race that's expensive to maintain
- Violates terms of service of most websites

**What to Do Instead:**
- Document that Browser MCP is for legitimate automation only
- Provide clear error when CAPTCHA detected (screenshot shows CAPTCHA)
- Let user handle CAPTCHA manually if needed

### Anti-Feature 4: Persistent Session Storage

**What:** Save and resume browser sessions across server restarts.

**Why Avoid:**
- Significant complexity (cookies, localStorage, sessionStorage, IndexedDB)
- Security risk: where do you store sensitive session data?
- Browser already handles session persistence
- MCP server should be stateless where possible

**What to Do Instead:**
- Document that sessions live in the browser
- If persistence needed, use browser's built-in profiles
- Keep MCP server ephemeral and restartable

### Anti-Feature 5: AI-Driven Element Selection

**What:** Use AI/ML to find elements instead of ARIA/selector-based targeting.

**Why Avoid:**
- ARIA snapshots are deterministic and fast
- AI selection adds latency, cost, and non-determinism
- Vision-based selection (screenshot → AI → coordinates) is fragile
- Conflicts with "reliability over cleverness" principle

**What to Do Instead:**
- Double down on ARIA accessibility tree
- Improve ARIA snapshot quality and coverage
- Add more selector strategies (CSS, XPath) as fallbacks, not AI

### Anti-Feature 6: Browser Extension Store Integration

**What:** Auto-install or manage Chrome extension via Web Store APIs.

**Why Avoid:**
- Requires Google API credentials and OAuth
- Adds dependency on external service
- Extension installation should be explicit user action
- Security risk: auto-installing extensions

**What to Do Instead:**
- Clear documentation on how to install extension manually
- Provide extension download link
- Check for extension and provide helpful error if not installed

**Confidence:** HIGH (Strong alignment with project's stated constraints and core values)

---

## Feature Dependencies

```
Core Infrastructure:
  WebSocket heartbeat
      ↓
  Automatic reconnection
      ↓
  Connection health monitoring

Error Handling:
  Structured error responses
      ↓
  Retry with backoff
      ↓
  Graceful degradation

Testing:
  Unit tests
      ↓
  Integration tests (depends on unit test patterns)
      ↓
  E2E tests (depends on integration test infrastructure)

Contributor Experience:
  CONTRIBUTING.md + DEVELOPMENT.md
      ↓
  Standalone build (enables contributors without monorepo)
      ↓
  CI/CD pipeline (validates contributions)

Reliability Innovations (Differentiators):
  Connection health monitoring
      ↓
  Action confirmation
      ↓
  Intelligent element recovery
```

---

## MVP Recommendation (Next Phase)

**Prioritize these table stakes for reliability:**

1. **WebSocket heartbeat + reconnection** (Low complexity, high impact)
   - Addresses silent connection failures
   - Enables recovery from transient network issues

2. **Structured error handling** (Low complexity, high impact)
   - Immediate improvement in user experience
   - Foundation for all other reliability features

3. **Unit test framework + initial tests** (Medium complexity, foundational)
   - Enables confident refactoring
   - Required before adding complexity

4. **CONTRIBUTING.md + DEVELOPMENT.md** (Low complexity, enables contributors)
   - Unblocks external contributors
   - Document standalone development workaround

**Defer these to later phases:**

- Session recovery (High complexity, lower frequency issue)
- Interactive debugging (High complexity, niche use case)
- E2E tests with real browser (High complexity, need foundation first)

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Table Stakes - Reliability | HIGH | Well-documented patterns (WebSocket heartbeat, reconnection) |
| Table Stakes - Testing | HIGH | Standard Node.js testing practices |
| Table Stakes - DX | MEDIUM | WebSearch findings on open source best practices |
| Differentiators | MEDIUM | Some innovative, based on domain knowledge |
| Anti-Features | HIGH | Strong alignment with project constraints |
| Dependencies | HIGH | Logical sequencing based on implementation experience |

---

## Sources

- MCP SDK Documentation (Context7 - TypeScript SDK)
- MCP Production Best Practices: The New Stack, ByteBridge Medium
- WebSocket Reliability: OneUptime blog series on reconnection and heartbeat
- Chrome Extension Security: OWASP Cheat Sheet, Creole Studios blog
- MCP Testing: Codely blog, MCPcat guides, mcp-jest repo
- Browser Automation: Playwright best practices, Anchor Browser blog
- Open Source DX: PullNotifier blog, PullFlow collaboration report

**Research Confidence:** MEDIUM-HIGH (Multiple authoritative sources, patterns align across sources)
