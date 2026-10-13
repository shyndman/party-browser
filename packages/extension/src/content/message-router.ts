import type BrowserNamespace from 'webextension-polyfill';

import type { ConsoleCapture } from '../session/console-capture';
import type { CommandResult, WaitForPayload } from '../types/commands';
import type { CommandHandlers } from './command-handlers';

type CommandMessage = {
  command: string;
  params: Record<string, unknown>;
};

type RuntimeMessage = {
  type?: string;
  command?: string;
  params?: Record<string, unknown>;
  clear?: boolean;
};

export function createRuntimeMessageListener(
  commandHandlers: CommandHandlers,
  consoleCapture: ConsoleCapture,
): BrowserNamespace.Runtime.OnMessageListener {
  return ((
    message: unknown,
    _sender: BrowserNamespace.Runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): boolean => {
    const runtimeMessage = message as RuntimeMessage;

    if (runtimeMessage.type === 'executeCommand') {
      console.log('[PartyBrowser] Content command received.', {
        command: runtimeMessage.command,
        params: summarizeParams(runtimeMessage.params || {}),
        receivedAtMs: Date.now(),
      });

      executeCommand(commandHandlers, {
        command: runtimeMessage.command!,
        params: runtimeMessage.params || {},
      })
        .then((result) => {
          sendResponse(result);
        })
        .catch((error) => {
          console.error('[PartyBrowser] Content command crashed before response.', {
            command: runtimeMessage.command,
            error: (error as Error).message,
            stack: (error as Error).stack,
          });
          sendResponse({
            success: false,
            error: (error as Error).message,
            stack: (error as Error).stack,
          });
        });
      return true;
    }

    if (runtimeMessage.type === 'getConsoleMessages') {
      sendResponse({
        success: true,
        logs: consoleCapture.getLogs(runtimeMessage.clear),
      });
      return false;
    }

    if (runtimeMessage.type === 'ping') {
      sendResponse({ success: true });
      return false;
    }

    return false;
  }) as BrowserNamespace.Runtime.OnMessageListener;
}

async function executeCommand(
  commandHandlers: CommandHandlers,
  message: CommandMessage,
): Promise<CommandResult> {
  const { command, params } = message;
  const startedAt = Date.now();

  console.log('[PartyBrowser] Content command handler starting.', {
    command,
    params: summarizeParams(params),
    startedAtMs: startedAt,
  });

  try {
    const result = await (async () => {
      switch (command) {
        case 'click':
          return commandHandlers.click(params as { element: string });
        case 'type':
          return commandHandlers.type(params as { element: string; text: string });
        case 'evaluate':
          return commandHandlers.evaluate(params as { script: string });
        case 'snapshot':
          return commandHandlers.snapshot(params as { nextRefStart?: number });
        case 'selectOption':
          return commandHandlers.selectOption(params as { element: string; value: string });
        case 'pressKey':
          return commandHandlers.pressKey(params as { key: string });
        case 'wait':
          return commandHandlers.wait(params as { time: number });
        case 'waitFor':
          return commandHandlers.waitFor(params as WaitForPayload);
        case 'drag':
          return commandHandlers.drag(params as { startElement: string; endElement: string });
        case 'hover':
          return commandHandlers.hover(params as { element: string });
        default:
          throw new Error(`Unknown command: ${command}`);
      }
    })();

    if (result.success) {
      console.log('[PartyBrowser] Content command handler completed.', {
        command,
        durationMs: Date.now() - startedAt,
        result: summarizeResult(result),
      });
    } else {
      console.error('[PartyBrowser] Content command handler returned failure.', {
        command,
        durationMs: Date.now() - startedAt,
        result: summarizeResult(result),
      });
    }
    return result;
  } catch (error) {
    console.error('[PartyBrowser] Content command handler threw.', {
      command,
      durationMs: Date.now() - startedAt,
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    throw error;
  }
}

function summarizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const parts: Record<string, unknown> = {};
  if (params.element) parts.element = params.element;
  if (params.startElement) parts.startElement = params.startElement;
  if (params.endElement) parts.endElement = params.endElement;
  if (params.text) {
    const text = params.text as string;
    parts.text = text.length > 20 ? `${text.slice(0, 20)}...` : text;
  }
  if (params.key) parts.key = params.key;
  if (params.value !== undefined) parts.value = params.value;
  if (params.time) parts.timeSeconds = params.time;
  if (params.mode) parts.mode = params.mode;
  if (params.nextRefStart !== undefined) parts.nextRefStart = params.nextRefStart;

  return parts;
}

function summarizeResult(result: CommandResult): Record<string, unknown> {
  const data = result.data;
  const meta = result.meta;

  return {
    success: result.success,
    error: result.success ? undefined : result.error,
    dataKeys: data && typeof data === 'object' ? Object.keys(data as Record<string, unknown>) : undefined,
    metaKeys: meta && typeof meta === 'object' ? Object.keys(meta as Record<string, unknown>) : undefined,
  };
}
