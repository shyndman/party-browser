import winston, { type Logger } from "winston";

export const HUB_LOG_LEVEL_ENV_VAR = "PARTYBROWSER_HUB_LOG_LEVEL";

const DEFAULT_LOG_LEVEL = "info";
const DEFAULT_COMPONENT = "hub";
const SPLAT_SYMBOL = Symbol.for("splat");
const VALID_LOG_LEVELS = new Set(Object.keys(winston.config.npm.levels));

type SerializableMetadata = Record<string, unknown>;

function safeSerialize(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const seen = new WeakSet<object>();
  const serialized = JSON.stringify(value, (_key, candidate) => {
    if (candidate instanceof Error) {
      return {
        name: candidate.name,
        message: candidate.message,
        stack: candidate.stack,
      };
    }

    if (typeof candidate === "object" && candidate !== null) {
      if (seen.has(candidate)) {
        return "[Circular]";
      }
      seen.add(candidate);
    }

    return candidate;
  });

  if (serialized === undefined) {
    return String(value);
  }

  return serialized;
}

function formatMetadata(metadata: SerializableMetadata): string {
  const parts = Object.entries(metadata)
    .filter(([_key, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${safeSerialize(value)}`);

  return parts.join(" ");
}

function resolveLogLevel(): string {
  const configuredLevel = process.env[HUB_LOG_LEVEL_ENV_VAR]?.trim().toLowerCase();
  if (!configuredLevel) {
    return DEFAULT_LOG_LEVEL;
  }

  if (VALID_LOG_LEVELS.has(configuredLevel)) {
    return configuredLevel;
  }

  return DEFAULT_LOG_LEVEL;
}

function resolveExplicitLogLevel(level: string): string {
  const normalized = level.trim().toLowerCase();
  if (VALID_LOG_LEVELS.has(normalized)) {
    return normalized;
  }
  return DEFAULT_LOG_LEVEL;
}

const humanConsoleFormat = winston.format.printf((info) => {
  const metadata: SerializableMetadata = { ...(info as SerializableMetadata) };

  const timestamp = typeof metadata.timestamp === "string" ? metadata.timestamp : new Date().toISOString();
  const level = typeof metadata.level === "string" ? metadata.level.toUpperCase() : "INFO";
  const component =
    typeof metadata.component === "string" && metadata.component.length > 0
      ? metadata.component
      : DEFAULT_COMPONENT;
  const event = typeof metadata.event === "string" ? metadata.event : undefined;
  const message =
    typeof metadata.message === "string" ? metadata.message : safeSerialize(metadata.message);
  const stack = typeof metadata.stack === "string" ? metadata.stack : undefined;

  delete metadata.timestamp;
  delete metadata.level;
  delete metadata.component;
  delete metadata.event;
  delete metadata.message;
  delete metadata.stack;
  delete metadata[SPLAT_SYMBOL as unknown as keyof SerializableMetadata];

  const metadataText = formatMetadata(metadata);
  const eventText = event ? ` ${event}` : "";
  const stackText = stack ? `\n${stack}` : "";

  return `${timestamp} ${level} [${component}]${eventText} ${message}${
    metadataText ? ` ${metadataText}` : ""
  }${stackText}`;
});

const rootHubLogger = winston.createLogger({
  level: resolveLogLevel(),
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    humanConsoleFormat,
  ),
  transports: [new winston.transports.Console()],
});

export function createHubLogger(component = DEFAULT_COMPONENT): Logger {
  return rootHubLogger.child({ component });
}

export function getHubLogLevel(): string {
  return rootHubLogger.level;
}

export function setHubLogLevel(level: string): void {
  rootHubLogger.level = resolveExplicitLogLevel(level);
}

export function addHubLogTransport(transport: winston.transport): void {
  rootHubLogger.add(transport);
}

export function removeHubLogTransport(transport: winston.transport): void {
  rootHubLogger.remove(transport);
}
