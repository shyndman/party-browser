# Phase 3: Handoff and Repeatable Execution Readiness - Research

**Researched:** 2026-02-10
**Domain:** Browser automation inspection, network/console capture, and procedural scraping artifacts
**Confidence:** HIGH

## Summary

Phase 3 enables the transition from LLM-guided discovery to procedural scraping by providing visibility into browser internals (network activity, console logs) and exportable selector artifacts. This research identifies the standard patterns for capturing network and console data in Firefox WebExtensions and establishes a practical artifact format for handoff.

The core technical challenges are: (1) capturing network requests via the webRequest API while filtering noise, (2) intercepting console messages from both the page and content script contexts, and (3) designing a selector artifact format that captures both the selectors and the execution context needed for reliable replay without LLM involvement.

**Primary recommendation:** Use Firefox's webRequest API for network capture, override console methods in content scripts for log capture, and adopt a JSON-based handoff artifact format inspired by Chrome DevTools Recorder format with session correlation metadata.

## User Constraints (from Roadmap Context)

### Requirements to Satisfy
- **DISC-03:** User can inspect captured network activity via `browser_network_requests`
- **DISC-04:** User can inspect browser console output via `browser_console_messages`
- **FLOW-02:** User can persist or export a selector handoff artifact that procedural scraping can execute without LLM involvement

### Dependencies from Phase 02.1
- Session lifecycle state machine (UNINITIALIZED → NAVIGATING → ACTIVE → CLOSED)
- Navigate-time tab creation and session binding
- SCREAMING_SNAKE_CASE error codes for programmatic handling
- No in-flight request retry (commands fail fast on transport drop)
- Background reconnection without command replay

## Standard Stack

### Core (Built-in Firefox WebExtension APIs)
| API | Version | Purpose | Why Standard |
|-----|---------|---------|--------------|
| `browser.webRequest` | Manifest V2+ | Capture HTTP request/response lifecycle | Native Firefox API, no dependencies, handles all request stages |
| `browser.webRequest.filterResponseData()` | Firefox 57+ | Access response body data | Only way to capture response content in WebExtensions |
| `browser.tabs` | Manifest V2+ | Session tab correlation | Already used in Phase 02.1 for session management |
| Content script injection | Manifest V2+ | Console message interception | Required to capture page console output |

### Supporting (Custom Implementation)
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| Session-scoped network log buffer | Store requests per session | All discovery sessions |
| Console proxy wrapper | Intercept console.* calls | In content script context |
| JSON handoff artifact format | Export selectors + metadata | When user requests export |

### No External Dependencies Required
This phase builds entirely on existing Firefox WebExtension APIs and the established session model from Phase 02.1. No npm packages or external libraries are needed.

## Architecture Patterns

### Recommended Session Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   MCP Server    │────▶│  browser_navigate │────▶│  Session Tab    │
│                 │     │  (creates session)│     │  (tabId stored) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                                               │
         │                                               ▼
         │                                      ┌─────────────────┐
         │                                      │ Background Script│
         │                                      │ - webRequest hooks│
         │                                      │ - console buffer  │
         │                                      └─────────────────┘
         │                                               │
         ▼                                               ▼
┌─────────────────┐                          ┌─────────────────┐
│ browser_network │◀─────────────────────────│  Request logs   │
│ _requests       │                          │  (per session)  │
└─────────────────┘                          └─────────────────┘
         ▲                                               │
         │                                               ▼
┌─────────────────┐                          ┌─────────────────┐
│ browser_console │◀─────────────────────────│  Console logs   │
│ _messages       │                          │  (per session)  │
└─────────────────┘                          └─────────────────┘
```

### Pattern 1: Per-Session Network Capture
**What:** Capture all network requests for a specific session-owned tab
**When to use:** When session is ACTIVE (after navigate completes)
**Implementation:**

```javascript
// In background.js - Source: MDN webRequest API documentation
// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest

let sessionNetworkLogs = new Map(); // sessionId -> array of request logs

