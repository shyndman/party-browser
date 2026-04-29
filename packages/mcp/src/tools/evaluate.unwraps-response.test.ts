import { strict as assert } from 'node:assert';
import test from 'node:test';

import type { TextContent } from '@modelcontextprotocol/sdk/types.js';

import { evaluate } from './evaluate';

test('evaluate unwraps the extension envelope before formatting the payload', async () => {
  const script = "return { foo: 'bar' };";
  let capturedPayload: unknown;
  let capturedOptions: unknown;

  const mockContext = {
    sendSocketMessage: async (type: string, payload: unknown, options: unknown) => {
      assert.equal(type, 'evaluate');
      capturedPayload = payload;
      capturedOptions = options;
      return {
        success: true,
        data: {
          result: { greeting: 'hello' },
        },
      };
    },
  } as never;

  const result = await evaluate.handle(mockContext, { script }, 'call-123');

  assert.deepEqual(capturedPayload, { script });
  assert.deepEqual(capturedOptions, { requestId: 'call-123' });
  const content = result.content[0];
  assert.ok(content);
  assert.equal(content.type, 'text');
  assert.equal(
    (content as TextContent).text,
    '```\n{\n  "greeting": "hello"\n}\n```',
  );
});
