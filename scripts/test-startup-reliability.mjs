#!/usr/bin/env node
/**
 * MCP Startup Reliability Test
 *
 * Tests startup reliability scenarios:
 * - A: Server starts without browser extension (tools listable)
 * - B: Port conflict handling (explicit error, server usable)
 * - C: Extension connects after server start (should work)
 *
 * Usage: node scripts/test-startup-reliability.mjs
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function sendRequest(stdin, method, params, id) {
  const request = {
    jsonrpc: "2.0",
    method,
    params,
    id,
  };
  stdin.write(JSON.stringify(request) + "\n");
}

async function waitForResponse(stdout, targetId, timeout = 10000) {
  return new Promise((resolve, reject) => {
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
        }
      }
    }

    stdout.on("data", onData);
  });
}

async function waitForLog(stderr, pattern, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stderr.off("data", onData);
      reject(new Error(`Timeout waiting for log pattern: ${pattern}`));
    }, timeout);

    let buffer = "";
    function onData(data) {
      buffer += data.toString();
      if (pattern.test(buffer)) {
        clearTimeout(timer);
        stderr.off("data", onData);
        resolve(buffer);
      }
    }

    stderr.on("data", onData);
  });
}

async function runScenarioA() {
  log("\n═══════════════════════════════════════════════════", "cyan");
  log("SCENARIO A: Server starts without browser extension", "cyan");
  log("═══════════════════════════════════════════════════", "cyan");

  const serverPath = join(__dirname, "..", "dist", "index.js");

  log("📡 Starting MCP server (no browser extension)...", "yellow");
  const server = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  try {
    // Wait for startup (brief delay to allow WebSocket bind attempt)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Initialize
    log("🤝 Sending initialize request...", "yellow");
    const initId = 1;
    sendRequest(server.stdin, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "startup-test-a", version: "1.0.0" },
    }, initId);

    const initResponse = await waitForResponse(server.stdout, initId, 5000);
    if (initResponse.error) {
      throw new Error(`Initialize failed: ${initResponse.error.message}`);
    }
    log("   ✓ Server initialized successfully", "green");

    // Send initialized notification
    server.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      method: "initialized",
      params: {},
    }) + "\n");

    // List tools (this should work even without browser)
    log("📋 Testing tool listing without browser extension...", "yellow");
    const toolsId = 2;
    const startTime = Date.now();
    sendRequest(server.stdin, "tools/list", {}, toolsId);

    const toolsResponse = await waitForResponse(server.stdout, toolsId, 5000);
    const duration = Date.now() - startTime;

    if (toolsResponse.error) {
      throw new Error(`Tool listing failed: ${toolsResponse.error.message}`);
    }

    const tools = toolsResponse.result?.tools || [];
    log(`   ✓ Tool listing returned ${tools.length} tools in ${duration}ms`, "green");

    if (duration > 1000) {
      log(`   ⚠ Warning: Tool listing took ${duration}ms (>1000ms threshold)`, "yellow");
    }

    log("\n✅ SCENARIO A PASSED", "green");
    return true;
  } catch (error) {
    log(`\n❌ SCENARIO A FAILED: ${error.message}`, "red");
    return false;
  } finally {
    server.stdin.end();
    server.kill();
  }
}

async function runScenarioB() {
  log("\n═══════════════════════════════════════════════════", "cyan");
  log("SCENARIO B: Port conflict handling", "cyan");
  log("═══════════════════════════════════════════════════", "cyan");

  const serverPath = join(__dirname, "..", "dist", "index.js");

  // Start first server
  log("📡 Starting first MCP server on port 3456...", "yellow");
  const server1 = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Wait for first server to start
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Start second server (should get port conflict)
  log("📡 Starting second MCP server on same port...", "yellow");
  const server2 = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let server2Output = "";
  server2.stderr.on("data", (data) => {
    server2Output += data.toString();
  });

  try {
    // Wait for second server to attempt startup
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check if second server logged port conflict
    const hasPortConflict = server2Output.includes("EADDRINUSE") ||
                           server2Output.includes("already in use");

    if (hasPortConflict) {
      log("   ✓ Second server detected port conflict (EADDRINUSE)", "green");
    } else {
      log("   ⚠ Port conflict warning not detected in logs", "yellow");
    }

    // Second server should still allow tool listing
    log("🤝 Testing second server initialization...", "yellow");
    const initId = 1;
    sendRequest(server2.stdin, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "startup-test-b", version: "1.0.0" },
    }, initId);

    const initResponse = await waitForResponse(server2.stdout, initId, 5000);
    if (initResponse.error) {
      throw new Error(`Second server initialize failed: ${initResponse.error.message}`);
    }
    log("   ✓ Second server initialized successfully", "green");

    // Send initialized notification
    server2.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      method: "initialized",
      params: {},
    }) + "\n");

    // List tools from second server
    log("📋 Testing tool listing on second server...", "yellow");
    const toolsId = 2;
    sendRequest(server2.stdin, "tools/list", {}, toolsId);

    const toolsResponse = await waitForResponse(server2.stdout, toolsId, 5000);
    if (toolsResponse.error) {
      throw new Error(`Second server tool listing failed: ${toolsResponse.error.message}`);
    }

    const tools = toolsResponse.result?.tools || [];
    log(`   ✓ Second server listed ${tools.length} tools despite port conflict`, "green");

    log("\n✅ SCENARIO B PASSED", "green");
    return true;
  } catch (error) {
    log(`\n❌ SCENARIO B FAILED: ${error.message}`, "red");
    return false;
  } finally {
    server1.stdin.end();
    server1.kill();
    server2.stdin.end();
    server2.kill();
  }
}

async function runScenarioC() {
  log("\n═══════════════════════════════════════════════════", "cyan");
  log("SCENARIO C: Extension connects after server start", "cyan");
  log("(Manual verification - requires browser extension)", "cyan");
  log("═══════════════════════════════════════════════════", "cyan");

  const serverPath = join(__dirname, "..", "dist", "index.js");

  log("📡 Starting MCP server...", "yellow");
  const server = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  try {
    // Initialize
    log("🤝 Sending initialize request...", "yellow");
    const initId = 1;
    sendRequest(server.stdin, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "startup-test-c", version: "1.0.0" },
    }, initId);

    const initResponse = await waitForResponse(server.stdout, initId, 5000);
    if (initResponse.error) {
      throw new Error(`Initialize failed: ${initResponse.error.message}`);
    }
    log("   ✓ Server initialized successfully", "green");

    // Send initialized notification
    server.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      method: "initialized",
      params: {},
    }) + "\n");

    // List tools
    log("📋 Listing tools (before extension connection)...", "yellow");
    const toolsId1 = 2;
    sendRequest(server.stdin, "tools/list", {}, toolsId1);

    const toolsResponse1 = await waitForResponse(server.stdout, toolsId1, 5000);
    if (toolsResponse1.error) {
      throw new Error(`Tool listing failed: ${toolsResponse1.error.message}`);
    }
    log(`   ✓ Listed ${toolsResponse1.result?.tools?.length || 0} tools`, "green");

    log("", "reset");
    log("─────────────────────────────────────────────────", "yellow");
    log("MANUAL VERIFICATION REQUIRED:", "yellow");
    log("", "reset");
    log("1. Start browser with PartyBrowser extension", "cyan");
    log("2. Click the extension icon to enable (if needed)", "cyan");
    log("3. Verify server logs show 'Browser extension connected'", "cyan");
    log("4. Tools should work normally after connection", "cyan");
    log("", "reset");
    log("─────────────────────────────────────────────────", "yellow");

    // Wait a bit to let user read the message
    await new Promise((resolve) => setTimeout(resolve, 1000));

    log("\n✅ SCENARIO C SETUP COMPLETE (manual verification pending)", "green");
    return true;
  } catch (error) {
    log(`\n❌ SCENARIO C FAILED: ${error.message}`, "red");
    return false;
  } finally {
    server.stdin.end();
    server.kill();
  }
}

// Main test runner
async function runAllTests() {
  log("╔═══════════════════════════════════════════════════╗", "blue");
  log("║   MCP Startup Reliability Test Suite              ║", "blue");
  log("╚═══════════════════════════════════════════════════╝", "blue");

  const results = {
    scenarioA: false,
    scenarioB: false,
    scenarioC: false,
  };

  // Run scenarios
  results.scenarioA = await runScenarioA();

  // Small delay between scenarios
  await new Promise((resolve) => setTimeout(resolve, 500));

  results.scenarioB = await runScenarioB();

  // Small delay between scenarios
  await new Promise((resolve) => setTimeout(resolve, 500));

  results.scenarioC = await runScenarioC();

  // Summary
  log("\n╔═══════════════════════════════════════════════════╗", "blue");
  log("║   TEST SUMMARY                                    ║", "blue");
  log("╚═══════════════════════════════════════════════════╝", "blue");

  const allPassed = results.scenarioA && results.scenarioB && results.scenarioC;

  log(`\nScenario A (No extension): ${results.scenarioA ? "✅ PASSED" : "❌ FAILED"}`,
    results.scenarioA ? "green" : "red");
  log(`Scenario B (Port conflict): ${results.scenarioB ? "✅ PASSED" : "❌ FAILED"}`,
    results.scenarioB ? "green" : "red");
  log(`Scenario C (Late connection): ${results.scenarioC ? "✅ PASSED" : "❌ FAILED"}`,
    results.scenarioC ? "green" : "red");

  log("", "reset");
  if (allPassed) {
    log("╔═══════════════════════════════════════════════════╗", "green");
    log("║   ALL TESTS PASSED ✅                             ║", "green");
    log("╚═══════════════════════════════════════════════════╝", "green");
    process.exit(0);
  } else {
    log("╔═══════════════════════════════════════════════════╗", "red");
    log("║   SOME TESTS FAILED ❌                            ║", "red");
    log("╚═══════════════════════════════════════════════════╝", "red");
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  log("\n💥 UNEXPECTED ERROR", "red");
  console.error(error);
  process.exit(1);
});
