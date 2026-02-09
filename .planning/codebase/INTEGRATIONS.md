# External Integrations

**Analysis Date:** 2026-02-09

## APIs & External Services

**Browser MCP Extension Protocol:**
- Communication: WebSocket server (local)
- Purpose: Control browser automation via Chrome extension
- Message Types: See `@repo/messaging` and `@repo/types`
- Connection: Local WebSocket on configurable port (default from `@repo/config/mcp.config`)
- Authentication: None (local-only communication)

**MCP Protocol:**
- Type: Model Context Protocol server
- Transport: StdioServerTransport (stdin/stdout)
- Capabilities: Tools, Resources
- Schema: MCP 1.8.0 specification

## Data Storage

**Databases:**
- Not applicable - Stateless MCP server

**File Storage:**
- Local filesystem only
- No persistent data storage
- Screenshots returned as base64 image data in MCP responses
- Console logs captured transiently from browser

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- None required (local tool)
- Relies on browser's existing authentication state
- Uses user's logged-in browser profile via extension

**Security Model:**
- Local-only WebSocket communication
- No external API keys or tokens
- No authentication between MCP client and server (stdio transport)

## Monitoring & Observability

**Error Tracking:**
- None

**Logs:**
- Debug logging via `console.error` (to stderr, avoiding stdio transport)
- Located: `src/utils/log.ts` - `debugLog` function
- Browser console logs captured and returned as tool results

## CI/CD & Deployment

**Hosting:**
- NPM package distribution
- Published as: `@browsermcp/mcp`
- Binary: `mcp-server-browsermcp`

**CI Pipeline:**
- Not visible in repository

**Build Process:**
- Local build via `npm run build` or `npm run prepare`
- Output: `dist/` directory
- Packaged files: `dist/` only (per package.json files array)

## Environment Configuration

**Required env vars:**
- None for core operation
- Configuration sourced from `@repo/config` workspace package

**Configuration Sources:**
- `appConfig` from `@repo/config/app.config` - Server name/version
- `mcpConfig` from `@repo/config/mcp.config` - WebSocket port, error messages
- Default WebSocket port: From `mcpConfig.defaultWsPort`

**Secrets location:**
- Not applicable - no secrets required

## Webhooks & Callbacks

**Incoming:**
- None (passive MCP server)

**Outgoing:**
- WebSocket messages to browser extension
  - `browser_navigate` - Navigate to URL
  - `browser_go_back` - Browser back navigation
  - `browser_go_forward` - Browser forward navigation
  - `browser_click` - Click element
  - `browser_hover` - Hover over element
  - `browser_type` - Type text into element
  - `browser_select_option` - Select dropdown option
  - `browser_press_key` - Press keyboard key
  - `browser_wait` - Wait specified duration
  - `browser_screenshot` - Capture screenshot
  - `browser_get_console_logs` - Retrieve console logs
  - `browser_snapshot` - Get ARIA accessibility snapshot
  - `getUrl` - Get current page URL
  - `getTitle` - Get current page title
  - `browser_drag` - Drag element (defined but not exported in current tools)

**Message Protocol:**
- Bidirectional WebSocket via `@r2r/messaging/ws/sender`
- Request/response pattern with timeout (default 30s)
- Error handling for disconnected tabs

## Browser Extension Integration

**Browser MCP Chrome Extension:**
- Required for operation
- Connects to local WebSocket server
- Performs actual browser automation
- Maintains user's browser profile and sessions
- Avoids bot detection by using real browser

**Installation:**
- User must install Browser MCP extension
- Click extension icon and connect to MCP server
- Connection verification via WebSocket handshake

---

*Integration audit: 2026-02-09*
