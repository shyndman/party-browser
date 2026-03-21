import { strict as assert } from 'node:assert';
import test from 'node:test';

import type { Context } from '@/context';

import { consoleMessages } from './inspection';

const wrappedResponse = {
  success: true,
  data: {
    logs: [
      {
        timestamp: 1690000000000,
        level: 'info',
        message: 'wrapped log entry',
      },
    ],
  },
} as const;

test('consoleMessages renders wrapped log payload', async () => {
  const context = {
    sendSocketMessage: async () => wrappedResponse,
  } as unknown as Context;

  const result = await consoleMessages.handle(context);
  const output = result.content[0]?.type === 'text' ? result.content[0].text : '';

  assert.match(output, /Console Messages \(1 total\)/);
  assert.match(output, /wrapped log entry/);
});
