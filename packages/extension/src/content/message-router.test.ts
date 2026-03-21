import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createRuntimeMessageListener } from './message-router';

test('message listener returns console logs synchronously', () => {
  const listener = createRuntimeMessageListener({
    click: async () => ({ success: true }),
    type: async () => ({ success: true }),
    evaluate: async () => ({ success: true }),
    snapshot: () => ({ success: true }),
    selectOption: async () => ({ success: true }),
    pressKey: async () => ({ success: true }),
    wait: async () => ({ success: true }),
    waitFor: async () => ({ success: true }),
    drag: async () => ({ success: true }),
    hover: async () => ({ success: true }),
  }, {
    getLogs(clear?: boolean) {
      assert.equal(clear, true);
      return [{ level: 'log', message: 'captured', timestamp: 1 }];
    },
  } as never);

  let response: unknown;
  const handledAsync = listener(
    { type: 'getConsoleMessages', clear: true },
    {} as never,
    (value) => {
      response = value;
    },
  );

  assert.equal(handledAsync, false);
  assert.deepEqual(response, {
    success: true,
    logs: [{ level: 'log', message: 'captured', timestamp: 1 }],
  });
});
