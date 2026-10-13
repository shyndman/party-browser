<a href="https://browsermcp.io">
  <img src="./.github/images/banner.png" alt="PartyBrowser banner">
</a>

<h3 align="center">PartyBrowser</h3>

<p align="center">
  Automate your browser with AI.
  <br />
  <a href="https://browsermcp.io"><strong>Website</strong></a>
  •
  <a href="https://docs.browsermcp.io"><strong>Docs</strong></a>
</p>

## About

PartyBrowser is an MCP server + browser extension that allows you to automate your browser using AI applications like VS Code, Claude, Cursor, and Windsurf.

**Supported Browsers:**
- ✅ Google Chrome (with extension from Chrome Web Store)
- ✅ Firefox Developer Edition (with local XPI build)

## Features

- ⚡ Fast: Automation happens locally on your machine, resulting in better performance without network latency.
- 🔒 Private: Since automation happens locally, your browser activity stays on your device and isn't sent to remote servers.
- 👤 Logged In: Uses your existing browser profile, keeping you logged into all your services.
- 🥷🏼 Stealth: Avoids basic bot detection and CAPTCHAs by using your real browser fingerprint.
- 🦊 Firefox Support: Build and install the extension in Firefox Developer Edition for cross-browser automation.
- The toolbar badge shows the number of agents waiting for approval. No badge appears when the count is zero.

## Usage

### Selector Discovery Workflow

The PartyBrowser enables LLM-guided selector discovery for web scraping and automation. Instead of manually inspecting HTML and writing selectors, you can guide an LLM through an interactive discovery process:

1. **Explore** — Navigate to the target page and capture snapshots
2. **Identify** — Use `evaluate` to inspect page structure
3. **Generate** — LLM proposes selector candidates with rationale
4. **Validate** — Test selectors against the live page
5. **Export** — Save validated selectors for procedural extraction

See the complete [Selector Discovery Workflow Guide](.planning/guides/selector-discovery-workflow.md) for detailed instructions, examples, and best practices.

### Available Tools

Key tools for selector discovery and browser automation:

| Tool | Purpose |
|------|---------|
| `navigate` | Navigate to a URL, wait for `DOMContentLoaded` and up to five more seconds for `load`, then return a snapshot |
| `snapshot` | Get a best-effort DOM snapshot with the page URL, title, text, control states, and interactive refs |
| `screenshot` | Capture visual screenshot |
| `evaluate` | Execute JavaScript for inspection |
| `click` | Send a synthetic click, wait for observed navigation or requests, then return a snapshot. Stale refs require a new snapshot |
| `type` | Type text into inputs |
| `select_option` | Select dropdown options |
| `wait_for` | Wait for conditions (time, text appear/disappear) |

## Local Development

### Prerequisites

- Node.js 18+ and npm
- PartyBrowser extension installed and enabled (Chrome or Firefox)

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

### Firefox Extension Installation

You can also build and use the Firefox extension for cross-browser automation:

**Build the extension:**

```bash
# Build just the Firefox extension XPI
npm run build:xpi

# Or build both server and extension
npm run build:all
```

**Install in Firefox Developer Edition:**

> ⚠️ **Important:** Regular Firefox requires signed extensions from Mozilla Add-ons. For development and testing, use Firefox Developer Edition which allows loading unsigned extensions.

