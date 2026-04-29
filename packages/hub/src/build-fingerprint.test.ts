import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import packageJSON from "../package.json";

import { formatHubBuildFingerprintLines, getHubBuildFingerprintLines } from "@/build-fingerprint";

test("formatHubBuildFingerprintLines returns clean two-line output", () => {
  const lines = formatHubBuildFingerprintLines({
    version: "1.2.3",
    commit: "abcdef0",
    dirty: false,
    builtAt: "2026-03-08T20:00:00.000Z",
  });

  assert.deepEqual(lines, ["v1.2.3", "built at 2026-03-08T20:00:00.000Z"]);
});

test("formatHubBuildFingerprintLines returns dirty output with starred hash", () => {
  const lines = formatHubBuildFingerprintLines({
    version: "1.2.3",
    commit: "abcdef0",
    dirty: true,
    builtAt: "2026-03-08T20:00:00.000Z",
  });

  assert.deepEqual(lines, ["v1.2.3 (abcdef0*)", "built at 2026-03-08T20:00:00.000Z"]);
});

test("getHubBuildFingerprintLines maps compile-time globals into line tuple", async () => {
  const sourcePath = new URL("./build-fingerprint.ts", import.meta.url);
  const moduleSource = readFileSync(sourcePath, "utf8");
  const runtimeSource = moduleSource
    .replace('import packageJSON from "../package.json";', 'const packageJSON = { version: "0.0.0" };')
    .replace(
      "declare const __HUB_BUILD_VERSION__: string;",
      'const __HUB_BUILD_VERSION__ = "9.9.9";',
    )
    .replace(
      "declare const __HUB_BUILD_COMMIT__: string;",
      'const __HUB_BUILD_COMMIT__ = "1234abc";',
    )
    .replace("declare const __HUB_BUILD_DIRTY__: boolean;", "const __HUB_BUILD_DIRTY__ = true;")
    .replace(
      "declare const __HUB_BUILD_TIMESTAMP__: string;",
      'const __HUB_BUILD_TIMESTAMP__ = "2026-03-08T21:00:00.000Z";',
    );

  const tempDir = mkdtempSync(path.join(tmpdir(), "hub-build-fingerprint-"));
  const tempModulePath = path.join(tempDir, "build-fingerprint.runtime.ts");

  writeFileSync(tempModulePath, runtimeSource, "utf8");

  try {
    const runtimeModule = (await import(
      `${pathToFileURL(tempModulePath).href}?t=${Date.now()}`
    )) as {
      getHubBuildFingerprintLines: () => [string, string];
    };

    assert.deepEqual(runtimeModule.getHubBuildFingerprintLines(), [
      "v9.9.9 (1234abc*)",
      "built at 2026-03-08T21:00:00.000Z",
    ]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("getHubBuildFingerprintLines falls back in source mode without injected globals", () => {
  assert.deepEqual(getHubBuildFingerprintLines(), [
    `v${packageJSON.version} (source*)`,
    "built at source mode",
  ]);
});
