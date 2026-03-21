import { strict as assert } from 'node:assert';
import test from 'node:test';

import type { Context } from '@/context';
import type { ImageContent } from '@modelcontextprotocol/sdk/types.js';

import { screenshot } from './custom';

test('screenshot tool unwraps wrapped command response', async () => {
  const base64Screenshot = 'Zm9vYmFyZm9vYmFy';
  const context = {
    sendSocketMessage: async () => ({
      success: true,
      data: {
        screenshot: base64Screenshot,
      },
    }),
  } as unknown as Context;

  const result = await screenshot.handle(context);
  const image = result.content[0];

  assert.ok(image);
  assert.equal(image.type, 'image');
  assert.equal((image as ImageContent).data, base64Screenshot);
  assert.equal((image as ImageContent).mimeType, 'image/png');
});
