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
      executeCommand(commandHandlers, {
        command: runtimeMessage.command!,
        params: runtimeMessage.params || {},
      })
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({
          success: false,
          error: (error as Error).message,
          stack: (error as Error).stack,
        }));
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
  console.log(`[PartyBrowser] → ${command}${summarizeParams(params)}`);

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
        case 'select_option':
          return commandHandlers.selectOption(params as { element: string; value: string });
        case 'press_key':
          return commandHandlers.pressKey(params as { key: string });
        case 'wait':
          return commandHandlers.wait(params as { time: number });
        case 'wait_for':
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
      console.log(`[PartyBrowser] ✓ ${command}`);
    } else {
      console.error(`[PartyBrowser] ✗ ${command} failed: ${result.error}`);
    }
    return result;
  } catch (error) {
    const message = (error as Error).message;
    console.error(`[PartyBrowser] ✗ ${command} failed: ${message}`);
    throw error;
  }
}

function summarizeParams(params: Record<string, unknown>): string {
  const parts: string[] = [];
  if (params.element) parts.push(`element: ${params.element}`);
  if (params.startElement) parts.push(`startElement: ${params.startElement}`);
  if (params.endElement) parts.push(`endElement: ${params.endElement}`);
  if (params.text) {
    const text = params.text as string;
    parts.push(`text: "${text.length > 20 ? `${text.slice(0, 20)}...` : text}"`);
  }
  if (params.key) parts.push(`key: ${params.key}`);
  if (params.value !== undefined) parts.push(`value: ${params.value}`);
  if (params.time) parts.push(`time: ${params.time}s`);
  if (params.mode) parts.push(`mode: ${params.mode}`);

  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}
