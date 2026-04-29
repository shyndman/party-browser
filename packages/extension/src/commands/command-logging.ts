import type { CommandPhase } from '../types/commands';

export type CommandLogOrigin = 'user' | 'system';

export type CommandLogFields = {
  command: string;
  phase: string;
  origin: CommandLogOrigin;
  commandId?: string;
  parentCommandId?: string;
  sessionId?: string;
  tabId?: number;
  failedPhase?: CommandPhase;
  [key: string]: unknown;
};

function stringifyField(value: unknown): string {
  if (value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
}

export function logCommandPhase(
  level: 'log' | 'warn' | 'error',
  message: string,
  fields: CommandLogFields,
): void {
  const renderedFields = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${stringifyField(value)}`)
    .join(' ');

  console[level](`[PartyBrowser] ${message}${renderedFields ? ` ${renderedFields}` : ''}`);
}
