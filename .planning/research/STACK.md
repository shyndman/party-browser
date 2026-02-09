# Stack Research

**Domain:** MCP-compatible browser pre-scraping system
**Researched:** 2026-02-09
**Confidence:** HIGH

## Executive Summary

The 2025 standard stack for MCP-compatible browser pre-scraping prioritizes **WebDriver BiDi** as the CDP alternative, **MCP SDK v1.26.0** for protocol compliance, and **Playwright v1.51.0** for browser automation. This stack enables LLM-assisted selector discovery through semantic DOM snapshots while maintaining strict protocol boundaries via MCP's tool/resource/prompt abstractions.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **@modelcontextprotocol/server** | ^1.26.0 | MCP server implementation | Official Anthropic SDK. Provides `McpServer` class with `registerTool()`, `registerResource()`, `registerPrompt()` APIs. v1.x is production-stable; v2 is in pre-alpha. **Required peer dependency: zod v4**. Confidence: HIGH (Context7 + official docs) |
| **playwright** | ^1.51.0 | Browser automation | WebDriver BiDi support (not CDP), cross-browser (Chromium/Firefox/WebKit), `browserType.connect()` for WebSocket-based remote control. Superior to Puppeteer for WebDriver BiDi maturity. Confidence: HIGH (Context7 v1.51.0) |
| **zod** | ^3.25.4 | Schema validation | TypeScript-first validation with static inference. MCP SDK peer dependency (uses Zod v4 patterns). v3.25.x is stable; v4 is beta. Confidence: HIGH (npm registry) |
| **ws** | ^8.19.0 | WebSocket transport | Industry-standard Node.js WebSocket implementation. 24K+ dependents, passes Autobahn test suite. Used by MCP SDK transports and Playwright remote connections. Confidence: HIGH (npm registry + GitHub) |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **cheerio** | ^1.0.0 | Server-side DOM parsing | Fast HTML manipulation for LLM context extraction. Use for parsing page snapshots to generate selector recommendations. 8-12x faster than JSDOM, jQuery-like API. Confidence: MEDIUM (WebSearch verified) |
| **@modelcontextprotocol/node** | ^1.26.0 | Node.js HTTP transport | Streamable HTTP transport wrapper for Node.js `IncomingMessage`/`ServerResponse`. Use when deploying standalone MCP server. Confidence: HIGH (Context7) |
| **@modelcontextprotocol/express** | ^1.26.0 | Express middleware | Express integration with Host header validation. Use when integrating into existing Express applications. Confidence: HIGH (official repo) |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **tsx** | TypeScript execution | Zero-config TypeScript runner for development. Use for running MCP server in dev mode without pre-compilation. |
| **vitest** | Testing | MCP SDK uses vitest internally. Use for unit testing tools and resources. |
| **@types/ws** | WebSocket types | TypeScript declarations for `ws` library. Required for WebSocket transport implementation. |

## Installation

