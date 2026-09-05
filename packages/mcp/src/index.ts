#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { program } from "commander";

import { appConfig } from "@/config/app.config";
import { createHubConnection, type HubConnection } from "@/messaging";

import type { Resource } from "@/resources/resource";
import { createServerWithTools } from "@/server";
import { Context } from "@/session";
import * as common from "@/tools/common";
import * as custom from "@/tools/custom";
import { evaluate } from "@/tools/evaluate";
import * as inspection from "@/tools/inspection";
import * as snapshot from "@/tools/snapshot";
import type { Tool } from "@/tools/tool";

import packageJSON from "../package.json";

function setupExitWatchdog(server: Server) {
  process.stdin.on("close", async () => {
    setTimeout(() => process.exit(0), 15000);
    await server.close();
    process.exit(0);
  });
}

const commonTools: Tool[] = [
  common.joinSession,
  common.pressKey,
  common.wait,
  common.waitFor,
  common.close,
];

const customTools: Tool[] = [
  custom.screenshot,
  evaluate,
  inspection.networkRequests,
  inspection.networkRequestDetails,
  inspection.consoleMessages,
];

const snapshotTools: Tool[] = [
  common.navigate(true),
  common.goBack(true),
  common.goForward(true),
  snapshot.snapshot,
  snapshot.click,
  snapshot.hover,
  snapshot.type,
  snapshot.selectOption,
  ...commonTools,
  ...customTools,
];

const resources: Resource[] = [];

async function createServer(context?: Context): Promise<Server> {
  return createServerWithTools({
    name: appConfig.name,
    version: packageJSON.version,
    tools: snapshotTools,
    resources,
    context,
  });
}

type StartServerOptions = {
  createHubConnection?: () => HubConnection;
  createServer?: (context: Context) => Promise<Server>;
  createTransport?: () => StdioServerTransport;
};

export async function startServer(options: StartServerOptions = {}): Promise<Server> {
  const hubConnectionFactory = options.createHubConnection ?? createHubConnection;
  const serverFactory = options.createServer ?? createServer;
  const transportFactory = options.createTransport ?? (() => new StdioServerTransport());
  const hubConnection = hubConnectionFactory();
  await hubConnection.probe();

  const server = await serverFactory(new Context(hubConnection));
  setupExitWatchdog(server);

  const transport = transportFactory();
  await server.connect(transport);
  return server;
}

function isEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  return typeof entrypoint === "string" && import.meta.url === pathToFileURL(entrypoint).href;
}

/**
 * Note: Tools must be defined *before* calling `createServer` because only declarations are hoisted, not the initializations
 */
program
  .version("Version " + packageJSON.version)
  .name(packageJSON.name)
  .action(async () => {
    await startServer();
  });

if (isEntrypoint()) {
  program.parse(process.argv);
}
