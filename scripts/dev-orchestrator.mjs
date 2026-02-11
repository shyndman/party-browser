#!/usr/bin/env node
/**
 * Dev orchestrator - runs MCP server (via mcptools) and extension dev in parallel
 * 
 * Per user decisions:
 * - Umbrella dev launches both MCP and extension dev flows
 * - Extension connects to MCP server started by mcptools
 * - Fail fast on first error
 * - Actionable error messaging
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const processes = [];
let hasError = false;

function log(message, type = 'info') {
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✓' : 'ℹ';
  console.log(`[${prefix}] ${message}`);
}

function spawnProcess(name, command, args, cwd) {
  log(`Starting ${name}...`);
  
  const proc = spawn(command, args, {
    cwd,
    stdio: 'pipe',
    shell: true
  });
  
  processes.push({ name, proc });
  
  proc.stdout.on('data', (data) => {
    process.stdout.write(`[${name}] ${data}`);
  });
  
  proc.stderr.on('data', (data) => {
    process.stderr.write(`[${name}] ${data}`);
  });
  
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

// Pre-flight checks
log('Running pre-flight checks...');

// Check if mcptools is available
const mcptoolsCheck = spawn('which', ['mcp'], { shell: true });
mcptoolsCheck.on('exit', (code) => {
  if (code !== 0) {
    log('mcptools not found. Install with: npm install -g mcptools', 'error');
    process.exit(1);
  }
  
  log('Pre-flight checks passed', 'success');
  
  // Start MCP server via mcptools (port 6277 for proxy)
  spawnProcess(
    'mcp-server',
    'mcp',
    ['web', '--port', '6277', 'node', 'packages/mcp/dist/index.js'],
    rootDir
  );
  
  // Start extension dev
  spawnProcess(
    'extension',
    'pnpm',
    ['--filter', './packages/extension', 'dev'],
    rootDir
  );
  
  log('Both dev processes started. Press Ctrl+C to stop.');
});
