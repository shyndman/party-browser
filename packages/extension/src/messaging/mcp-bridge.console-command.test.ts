import { strict as assert } from 'node:assert';
import test from 'node:test';

import { CommandHandler } from '../commands/command-handler';
import type { SessionManager } from '../session/session-manager';
import type { NetworkCapture } from '../session/network-capture';
import type { ContentBridge } from './content-bridge';
import type { SessionResultMessage } from '../types/messages';
import { McpBridge } from './mcp-bridge';

const TARGET_TAB_ID = 7;
const SESSION_ID = 'console-session';
const REQUEST_ID = 'console-request';
const LOGS = [
  { level: 'log', message: 'Page started', timestamp: 1 },
  { level: 'error', message: 'Old failure', timestamp: 2 },
  { level: 'error', message: 'Current failure', timestamp: 3 },
];

test('console wire command returns captured errors from the session tab', async () => {
  const sessionManager = {
    onLeaseRevoked(): void {},
    async resolveTargetTab(params: { sessionId: string }): Promise<number> {
      assert.equal(params.sessionId, SESSION_ID);
      return TARGET_TAB_ID;
    },
  } as unknown as SessionManager;
  const contentBridge = {
    async getConsoleMessages(tabId: number): Promise<typeof LOGS> {
      assert.equal(tabId, TARGET_TAB_ID);
      return LOGS;
    },
  } as unknown as ContentBridge;
  const handler = new CommandHandler(sessionManager, {} as NetworkCapture, contentBridge);
  const bridge = new McpBridge(sessionManager, handler);
  const responses: SessionResultMessage[] = [];
  bridge.send = (message: unknown): void => {
    responses.push(message as SessionResultMessage);
  };
  const inbound = bridge as unknown as {
    handleInboundMessage(message: {
      type: 'session_command';
      requestId: string;
      sessionId: string;
      command: string;
      payload: { level: 'error'; since: number };
    }): Promise<void>;
  };

  await inbound.handleInboundMessage({
    type: 'session_command',
    requestId: REQUEST_ID,
    sessionId: SESSION_ID,
    command: 'get_console_messages',
    payload: { level: 'error', since: 3 },
  });

  assert.deepEqual(responses, [{
    type: 'session_result',
    requestId: REQUEST_ID,
    sessionId: SESSION_ID,
    success: true,
    result: {
      success: true,
      data: {
        count: 1,
        logs: [{ level: 'error', message: 'Current failure', timestamp: 3, stack: undefined }],
      },
    },
    error: undefined,
    errorCode: undefined,
  }]);
});
