import { strict as assert } from 'node:assert';
import test from 'node:test';

import type { Context } from '@/context';

import { networkRequestDetails } from './inspection';

test('networkRequestDetails requests and returns complete details with UTF-8 default', async () => {
  let capturedType: string | undefined;
  let capturedPayload: unknown;
  const context = {
    sendSocketMessage: async (type: string, payload: unknown) => {
      capturedType = type;
      capturedPayload = payload;
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

  assert.equal(capturedType, 'getNetworkRequestDetails');
  assert.deepEqual(capturedPayload, { id: 'request-7', encoding: 'utf-8' });
  assert.deepEqual(JSON.parse(text), {
    id: 'request-7',
    requestHeaders: [{ name: 'accept', value: 'application/json' }],
    responseBody: '{"ok":true}',
    encoding: 'utf-8',
  });
});

test('networkRequestDetails forwards a requested body encoding', async () => {
  let capturedPayload: unknown;
  const context = {
    sendSocketMessage: async (_type: string, payload: unknown) => {
      capturedPayload = payload;
      return { success: true, data: { id: 'request-7', encoding: 'windows-1252' } };
    },
  } as unknown as Context;

  await networkRequestDetails.handle(
    context,
    { id: 'request-7', encoding: 'windows-1252' },
    'call-8',
  );

  assert.deepEqual(capturedPayload, { id: 'request-7', encoding: 'windows-1252' });
});