1. Download and install [Firefox Developer Edition](https://www.mozilla.org/en-US/firefox/developer/)
2. Open Firefox Developer Edition
3. Navigate to `about:debugging`
4. Click "This Firefox" in the left sidebar
5. Click "Load Temporary Add-on..."
6. Navigate to `dist/browser-mcp-firefox.xpi` and select it
7. The extension will appear in your toolbar

**Verification:**

- Click the PartyBrowser icon in the toolbar to open the popup
- Status should show "Connected" when the MCP server is running
- You can now use the MCP tools in Firefox

### Running the Server

Start the MCP server for local development:

```bash
# Start the server (stdio mode for MCP clients)
node dist/index.js
```

**Important:** The server starts successfully even without a browser tab connected. This is expected behavior. Tool calls will fail with connection errors until you:

1. Open the PartyBrowser extension in Chrome or Firefox
2. Ensure the extension shows "Connected" status
3. Have at least one browser tab open

Session targeting:
- Each approved session controls its own tab. Takeover uses the active tab when you approve the request.
- Takeover moves the tab into a gray group named `✨`. Release restores its original group and position.
- If takeover removed a single-tab group, release recreates its saved name, color, and collapsed state.
- If an original group disappears later, release leaves the tab ungrouped instead of recreating that group.
- Tab groups require Firefox 139 or later.
- Per-call `tabId` overrides are not supported.

### Keep Hub Running with systemd (user service)

1. Build the hub artifact from this checkout:

```bash
pnpm --filter ./packages/hub build
```

2. Install and start the user service:

```bash
pnpm run service:install
```

3. Check service status:

```bash
pnpm run service:status
```

4. Tail logs:

```bash
pnpm run service:logs
```

5. Uninstall and stop the service:

```bash
pnpm run service:uninstall
```

Notes:
- The unit file is written to `~/.config/systemd/user/partybrowser-hub.service`.
- `ExecStart` uses this repository checkout and the current Node executable path.
- If you want the user service to run without an active login session, run `loginctl enable-linger $USER` once.
- If `systemctl --user` cannot connect to the bus, run these commands from a login session with the user systemd bus available.

### Using with OpenCode (local checkout)

If this repo is already checked out on your machine, you can point OpenCode at this local build directly.

1. Build the MCP server and Firefox extension:

```bash
npm install
npm run build
npm run build:xpi
```

2. Install the extension in Firefox Developer Edition:
   - Open `about:debugging`
   - Click "This Firefox" -> "Load Temporary Add-on..."
   - Select `dist/browser-mcp-firefox.xpi`

3. Add an MCP entry to `opencode.json` (project root) or `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "browsermcp": {
      "type": "local",
      "command": ["node", "/path/to/browser-mcp/dist/index.js"],
      "enabled": true
    }
  }
}
```

4. Verify OpenCode sees the server:

```bash
opencode mcp list
```

5. In OpenCode, run a prompt that explicitly uses the MCP tools:

```text
Use the browsermcp tools to navigate to https://example.com and return a page snapshot.
```

Notes:
- OpenCode starts this MCP process from the configured `command`; you do not need to run `node dist/index.js` separately.
- If commands fail with connection errors, click the PartyBrowser toolbar icon to ensure communications are enabled.
- If OpenCode cannot start the server, re-check the `command` path and rebuild with `npm run build`.

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `navigate` fails with connection error | No browser tab connected | Open browser extension, ensure it shows "Connected" |
| Commands fail with "Session tab unavailable" | The bound session tab was closed or never bound | Focus target tab and reconnect PartyBrowser session |
| Tool calls fail with "Browser transport unavailable" and port-in-use message | Another PartyBrowser process already owns the WebSocket port | Close other PartyBrowser sessions, then restart this MCP process |
| Smoke test fails with "Server binary not found" | Build artifacts missing | Run `npm run build` first |
| Extension shows "Disconnected" | Server not running or port issue | Verify server is running, check extension settings |
| **Firefox:** "Extension could not be installed" | Using regular Firefox | Use Firefox Developer Edition for unsigned extensions |
| **Firefox:** "Connection failed" | MCP server not running or port blocked | Ensure server is running and port 3456 is available |
| **Firefox:** Permission denied errors | Extension lacks permissions | Check `about:addons` > PartyBrowser > Permissions |

### Development Workflow

1. Make changes to source files in `src/`
2. Run `npm run build` to compile
3. Run `npm run smoke` to verify
4. Test with MCP client (VS Code, Claude Desktop, etc.)

## Contributing

This repo contains all the core MCP code for PartyBrowser, but currently cannot yet be built on its own due to dependencies on utils and types from the monorepo where it's developed.

## Credits

PartyBrowser was adapted from the [Playwright MCP server](https://github.com/microsoft/playwright-mcp) in order to automate the user's browser rather than creating new browser instances. This allows using the user's existing browser profile to use logged-in sessions and avoid bot detection mechanisms that commonly block automated browser use.
