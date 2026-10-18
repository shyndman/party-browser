import { strict as assert } from 'node:assert';
import test from 'node:test';

import type { Context } from '@/context';

import { joinSession } from './common';

function params() {
  return {
    name: 'Agent',
    reason: 'Inspect page',
    leaseKind: 'workspace',
    url: 'https://example.com',
  };
}

test('join_session returns approved session id with initial readable snapshot', async () => {
  const requests: string[] = [];
  const context = {
    async joinSession() {
      return 'session-123';
    },
    async sendSocketMessage(type: string) {
      requests.push(type);
      return {
        success: true,
        data: {
          url: 'https://example.com/',
          title: 'Example',
          tree: [{ ref: 'e1', role: 'heading', name: 'Welcome' }],
        },
      };
    },
  } as unknown as Context;

  const result = await joinSession.handle(context, params(), 'join-call');
  const output = result.content[0];

  assert.ok(output);
  assert.equal(output.type, 'text');
  assert.match(output.text, /^Session approved: session-123/);
  assert.match(output.text, /- Page URL: https:\/\/example\.com\//);
  assert.match(output.text, /- Page Title: Example/);
  assert.match(output.text, /e1 heading: Welcome/);

  assert.match(output.text, /capture start/i);
  assert.match(output.text, /stop when the session ends/i);
  assert.match(output.text, /before activation are unavailable/i);
  assert.match(output.text, /reload/i);

  assert.deepEqual(requests, ['snapshot']);
});

test('join_session fails explicitly when initial snapshot fails', async () => {
  const context = {
    async joinSession() {
      return 'session-456';
    },
    async sendSocketMessage() {
      throw new Error('snapshot unavailable');
    },
  } as unknown as Context;

  await assert.rejects(
    () => joinSession.handle(context, params()),
    { message: 'snapshot unavailable' },
  );
});
