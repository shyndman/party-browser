import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "tsup";

const hubPackage = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

const hubBuildVersion = hubPackage.version;
const hubBuildCommit = execSync("git rev-parse --short=7 HEAD", { encoding: "utf8" }).trim();
const hubBuildDirty = execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
const hubBuildTimestamp = new Date().toISOString();

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  clean: true,
  esbuildOptions(options) {
    options.alias = {
      "@": path.resolve(__dirname, "src"),
    };

    options.define = {
      ...(options.define ?? {}),
      __HUB_BUILD_VERSION__: JSON.stringify(hubBuildVersion),
      __HUB_BUILD_COMMIT__: JSON.stringify(hubBuildCommit),
      __HUB_BUILD_DIRTY__: String(hubBuildDirty),
      __HUB_BUILD_TIMESTAMP__: JSON.stringify(hubBuildTimestamp),
    };
  },
});
