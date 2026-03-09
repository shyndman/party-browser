#!/usr/bin/env node
import { spawnSync } from "child_process";
import { constants } from "fs";
import { access, mkdir, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const SERVICE_NAME = "partybrowser-hub.service";
const SERVICE_DESCRIPTION = "PartyBrowser Hub";
const NODE_ENV = "production";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "..");
const hubWorkingDirectory = resolve(repoRoot, "packages", "hub");
const hubEntrypoint = resolve(hubWorkingDirectory, "dist", "index.js");
const serviceDirectory = join(homedir(), ".config", "systemd", "user");
const servicePath = join(serviceDirectory, SERVICE_NAME);

function runSystemctl(args) {
  const result = spawnSync("systemctl", args, {
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const output = `${result.stdout}${result.stderr}`.trim();
    throw new Error(output || `systemctl ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

async function main() {
  try {
    await access(hubEntrypoint, constants.R_OK);
  } catch {
    console.error(`Hub build artifact not found at ${hubEntrypoint}`);
    console.error("Run `pnpm --filter ./packages/hub build` before installing the service.");
    process.exit(1);
  }

  await mkdir(serviceDirectory, { recursive: true });

  const serviceContents = `[Unit]\nDescription=${SERVICE_DESCRIPTION}\nAfter=default.target\n\n[Service]\nType=simple\nWorkingDirectory=${hubWorkingDirectory}\nExecStart=${process.execPath} ${hubEntrypoint}\nRestart=always\nRestartSec=2\nEnvironment=NODE_ENV=${NODE_ENV}\n\n[Install]\nWantedBy=default.target\n`;

  await writeFile(servicePath, serviceContents, "utf8");

  runSystemctl(["--user", "daemon-reload"]);
  runSystemctl(["--user", "enable", "--now", SERVICE_NAME]);

  console.log(`Installed and started ${SERVICE_NAME}`);
  console.log(`Service file: ${servicePath}`);
}

main().catch((error) => {
  console.error(`Failed to install ${SERVICE_NAME}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
