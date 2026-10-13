import { strict as assert } from 'node:assert';
import test from 'node:test';

import type { Context } from '@/context';

import { networkRequestDetails } from './inspection';

test('networkRequestDetails returns complete details', async () => {
  const context = {
    sendSocketMessage: async () => {
      return {
        success: true,
        data: {
          id: 'request-7',
          requestHeaders: [{ name: 'accept', value: 'application/json' }],
          responseBody: '{"ok":true}',
          encoding: 'utf-8',
        },
      };
    },
  } as unknown as Context;

  const result = await networkRequestDetails.handle(context, { id: 'request-7' }, 'call-7');
  const text = result.content[0]?.type === 'text' ? result.content[0].text : '';

  assert.deepEqual(JSON.parse(text), {
    id: 'request-7',
    requestHeaders: [{ name: 'accept', value: 'application/json' }],
    responseBody: '{"ok":true}',
    encoding: 'utf-8',
  });
});

