#!/usr/bin/env node
/**
 * MCP Smoke Test - Tool Registration Verification
 *
 * This script verifies that the MCP server starts successfully
 * and registers the required Phase 1 tools.
 *
 * Usage: node scripts/smoke-list-tools.mjs
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Required Phase 1 tools that must be registered
const REQUIRED_TOOLS = [
  "navigate",
  "wait_for",
  "snapshot",
  "close",
];

// Colors for terminal output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Send a JSON-RPC request to the MCP server
 */
function sendRequest(stdin, method, params, id) {
  const request = {
    jsonrpc: "2.0",
    method,
    params,
    id,
  };
  stdin.write(JSON.stringify(request) + "\n");
}

/**
 * Wait for a specific response from the MCP server
 */
async function waitForResponse(stdout, targetId, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const buffer = [];
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for response with id ${targetId}`));
    }, timeout);

    function onData(data) {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          if (response.id === targetId) {
            clearTimeout(timer);
            stdout.off("data", onData);
            resolve(response);
            return;
          }
        } catch {
          // Ignore non-JSON lines
          buffer.push(line);
        }
      }
    }

    stdout.on("data", onData);
  });
}

/**
 * Main smoke test function
 */
async function runSmokeTest() {
  const serverPath = join(__dirname, "..", "dist", "index.js");

  log("🔍 MCP Smoke Test Starting...", "blue");
  log(`   Server: ${serverPath}`, "reset");
  log("");

  // Check if dist/index.js exists
  try {
    await import("fs").then(fs => fs.promises.access(serverPath));
  } catch {
    log("❌ Server binary not found. Run 'npm run build' first.", "red");
    process.exit(1);
  }

  // Spawn the MCP server
  log("📡 Starting MCP server...", "yellow");
  const server = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let serverOutput = "";
  server.stderr.on("data", (data) => {
    serverOutput += data.toString();
  });

  try {
    // Step 1: Send initialize request
    log("🤝 Sending initialize request...", "yellow");
    const initId = 1;
    sendRequest(server.stdin, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "smoke-test",
        version: "1.0.0",
      },
    }, initId);

    const initResponse = await waitForResponse(server.stdout, initId);
    if (initResponse.error) {
      throw new Error(`Initialize failed: ${initResponse.error.message}`);
    }
    log("   ✓ Server initialized successfully", "green");

    // Step 2: Send initialized notification
    server.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      method: "initialized",
      params: {},
    }) + "\n");

    // Step 3: List tools
    log("📋 Requesting tool list...", "yellow");
    const toolsId = 2;
    sendRequest(server.stdin, "tools/list", {}, toolsId);

    const toolsResponse = await waitForResponse(server.stdout, toolsId);
    if (toolsResponse.error) {
      throw new Error(`Failed to list tools: ${toolsResponse.error.message}`);
    }

    const tools = toolsResponse.result?.tools || [];
    const toolNames = tools.map(t => t.name).sort();

    log(`   ✓ Server registered ${tools.length} tools`, "green");

    // Step 4: Verify required tools
    log("", "reset");
    log("🔎 Verifying required Phase 1 tools:", "blue");

    const missing = [];
    const found = [];

    for (const tool of REQUIRED_TOOLS) {
      if (toolNames.includes(tool)) {
        found.push(tool);
        log(`   ✓ ${tool}`, "green");
      } else {
        missing.push(tool);
        log(`   ✗ ${tool} (MISSING)`, "red");
      }
    }

    // Step 5: Report results
    log("", "reset");
    log("═══════════════════════════════════════", "blue");

    if (missing.length === 0) {
      log("✅ ALL CHECKS PASSED", "green");
      log(`   Found ${found.length}/${REQUIRED_TOOLS.length} required tools`, "green");
      log(`   Total registered: ${tools.length} tools`, "green");
      log("═══════════════════════════════════════", "blue");
      return { success: true, tools: toolNames };
    } else {
      log("❌ CHECKS FAILED", "red");
      log(`   Missing ${missing.length} required tools:`, "red");
      missing.forEach(t => log(`     - ${t}`, "red"));
      log("═══════════════════════════════════════", "blue");
      return { success: false, missing, tools: toolNames };
    }

  } catch (error) {
    log("", "reset");
    log("═══════════════════════════════════════", "red");
    log("❌ SMOKE TEST FAILED", "red");
    log(`   Error: ${error.message}`, "red");

    if (serverOutput) {
      log("", "reset");
      log("📄 Server stderr output:", "yellow");
      console.log(serverOutput);
    }

    log("═══════════════════════════════════════", "red");
    return { success: false, error: error.message };
  } finally {
    // Clean up
    server.stdin.end();
    server.kill();
  }
}

// Run the smoke test
runSmokeTest().then((result) => {
  process.exit(result.success ? 0 : 1);
}).catch((error) => {
  log("", "reset");
  log("💥 UNEXPECTED ERROR", "red");
  console.error(error);
  process.exit(1);
});