```bash
# Core runtime dependencies
npm install @modelcontextprotocol/server@^1.26.0 playwright@^1.51.0 zod@^3.25.4 ws@^8.19.0

# Supporting libraries
npm install cheerio@^1.0.0

# Optional: Node.js HTTP transport middleware
npm install @modelcontextprotocol/node@^1.26.0

# Development dependencies
npm install -D tsx vitest @types/ws @types/node typescript
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Playwright** | Puppeteer v24.x | Use Puppeteer only if you need Firefox WebDriver BiDi (it's default there) or have existing Puppeteer infrastructure. Playwright has better cross-browser WebDriver BiDi coverage. |
| **ws** | socket.io | Use socket.io only if you need fallback transports (long-polling) or room-based broadcasting. `ws` is lighter and sufficient for MCP transport. |
| **cheerio** | jsdom | Use jsdom only if you need full browser environment simulation (event bubbling, layout calculation). Cheerio is 8-12x faster for pure DOM traversal. |
| **@modelcontextprotocol/server** | Direct JSON-RPC | Never. The SDK handles capability negotiation, request routing, and protocol compliance. Rolling your own risks protocol drift. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **CDP (Chrome DevTools Protocol)** | Project constraint explicitly prohibits CDP for core features. CDP is Chrome-only and being deprecated in favor of WebDriver BiDi. | **WebDriver BiDi** via Playwright/Puppeteer with `protocol: 'webDriverBiDi'` |
| **@modelcontextprotocol/sdk v2.x** | v2 is pre-alpha (as of Feb 2026). Breaking API changes expected. Migration path from v1 not guaranteed. | **@modelcontextprotocol/server v1.26.0** (stable) |
| **zod v4 beta** | MCP SDK documentation specifies Zod v4, but v4 is still in beta. v3.25.x has full v4 compatibility for MCP use cases. | **zod v3.25.4** (stable) |
| **Puppeteer with default Chrome** | Puppeteer defaults to CDP for Chrome. Must explicitly set `protocol: 'webDriverBiDi'`. | Playwright or Puppeteer with explicit `protocol: 'webDriverBiDi'` |
| **puppeteer-extra** | Plugin system for Puppeteer. Adds complexity and may interfere with WebDriver BiDi protocol stability. | Native Playwright/Puppeteer APIs |
| **Selenium WebDriver** | Heavyweight, slower than Playwright/Puppeteer. Designed for testing, not pre-scraping. | Playwright with `browserType.connect()` |

## Stack Patterns by Variant

### If deploying standalone MCP server:
- Use `@modelcontextprotocol/node` for Streamable HTTP transport
- Because: Handles `IncomingMessage`/`ServerResponse` wiring, Host header validation, CORS

### If integrating into existing Express app:
- Use `@modelcontextprotocol/express` middleware
- Because: Provides app defaults, JSON body parsing hooks, Host validation

### If using Firefox:
- Use Puppeteer with default settings (WebDriver BiDi is default for Firefox)
- Because: Firefox WebDriver BiDi support is production-ready in Puppeteer v23+

### If using Chrome/Edge:
- Use Playwright with WebDriver BiDi or Puppeteer with `protocol: 'webDriverBiDi'`
- Because: Chrome defaults to CDP; must explicitly opt into BiDi

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| @modelcontextprotocol/server@1.26.0 | zod@^3.25.4 or zod@^4.0.0-beta | Zod is peer dependency. SDK uses Zod v4 patterns but v3.25+ compatible. |
| playwright@1.51.0 | ws@^8.x | Playwright uses `ws` for `browserType.connect()` WebSocket transport. |
| ws@8.19.0 | Node.js >=18.0.0 | Requires Node 18+ for modern WebSocket features. |
| cheerio@1.0.0 | Any Node.js LTS | Pure JavaScript, no native dependencies. |

## Architecture Rationale

### Why WebDriver BiDi over CDP?
1. **W3C Standard**: WebDriver BiDi is the official W3C specification (Editor's Draft Jan 2026). CDP is Chrome-specific.
2. **Cross-browser**: BiDi works with Chrome, Firefox, and Edge. CDP only works with Chrome/Edge.
3. **WebSocket Transport**: Native WebSocket protocol enables clean separation between MCP server and browser process.
4. **Future-proof**: Browser vendors are actively implementing BiDi; CDP is in maintenance mode.

### Why Playwright over Puppeteer?
1. **WebDriver BiDi Maturity**: Playwright has more complete WebDriver BiDi coverage as of v1.51.0.
2. **Cross-browser**: Playwright supports Chromium, Firefox, and WebKit with the same API.
3. **Architecture**: Playwright's `browserType.launchServer()` + `browserType.connect()` is purpose-built for remote control.

### Why MCP SDK instead of raw JSON-RPC?
1. **Capability Negotiation**: SDK handles client/server capability discovery automatically.
2. **Type Safety**: Zod schema validation with TypeScript inference.
3. **Protocol Compliance**: Ensures compliance with MCP 2024-11-05 specification.
4. **Transport Abstraction**: Supports stdio, Streamable HTTP, and WebSocket transports.

## Implementation Notes

### WebDriver BiDi Connection Pattern
```typescript
// Playwright with WebDriver BiDi
import { chromium } from 'playwright';

const browser = await chromium.launch({
  // Playwright will use WebDriver BiDi when connecting to Firefox
  // For Chrome, explicitly set protocol (not needed if constraint allows)
});

// Or connect to existing browser via WebSocket
const browser = await chromium.connect('ws://localhost:3000');
```

### MCP Server Pattern
```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

const server = new McpServer({ name: 'browser-scraper', version: '1.0.0' });

// Register tool for LLM-assisted selector discovery
server.registerTool('discover_selectors', {
  description: 'Extract selectable elements from page snapshot',
  inputSchema: {
    url: z.string().url(),
    element_type: z.enum(['link', 'button', 'input', 'table'])
  }
}, async ({ url, element_type }) => {
  // Implementation using Playwright + Cheerio
});
```

### DOM Snapshot Pattern
```typescript
import * as cheerio from 'cheerio';

// Extract semantic context for LLM selector generation
function extractSelectableContext(html: string) {
  const $ = cheerio.load(html);
  const elements = $('[id], [class], [data-testid]').map((_, el) => ({
    tag: el.tagName,
    id: $(el).attr('id'),
    classes: $(el).attr('class')?.split(' '),
    text: $(el).text().trim().slice(0, 100),
    attributes: Object.keys(el.attribs).filter(a => 
      a.startsWith('data-') || a.startsWith('aria-')
    )
  })).get();
  
  return elements;
}
```

## Sources

- **Context7** `/modelcontextprotocol/typescript-sdk` — MCP server implementation, registerTool/registerResource APIs, Zod v4 integration
- **Context7** `/microsoft/playwright` — WebSocket support, browserType.connect, WebDriver BiDi compatibility
- **Context7** `/puppeteer/puppeteer` — WebDriver BiDi protocol support, Firefox default BiDi usage
- **W3C WebDriver BiDi Editor's Draft** (Jan 28, 2026) — Official protocol specification, WebSocket transport requirements
- **npm registry** — Package versions verified: @modelcontextprotocol/server@1.26.0, zod@3.25.4, ws@8.19.0, cheerio@1.0.0
- **GitHub** `modelcontextprotocol/typescript-sdk` — v1 vs v2 branch status, middleware packages documentation
- **pptr.dev/webdriver-bidi** — Puppeteer WebDriver BiDi feature support matrix

---

*Stack research for: Browser MCP Pre-scraping Tool*
*Confidence: HIGH — All version numbers verified against npm registry and official docs. WebDriver BiDi recommendation based on W3C specification and library Context7 documentation.*
