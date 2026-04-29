import { strict as assert } from 'node:assert';
import test from 'node:test';

import { Context } from '@/context';
import { MCP_ERROR_CODES } from '@/protocol/constants';
import { CodedError, type HubConnection } from '@/protocol/ws-sender';

import { click } from './snapshot';

function createHubConnection(
  sendSessionCommand: HubConnection['sendSessionCommand'],
): HubConnection {
  return {
    async probe() {
      return;
    },
    async joinSession() {
      return 'session-123';
    },
    sendSessionCommand,
    async close() {
      return;
    },
  };
}

test('click tool preserves response text shape while consuming lifecycle-managed page state', async () => {
  let capturedOptions: unknown;
  const context = new Context(
    createHubConnection(async (_sessionId, type, payload, options) => {
      assert.equal(type, 'click');
      assert.deepEqual(payload, { element: 'css:#submit' });
      capturedOptions = options;
      return {
        success: true,
        data: {
          element: 'css:#submit',
          pageState: {
            url: 'https://example.com/after',
            title: 'After',
            tree: [{ ref: 'e1', tagName: 'button', name: 'Submit' }],
          },
        },
      };
    }),
  );
  await context.joinSession({ name: 'Test Agent', reason: 'Contract test', leaseKind: "workspace", url: 'https://example.com' });

  const result = await click.handle(context, { element: 'css:#submit' }, 'call-123');
  const output = result.content[0];

  assert.deepEqual(capturedOptions, { requestId: 'call-123' });
  assert.ok(output);
  assert.equal(output.type, 'text');
  assert.match(output.text, /^Clicked "css:#submit"/);
  assert.match(output.text, /- Page URL: https:\/\/example\.com\/after/);
  assert.match(output.text, /- Page Title: After/);
  assert.match(output.text, /e1 button: Submit/);
});

test('click tool surfaces lifecycle readback failure as a command failure', async () => {
  const context = new Context(
    createHubConnection(async () => {
      throw new CodedError('Snapshot readback failed.', MCP_ERROR_CODES.PROTOCOL_INVALID_MESSAGE);
    }),
  );
  await context.joinSession({ name: 'Test Agent', reason: 'Failure contract test', leaseKind: "workspace", url: 'https://example.com' });

  await assert.rejects(
    () => click.handle(context, { element: 'css:#submit' }),
    (error: unknown) => {
      assert.ok(error instanceof CodedError);
      assert.equal(error.message, 'Snapshot readback failed.');
      return true;
    },
  );
});
