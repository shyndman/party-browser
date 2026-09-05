import { strict as assert } from 'node:assert';
import test from 'node:test';

import type { Context } from '@/context';

import { networkRequests } from './inspection';

test('networkRequests unwraps wrapped payload', async () => {
  const responses = {
    getNetworkRequests: {
      success: true,
      data: {
        count: 1,
        requests: [
          {
            id: 'req-1',
            url: 'https://example.com/foo',
            method: 'GET',
            type: 'xhr',
            status: 200,
            timestamp: 1,
          },
        ],
      },
    },
  } as const;
  let capturedType: string | undefined;
  let capturedOptions: unknown;

  const context = {
    sendSocketMessage: async (type: keyof typeof responses, _payload: unknown, options: unknown) => {
      capturedType = type;
      capturedOptions = options;
      return responses[type];
    },
  } as unknown as Context;

  const result = await networkRequests.handle(context, {}, 'call-123');
  const text = result.content[0]?.type === 'text' ? result.content[0].text : '';

  assert.equal(capturedType, 'getNetworkRequests');
  assert.match(text, /Network Requests \(1 total\)/);
  assert.match(text, /GET/);
  assert.match(text, /ID: req-1/);
  assert.match(text, /https:\/\/example\.com\/foo/);
});
