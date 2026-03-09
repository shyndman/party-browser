#!/usr/bin/env node
import { spawnSync } from "child_process";
import { unlink } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

const SERVICE_NAME = "partybrowser-hub.service";
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

  return {
    status: result.status ?? 1,
    output: `${result.stdout}${result.stderr}`.trim(),
  };
}

function isMissingOrInactiveError(output) {
  return /(not loaded|does not exist|not found|inactive|No such file|No files found)/i.test(output);
}

async function main() {
  const disableResult = runSystemctl(["--user", "disable", "--now", SERVICE_NAME]);
  if (disableResult.status !== 0 && !isMissingOrInactiveError(disableResult.output)) {
    throw new Error(disableResult.output || `systemctl --user disable --now ${SERVICE_NAME} failed`);
  }

  try {
    await unlink(servicePath);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  const reloadResult = runSystemctl(["--user", "daemon-reload"]);
  if (reloadResult.status !== 0) {
    throw new Error(reloadResult.output || "systemctl --user daemon-reload failed");
  }

  const resetFailedResult = runSystemctl(["--user", "reset-failed"]);
  if (resetFailedResult.status !== 0 && !isMissingOrInactiveError(resetFailedResult.output)) {
    throw new Error(resetFailedResult.output || "systemctl --user reset-failed failed");
  }

  console.log(`Uninstalled ${SERVICE_NAME}`);
  console.log(`Removed service file: ${servicePath}`);
}

main().catch((error) => {
  console.error(`Failed to uninstall ${SERVICE_NAME}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