function startNetworkCapture(sessionId, tabId) {
  const filter = {
    urls: ["<all_urls>"],
    tabId: tabId  // Only capture for session tab
  };
  
  browser.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (!sessionNetworkLogs.has(sessionId)) {
        sessionNetworkLogs.set(sessionId, []);
      }
      
      sessionNetworkLogs.get(sessionId).push({
        requestId: details.requestId,
        url: details.url,
        method: details.method,
        type: details.type, // "main_frame", "script", "xmlhttprequest", etc.
        timeStamp: details.timeStamp,
        requestBody: details.requestBody
      });
    },
    filter
  );
  
  browser.webRequest.onCompleted.addListener(
    (details) => {
      const logs = sessionNetworkLogs.get(sessionId);
      if (logs) {
        const log = logs.find(l => l.requestId === details.requestId);
        if (log) {
          log.statusCode = details.statusCode;
          log.responseHeaders = details.responseHeaders;
          log.completedTime = details.timeStamp;
        }
      }
    },
    filter,
    ["responseHeaders"]
  );
  
  browser.webRequest.onErrorOccurred.addListener(
    (details) => {
      const logs = sessionNetworkLogs.get(sessionId);
      if (logs) {
        const log = logs.find(l => l.requestId === details.requestId);
        if (log) {
          log.error = details.error;
        }
      }
    },
    filter
  );
}
```

### Pattern 2: Console Message Interception
**What:** Override console methods to capture log output
**When to use:** Content script injection on session tab
**Implementation:**

```javascript
// In content-script.js
// Source: Stack Overflow + MDN Content Scripts documentation
// https://stackoverflow.com/questions/64816454/override-functions-of-the-page-in-a-firefox-extension-content-script

let consoleLogs = [];

function startConsoleCapture() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;
  
  console.log = function(...args) {
    consoleLogs.push({
      level: 'log',
      message: args.map(a => String(a)).join(' '),
      timestamp: Date.now(),
      stack: new Error().stack
    });
    originalLog.apply(console, args);
  };
  
  console.error = function(...args) {
    consoleLogs.push({
      level: 'error',
      message: args.map(a => String(a)).join(' '),
      timestamp: Date.now(),
      stack: new Error().stack
    });
    originalError.apply(console, args);
  };
  
  // Also capture window.onerror for uncaught exceptions
  window.addEventListener('error', (event) => {
    consoleLogs.push({
      level: 'uncaught',
      message: event.message,
      source: event.filename,
      line: event.lineno,
      timestamp: Date.now()
    });
  });
}

