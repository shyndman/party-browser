import packageJSON from "../package.json";

export type HubBuildFingerprint = {
  version: string;
  commit: string;
  dirty: boolean;
  builtAt: string;
};

declare const __HUB_BUILD_VERSION__: string;
declare const __HUB_BUILD_COMMIT__: string;
declare const __HUB_BUILD_DIRTY__: boolean;
declare const __HUB_BUILD_TIMESTAMP__: string;

const sourceModeFingerprint: HubBuildFingerprint = {
  version: packageJSON.version,
  commit: "source",
  dirty: true,
  builtAt: "source mode",
};

export function formatHubBuildFingerprintLines(fingerprint: HubBuildFingerprint): [string, string] {
  const versionLine = fingerprint.dirty
    ? `v${fingerprint.version} (${fingerprint.commit}*)`
    : `v${fingerprint.version}`;

  return [versionLine, `built at ${fingerprint.builtAt}`];
}

export function getHubBuildFingerprintLines(): [string, string] {
  if (
    typeof __HUB_BUILD_VERSION__ === "string" &&
    typeof __HUB_BUILD_COMMIT__ === "string" &&
    typeof __HUB_BUILD_DIRTY__ === "boolean" &&
    typeof __HUB_BUILD_TIMESTAMP__ === "string"
  ) {
    return formatHubBuildFingerprintLines({
      version: __HUB_BUILD_VERSION__,
      commit: __HUB_BUILD_COMMIT__,
      dirty: __HUB_BUILD_DIRTY__,
      builtAt: __HUB_BUILD_TIMESTAMP__,
    });
  }

  return formatHubBuildFingerprintLines(sourceModeFingerprint);
}
