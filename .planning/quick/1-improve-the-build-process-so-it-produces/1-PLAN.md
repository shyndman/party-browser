---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - extension/manifest.json
  - extension/background.js
  - extension/content-script.js
  - extension/popup.html
  - extension/popup.js
  - extension/icons/icon-48.png
  - extension/icons/icon-96.png
  - scripts/build-xpi.mjs
  - package.json
  - README.md
autonomous: true
must_haves:
  truths:
    - Firefox extension builds successfully with npm run build:xpi
    - XPI file is well-formed and ready for Firefox Developer Edition
    - Extension can be installed in Firefox Developer Edition
    - Extension manifest follows Firefox WebExtension API standards
    - Build script handles packaging and naming correctly
  artifacts:
    - path: extension/manifest.json
      provides: Firefox extension manifest (v2 for max compatibility)
      min_lines: 20
    - path: extension/background.js
      provides: Background script for WebSocket server communication
      min_lines: 30
    - path: extension/content-script.js
      provides: Content script for page interaction and DOM access
      min_lines: 50
    - path: extension/popup.html
      provides: Extension popup UI
      min_lines: 20
    - path: extension/popup.js
      provides: Popup interaction logic
      min_lines: 30
    - path: scripts/build-xpi.mjs
      provides: XPI build and packaging script
      min_lines: 50
    - path: dist/browser-mcp-firefox.xpi
      provides: Packaged Firefox extension ready to install
  key_links:
    - from: extension/manifest.json
      to: extension/background.js
      via: background.scripts array
      pattern: "background"
    - from: extension/manifest.json
      to: extension/content-script.js
      via: content_scripts matches
      pattern: "content_scripts"
    - from: extension/manifest.json
      to: extension/popup.html
      via: browser_action or action
      pattern: "browser_action|action"
    - from: scripts/build-xpi.mjs
      to: extension/
      via: zip creation
      pattern: "extension/"
    - from: package.json
      to: scripts/build-xpi.mjs
      via: npm run build:xpi
      pattern: "build:xpi"
---

<objective>
Create a complete Firefox extension build process that produces a well-formed XPI package ready to install in Firefox Developer Edition.

Purpose: Enable Firefox browser automation by creating the browser extension component and automated build tooling that packages it correctly.
Output: Working Firefox extension with npm build script that produces an installable XPI file.
</objective>

<execution_context>
@./.opencode/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md
@.planning/research/ARCHITECTURE.md

The project is an MCP server for browser automation that communicates with a browser extension via WebSocket. The extension needs to:
1. Start a WebSocket server that the MCP server connects to
2. Execute browser commands (navigate, click, type, snapshot, etc.)
3. Return results back to the MCP server

The extension communicates with content scripts for page interaction and background script for WebSocket management.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Firefox extension structure</name>
  <files>
    extension/manifest.json
    extension/background.js
    extension/content-script.js
    extension/popup.html
    extension/popup.js
    extension/icons/icon-48.png
    extension/icons/icon-96.png
  </files>
  <action>
    Create the Firefox extension directory structure with all necessary files:

    1. **extension/manifest.json** - Firefox WebExtension manifest v2:
       - manifest_version: 2 (for maximum Firefox compatibility)
       - name: "Browser MCP"
       - version: "0.1.3" (match package.json)
       - description: "MCP server browser automation extension"
       - permissions: ["activeTab", "tabs", "storage", "<all_urls>"]
       - background: { scripts: ["background.js"], persistent: true }
       - content_scripts: [{ matches: ["<all_urls>"], js: ["content-script.js"], run_at: "document_end" }]
       - browser_action: { default_popup: "popup.html", default_title: "Browser MCP" }
       - web_accessible_resources: ["*"]
       - icons: { 48: "icons/icon-48.png", 96: "icons/icon-96.png" }

    2. **extension/background.js** - Background script for WebSocket server:
       - Create WebSocket server on configurable port (default 9876)
       - Handle incoming connections from MCP server
       - Route commands to content scripts via tabs.sendMessage
       - Handle responses and send back to WebSocket client
       - Implement browser command handlers: navigate, click, type, evaluate, screenshot, etc.
       - Use browser.tabs API for navigation and tab management
       - Use browser.runtime.sendMessage for content script communication
       - Log connection status and errors for debugging

    3. **extension/content-script.js** - Content script for page interaction:
       - Listen for messages from background script
       - Implement DOM query and manipulation functions
       - Handle accessibility tree snapshot generation
       - Execute JavaScript evaluation safely
       - Handle element interaction (click, type, select)
       - Return structured results with element refs
       - Support ARIA snapshot generation matching existing MCP protocol

    4. **extension/popup.html** - Extension popup UI:
       - Simple HTML structure showing connection status
       - Display "Connected" or "Disconnected" based on MCP server status
       - Show active tab count
       - Link to documentation
       - Include minimal styling inline

    5. **extension/popup.js** - Popup interaction logic:
       - Query background script for connection status
       - Display status in popup HTML
       - Handle popup open/close events
       - Update UI dynamically based on state

    6. **extension/icons/icon-48.png** and **icon-96.png**:
       - Create simple placeholder icons (can use SVG-to-PNG or simple canvas generation)
       - Or create text-based icons programmatically
       - Icons should be square (48x48 and 96x96)
       - Use browser-like iconography

    All files should follow Firefox WebExtension API patterns (using `browser.*` namespace, not `chrome.*`).
  </action>
  <verify>
    ls -la extension/ && cat extension/manifest.json | grep -q "manifest_version"
  </verify>
  <done>
    Extension directory exists with all required files, manifest.json is valid Firefox v2 format
  </done>