// Expose to background script via message passing
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === 'getConsoleLogs') {
    sendResponse({ logs: consoleLogs });
    return true;
  }
});
```

### Pattern 3: Selector Handoff Artifact Format
**What:** JSON structure capturing discovery results for procedural execution
**When to use:** After discovery completes, user calls `removed selector export tool`
**Format (inspired by Chrome DevTools Recorder):**

```json
{
  "version": "1.0",
  "title": "Product page extraction workflow",
  "createdAt": "2026-02-10T12:00:00Z",
  "sessionId": "sess_abc123",
  "initialUrl": "https://example.com/products",
  "steps": [
    {
      "type": "navigate",
      "url": "https://example.com/products"
    },
    {
      "type": "wait",
      "mode": "time",
      "value": 2
    },
    {
      "type": "click",
      "selectors": [
        { "type": "css", "value": "button.load-more" },
        { "type": "text", "value": "Load More" }
      ],
      "description": "Load more products"
    },
    {
      "type": "extract",
      "name": "productList",
      "selectors": [
        { 
          "type": "css", 
          "value": ".product-item",
          "multiple": true,
          "fields": {
            "name": { "type": "css", "value": ".product-name" },
            "price": { "type": "css", "value": ".product-price" },
            "link": { "type": "css", "value": "a", "attribute": "href" }
          }
        }
      ]
    }
  ],
  "metadata": {
    "networkRequestCount": 45,
    "consoleErrorCount": 0,
    "sessionDuration": 124000
  }
}
```

### Anti-Patterns to Avoid
- **Capturing all network traffic without filtering:** Leads to noise from analytics, ads, tracking pixels. Filter by resource type and URL patterns.
- **Storing unlimited console logs:** Memory leaks in long sessions. Implement log rotation (e.g., keep last 1000 entries).
- **Using proprietary artifact formats:** Makes handoff harder. Stick to documented JSON/YAML formats.
- **Tying artifacts to specific tools:** Artifacts should be executable by any procedural scraper, not just this MCP server.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP request capture | Custom XHR/fetch monkey-patching | `browser.webRequest` API | Handles all request types, works across frames, captures pre-flight requests |
| Network log storage | In-memory arrays without limits | Ring buffer with size limits | Prevents memory exhaustion on long sessions |
| Selector artifact format | Custom binary format | JSON with standard schema | Human-readable, tool-agnostic, easy to debug |
| Console interception | Background script approaches | Content script method override | Only way to capture page console output reliably |

**Key insight:** The webRequest API exists specifically for this use case. Custom request interception via content scripts misses requests from service workers, iframes, and browser internals. Always use the native API.

## Common Pitfalls

### Pitfall 1: Session Lifecycle Desynchronization
**What goes wrong:** Network/console capture continues after session close, or logs from different sessions get mixed.
**Why it happens:** webRequest listeners registered globally but not filtered by tabId, or cleanup not happening on session_lost events.
**How to avoid:** 
- Always filter webRequest by tabId from session state
- Clear logs on `session_lost` (transport drop, tab close, kill switch)
- Use session-scoped Maps for log storage

**Warning signs:** 
- Logs appear after calling browser_close
- Network requests from other tabs appear in output

### Pitfall 2: Console Log Memory Exhaustion
**What goes wrong:** Long-running discovery sessions accumulate console logs until extension crashes.
**Why it happens:** No limit on console log buffer size; SPAs can generate thousands of logs.
**How to avoid:**
- Implement ring buffer (keep last N entries, e.g., 1000)
- Provide `clearConsole` command
- Log to storage API instead of memory for long sessions

**Warning signs:**
- Extension becomes unresponsive during long sessions
- Browser console shows "out of memory" errors

### Pitfall 3: Network Response Body Capture Complexity
**What goes wrong:** Attempting to capture all response bodies causes performance degradation.
**Why it happens:** `filterResponseData()` blocks response delivery until processed.
**How to avoid:**
- Only capture bodies for specific content types (JSON, HTML)
- Use streaming for large responses
- Set size limits (e.g., skip bodies > 1MB)

**Warning signs:**
- Page loads slower when extension is active
- Timeouts on requests

### Pitfall 4: Console Override Breaks Page Functionality
**What goes wrong:** Some sites check `console.log.toString()` or rely on console method behavior.
**Why it happens:** Overriding methods changes their string representation.
**How to avoid:**
- Preserve original method descriptors
- Use `bind()` to maintain correct `this` context
- Test on sites with heavy console usage

**Warning signs:**
- JavaScript errors on specific sites only
- Console methods returning unexpected values

## Code Examples

### Network Request Retrieval Tool

```typescript
// src/tools/network.ts
// Source: Based on MDN webRequest API patterns

export const getNetworkRequests: Tool = {
  schema: {
    name: "browser_network_requests",
    description: "Get captured network requests from the current session",
    inputSchema: zodToJsonSchema(z.object({
      filter: z.object({
        types: z.array(z.string()).optional(),
        urlPattern: z.string().optional()
      }).optional()
    }))
  },
  handle: async (context, params) => {
    const requests = await context.sendSocketMessage(
      "browser_get_network_requests",
      { filter: params.filter }
    );
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(requests, null, 2)
      }]
    };
  }
};
```

### Console Messages Tool

```typescript
// src/tools/console.ts
// Source: Pattern from Firefox extension development

export const getConsoleMessages: Tool = {
  schema: {
    name: "browser_console_messages",
    description: "Get browser console logs from the current session",
    inputSchema: zodToJsonSchema(z.object({
      level: z.enum(["all", "log", "warn", "error"]).default("all"),
      since: z.number().optional() // timestamp
    }))
  },
  handle: async (context, params) => {
    const logs = await context.sendSocketMessage(
      "browser_get_console_messages",
      { 
        level: params.level,
        since: params.since 
      }
    );
    
    const formatted = logs.map((log: ConsoleLog) => 
      `[${log.level.toUpperCase()}] ${new Date(log.timestamp).toISOString()}: ${log.message}`
    ).join("\n");
    
    return {
      content: [{ type: "text", text: formatted }]
    };
  }
};
```

### Selector Export Tool

```typescript
// src/tools/export.ts
// Source: Inspired by Chrome DevTools Recorder format
// https://developer.chrome.com/docs/devtools/recorder/reference/#export-flows

