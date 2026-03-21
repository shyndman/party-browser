import { strict as assert } from 'node:assert';
import test from 'node:test';

import type { TextContent } from '@modelcontextprotocol/sdk/types.js';

import { evaluate } from './evaluate';

test('evaluate unwraps the extension envelope before formatting the payload', async () => {
  const script = "return { foo: 'bar' };";
  let capturedPayload: unknown;

  const mockContext = {
    sendSocketMessage: async (type: string, payload: unknown) => {
      assert.equal(type, 'evaluate');
      capturedPayload = payload;
      return {
        success: true,
        data: {
          result: { greeting: 'hello' },
        },
      };
    },
  } as never;

  const result = await evaluate.handle(mockContext, { script });

  assert.deepEqual(capturedPayload, { script });
  const content = result.content[0];
  assert.ok(content);
  assert.equal(content.type, 'text');
  assert.equal(
    (content as TextContent).text,
    '```\n{\n  "greeting": "hello"\n}\n```',
  );
});
