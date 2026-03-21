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
    console.log('[PartyBrowser] Content script received:', message);

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

  switch (command) {
    case 'click':
      return commandHandlers.click(params as { element: string });
    case 'type':
      return commandHandlers.type(params as { element: string; text: string });
    case 'evaluate':
      return commandHandlers.evaluate(params as { script: string });
    case 'snapshot':
      return commandHandlers.snapshot();
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
}