export const exportSelectors: Tool = {
  schema: {
    name: "removed selector export tool",
    description: "Export discovered selectors as a handoff artifact",
    inputSchema: zodToJsonSchema(z.object({
      name: z.string().describe("Name for this selector workflow"),
      selectors: z.array(z.object({
        action: z.enum(["navigate", "click", "type", "select", "wait", "extract"]),
        target: z.string().describe("Element reference or selector"),
        value: z.string().optional(),
        description: z.string().optional()
      }))
    }))
  },
  handle: async (context, params) => {
    const artifact = await context.sendSocketMessage(
      "removed selector export tool",
      { 
        name: params.name,
        selectors: params.selectors,
        includeMetadata: true,
        includeConsole: true,
        includeNetwork: true
      }
    );
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(artifact, null, 2)
      }],
      // Also offer as file resource
      _meta: {
        artifactUri: `artifact://${artifact.sessionId}/${artifact.exportId}`
      }
    };
  }
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom request interception via content scripts | Native `webRequest` API | Firefox 48+ (2016) | Reliable capture, handles all request types |
| Proprietary macro formats | JSON-based open formats | Chrome DevTools Recorder v101 (2022) | Tool interoperability, easier debugging |
| Manual selector documentation | Automated artifact export | Playwright Codegen, Puppeteer Recorder | Reduced handoff friction |
| Session-unaware logging | Per-session log isolation | Phase 02.1 implementation (2026) | Clean debugging, no cross-session contamination |

**Deprecated/outdated:**
- **Custom XMLHttpRequest wrapping:** Fragile, misses fetch API, service workers. Use webRequest API instead.
- **Screenshot-based selector documentation:** Brittle, not machine-readable. Use structured JSON artifacts.

## Open Questions

### 1. Network Request Body Capture Scope
**What we know:** `webRequest.filterResponseData()` can capture response bodies but blocks response delivery.
**What's unclear:** How much body content to capture (headers only? JSON? all text?)
**Recommendation:** Start with headers only for v1. Add body capture for JSON/XML responses under 100KB as enhancement.

### 2. Console Log Persistence Across Session Reconnect
**What we know:** Session ownership clears on transport drop (Phase 02.1 decision).
**What's unclear:** Should console logs persist if user reconnects to same tab? Or are logs session-specific?
**Recommendation:** Logs are session-specific. When session clears, logs clear. User should export before close if preservation needed.

### 3. Selector Artifact Execution Semantics
**What we know:** Artifact format needs to support procedural execution.
**What's unclear:** Should artifact include execution instructions (timeouts, retries) or just selectors?
**Recommendation:** Include minimal execution metadata (wait times). Keep artifacts focused on "what to extract" not "how to execute."

## Sources

### Primary (HIGH confidence)
- Mozilla MDN - webRequest API - https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest
- Mozilla MDN - Intercept HTTP requests - https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Intercept_HTTP_requests
- Chrome DevTools Recorder Reference - https://developer.chrome.com/docs/devtools/recorder/reference
- Playwright Codegen documentation - https://playwright.dev/docs/codegen

### Secondary (MEDIUM confidence)
- Stack Overflow - Override console in content scripts - https://stackoverflow.com/questions/64816454/override-functions-of-the-page-in-a-firefox-extension-content-script
- GitHub - Chrome DevTools Recorder JSON format discussion - https://github.com/microsoft/playwright/issues/22345
- Playwright Trace Viewer documentation - https://playwright.dev/docs/trace-viewer

### Tertiary (LOW confidence)
- Web scraping automation blogs - General patterns, not verified with official docs
- Community forum discussions - Implementation approaches vary

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** - Based on Mozilla MDN documentation, well-established APIs
- Architecture: **HIGH** - Patterns validated against official examples
- Pitfalls: **MEDIUM** - Based on community reports and Stack Overflow issues

**Research date:** 2026-02-10
**Valid until:** 2026-05-10 (Firefox WebExtension APIs are stable, unlikely to change)

**Related phases:**
- Phase 02.1: Session model dependency
- Phase 2: Discovery tools (click, type, evaluate) generate selector artifacts

**Estimated implementation complexity:** Medium
- Network capture: 2-3 days (webRequest API integration)
- Console capture: 1-2 days (content script modification)
- Export format: 1-2 days (JSON schema + MCP tools)
- Testing: 2-3 days (various sites, error conditions)