</task>

<task type="auto">
  <name>Task 2: Create XPI build script</name>
  <files>
    scripts/build-xpi.mjs
  </files>
  <action>
    Create **scripts/build-xpi.mjs** - Node.js script to build Firefox XPI package:

    The script should:
    1. Read version from package.json for consistent naming
    2. Create a clean temp directory for packaging
    3. Copy all extension files to temp directory:
       - manifest.json
       - background.js
       - content-script.js
       - popup.html
       - popup.js
       - icons/ directory with icon files
    4. Create a well-formed XPI file (ZIP format with .xpi extension):
       - Output to dist/browser-mcp-firefox.xpi
       - Use proper ZIP compression
       - Ensure files are at root level in archive (not in subdirectories)
    5. Validate the XPI:
       - Check manifest.json exists in archive
       - Verify it's valid JSON
       - Check required fields present
    6. Generate install.rdf fallback for older Firefox versions (optional but recommended)
    7. Print success message with:
       - XPI file path
       - File size
       - Installation instructions for Firefox Developer Edition
    8. Clean up temp directory

    Use Node.js built-in modules (fs, path, child_process) and a ZIP library (archiver or adm-zip via dynamic import).
    Make the script executable with proper shebang and permissions.
  </action>
  <verify>
    node scripts/build-xpi.mjs && ls -lh dist/browser-mcp-firefox.xpi
  </verify>
  <done>
    Build script executes successfully and produces dist/browser-mcp-firefox.xpi
  </done>
</task>

<task type="auto">
  <name>Task 3: Add npm build script and documentation</name>
  <files>
    package.json
    README.md
  </files>
  <action>
    Update **package.json** and **README.md** to integrate the XPI build:

    1. **Update package.json scripts section**:
       - Add: "build:xpi": "node scripts/build-xpi.mjs"
       - Add: "build:all": "npm run build && npm run build:xpi" (builds both server and extension)
       - Update description to mention Firefox extension support

    2. **Update README.md** with Firefox Developer Edition installation instructions:
       - Add section: "Firefox Extension Installation"
       - Include steps:
         1. Build the extension: `npm run build:xpi`
         2. Open Firefox Developer Edition
         3. Navigate to about:debugging
         4. Click "This Firefox" > "Load Temporary Add-on"
         5. Select the generated dist/browser-mcp-firefox.xpi file
         6. Extension should appear in toolbar
       - Add troubleshooting section:
         - "Extension not loading" - check Firefox Developer Edition (regular Firefox doesn't allow unsigned extensions)
         - "Connection failed" - ensure MCP server is running and port 9876 is available
         - "Permission denied" - check extension permissions in about:addons
       - Update "Local Development" section to mention both Chrome and Firefox
       - Update "Features" to mention Firefox support

    Ensure all documentation follows the existing style and tone.
    Update any existing references that only mention Chrome to be browser-agnostic or mention both.
  </action>
  <verify>
    npm run build:xpi && ls -lh dist/browser-mcp-firefox.xpi && grep -q "Firefox" README.md
  </verify>
  <done>
    npm run build:xpi works and README documents Firefox installation steps
  </done>
</task>

</tasks>

<verification>
- Run `npm run build:xpi` and verify dist/browser-mcp-firefox.xpi is created
- Check XPI is valid ZIP: `unzip -l dist/browser-mcp-firefox.xpi | grep manifest.json`
- Verify manifest.json in XPI contains required Firefox extension fields
- Check file size is reasonable (should include all extension files)
- Verify README.md contains Firefox Developer Edition installation instructions
</verification>

<success_criteria>
1. Firefox extension files exist in extension/ directory
2. `npm run build:xpi` produces dist/browser-mcp-firefox.xpi
3. XPI is a valid ZIP archive containing manifest.json and all extension files
4. README documents how to install in Firefox Developer Edition
5. Extension manifest uses Firefox WebExtension API v2 format
6. Extension includes WebSocket server logic for MCP communication
</success_criteria>

<output>
After completion, create `.planning/quick/1-improve-the-build-process-so-it-produces/1-SUMMARY.md` documenting:
- Firefox extension structure created
- Build script and npm command added
- Installation process for Firefox Developer Edition
</output>
