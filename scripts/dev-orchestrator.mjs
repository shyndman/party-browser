#!/usr/bin/env node
/**
 * Dev orchestrator - runs Hub, Extension, and MCP server in parallel
 *
 * New hub-based architecture:
 * 1. Hub starts first (WebSocket server on port 3456)
 * 2. Extension connects to hub as WebSocket client
 * 3. MCP server uses stdio transport and connects to hub internally
 *
 * Environment variables:
 *   PARTYBROWSER_FIREFOX_BIN - Path to Firefox binary (default: firefox-devedition, fallback: firefox)
 *
 * Fail fast on first error
 * Actionable error messaging
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const processes = [];
let hasError = false;
let startedCount = 0;
let expectedCount = 0;

function log(message, type = 'info') {
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✓' : type === 'warn' ? '⚠' : 'ℹ';
  console.log(`[${prefix}] ${message}`);
}

function spawnProcess(name, command, args, cwd, options = {}) {
  log(`Starting ${name}...`);

  const proc = spawn(command, args, {
    cwd,
    stdio: options.silent ? 'pipe' : 'inherit',
    shell: false,
    env: { ...process.env, ...options.env }
  });

  processes.push({ name, proc });

  if (options.silent) {
    proc.stdout.on('data', (data) => {
      process.stdout.write(`[${name}] ${data}`);
    });

    proc.stderr.on('data', (data) => {
      process.stderr.write(`[${name}] ${data}`);
    });
  }

  proc.on('error', (error) => {
    log(`Failed to start ${name}: ${error.message}`, 'error');
    hasError = true;
    shutdown();
  });

  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      log(`${name} exited with code ${code}`, 'error');
      hasError = true;
      shutdown();
    }
  });

  return proc;
}

function shutdown() {
  log('Shutting down dev processes...');

  for (const { name, proc } of processes) {
    log(`Stopping ${name}...`);
    proc.kill('SIGTERM');
  }

  // Force exit after 5 seconds
  setTimeout(() => {
    log('Force exiting...', 'error');
    process.exit(hasError ? 1 : 0);
  }, 5000);
}

// Handle termination signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Check if command exists
function commandExists(cmd) {
  return new Promise((resolve) => {
    const check = spawn('which', [cmd], { stdio: 'pipe' });
    check.on('exit', (code) => resolve(code === 0));
  });
}

// Find the Firefox binary to use
async function findFirefoxBinary() {
  // Check environment variable first
  const envBrowser = process.env.PARTYBROWSER_FIREFOX_BIN;
  if (envBrowser) {
    if (existsSync(envBrowser)) {
      return envBrowser;
    }
    log(`PARTYBROWSER_FIREFOX_BIN set to '${envBrowser}' but file not found`, 'warn');
  }

  // Default: firefox-devedition
  if (await commandExists('firefox-devedition')) {
    return 'firefox-devedition';
  }

  // Fallback: firefox
  if (await commandExists('firefox')) {
    return 'firefox';
  }

  return null;
}

async function main() {
  // Pre-flight checks
  log('Running pre-flight checks...');

  const hubBuildPath = join(rootDir, 'packages/hub/dist/index.js');
  const mcpBuildPath = join(rootDir, 'packages/mcp/dist/index.js');

  if (!existsSync(hubBuildPath)) {
    log('Hub build not found. Run: pnpm build:hub', 'error');
    process.exit(1);
  }

  if (!existsSync(mcpBuildPath)) {
    log('MCP build not found. Run: pnpm build:mcp', 'error');
    process.exit(1);
  }

  const firefoxBinary = await findFirefoxBinary();
  const hasMcptools = await commandExists('mcptools');

  log('Pre-flight checks passed', 'success');

  // Start Hub first (WebSocket server)
  spawnProcess(
    'hub',
    'node',
    [hubBuildPath],
    rootDir,
    { silent: true }
  );
  startedCount++;
  expectedCount++;

  // Wait for hub to start
  await new Promise(resolve => setTimeout(resolve, 500));

  // Start extension dev (connects to hub) - optional if Firefox not available
  if (firefoxBinary) {
    log(`Using Firefox binary: ${firefoxBinary}`);
    spawnProcess(
      'extension',
      'pnpm',
      ['--filter', './packages/extension', 'dev'],
      rootDir,
      {
        env: {
          BROWSER: firefoxBinary
        }
      }
    );
    startedCount++;
    expectedCount++;
  } else {
    log('Firefox not found. Extension dev server will not be started.', 'warn');
    log('Install Firefox Developer Edition or set PARTYBROWSER_FIREFOX_BIN', 'warn');
  }

  // Start MCP server via mcptools web interface
  if (hasMcptools) {
    spawnProcess(
      'mcp-server',
      'mcptools',
      ['web', '--port', '6277', 'node', mcpBuildPath],
      rootDir
    );
    startedCount++;
    expectedCount++;
  } else {
    log('mcptools not found. MCP server will not be started with web interface.', 'warn');
    log('Install with: go install github.com/f/mcptools/cmd/mcptools@latest', 'warn');
    log('Or run MCP server directly: node packages/mcp/dist/index.js', 'warn');
  }

  // Print URL summary
  const mcpLine = hasMcptools ? '║  🔧 MCP Web UI:     http://localhost:6277                  ║' : '';
  console.log(`
╔════════════════════════════════════════════════════════════╗
║              PartyBrowser Dev Environment URLs             ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  📡 Hub WebSocket:  ws://localhost:3456                    ║
║  🌐 Extension Dev:  http://localhost:3000                  ║
${mcpLine}
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);

  // Print MCP config snippet
  const mcpConfig = {
    command: 'node',
    args: [mcpBuildPath]
  };
  console.log('MCP Server Config (for Claude Desktop, Cursor, etc.):');
  console.log(JSON.stringify({ 'partybrowser': mcpConfig }, null, 2));
  console.log('');

  log(`${startedCount} dev process(es) started. Press Ctrl+C to stop.`);
}

main().catch((error) => {
  log(`Unexpected error: ${error.message}`, 'error');
  shutdown();
});
