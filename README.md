<a href="https://browsermcp.io">
  <img src="./.github/images/banner.png" alt="Browser MCP banner">
</a>

<h3 align="center">Browser MCP</h3>

<p align="center">
  Automate your browser with AI.
  <br />
  <a href="https://browsermcp.io"><strong>Website</strong></a> 
  •
  <a href="https://docs.browsermcp.io"><strong>Docs</strong></a>
</p>

## About

Browser MCP is an MCP server + Chrome extension that allows you to automate your browser using AI applications like VS Code, Claude, Cursor, and Windsurf.

## Features

- ⚡ Fast: Automation happens locally on your machine, resulting in better performance without network latency.
- 🔒 Private: Since automation happens locally, your browser activity stays on your device and isn't sent to remote servers.
- 👤 Logged In: Uses your existing browser profile, keeping you logged into all your services.
- 🥷🏼 Stealth: Avoids basic bot detection and CAPTCHAs by using your real browser fingerprint.

## Local Development

### Prerequisites

- Node.js 18+ and npm
- Browser MCP Chrome extension installed and enabled

### Quick Start

```bash
# Install dependencies
npm install

# Build the server
npm run build

# Verify everything works (recommended before first use)
npm run smoke
```

### Smoke Verification

The smoke test verifies that the MCP server starts correctly and registers all required tools:

```bash
# Full verification (build + test)
npm run smoke

# Quick verification (test only, assumes built)
npm run smoke:tools
```

**Expected output:** All checks pass, 4 required Phase 1 tools found.

### Running the Server

Start the MCP server for local development:

```bash
# Start the server (stdio mode for MCP clients)
node dist/index.js
```

**Important:** The server starts successfully even without a browser tab connected. This is expected behavior. Tool calls will fail with connection errors until you:

1. Open the Browser MCP extension in Chrome
2. Ensure the extension shows "Connected" status
3. Have at least one browser tab open

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `browser_navigate` fails with connection error | No browser tab connected | Open Chrome extension, ensure it shows "Connected" |
| Smoke test fails with "Server binary not found" | Build artifacts missing | Run `npm run build` first |
| Extension shows "Disconnected" | Server not running or port issue | Verify server is running, check extension settings |

### Development Workflow

1. Make changes to source files in `src/`
2. Run `npm run build` to compile
3. Run `npm run smoke` to verify
4. Test with MCP client (VS Code, Claude Desktop, etc.)

## Contributing

This repo contains all the core MCP code for Browser MCP, but currently cannot yet be built on its own due to dependencies on utils and types from the monorepo where it's developed.

## Credits

Browser MCP was adapted from the [Playwright MCP server](https://github.com/microsoft/playwright-mcp) in order to automate the user's browser rather than creating new browser instances. This allows using the user's existing browser profile to use logged-in sessions and avoid bot detection mechanisms that commonly block automated browser use.
