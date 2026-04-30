import { strict as assert } from 'node:assert';
import test from 'node:test';

import type { Context } from '../context';

import { joinSession, navigate, waitFor } from './common';

test('join_session exposes a flat schema with nullable url compatibility', () => {
  const schema = joinSession.schema.inputSchema as Record<string, unknown>;
  const properties = schema.properties as Record<string, Record<string, unknown>>;

  assert.equal(schema.type, 'object');
  assert.equal(Object.hasOwn(schema, 'oneOf'), false);
  assert.equal(Object.hasOwn(schema, 'anyOf'), false);
  assert.equal(Object.hasOwn(schema, 'allOf'), false);
  assert.equal(Object.hasOwn(schema, 'not'), false);
  assert.deepEqual(schema.required, ['name', 'reason', 'leaseKind']);
  assert.deepEqual(properties.url?.type, ['string', 'null']);
});

test('wait_for exposes a Codex-compatible object schema', () => {
  const schema = waitFor.schema.inputSchema as Record<string, unknown>;

  assert.equal(schema.type, 'object');
  assert.equal(Object.hasOwn(schema, 'oneOf'), false);
  assert.equal(Object.hasOwn(schema, 'anyOf'), false);
  assert.equal(Object.hasOwn(schema, 'allOf'), false);
  assert.equal(Object.hasOwn(schema, 'not'), false);
  assert.equal(Object.hasOwn(schema, 'enum'), false);
});

test('common session commands propagate the MCP call request id', async () => {
  let capturedOptions: { requestId?: string } | undefined;
  const context = {
    sendSocketMessage: async (
      type: string,
      payload: unknown,
      options: { requestId?: string },
    ) => {
      assert.equal(type, 'navigate');
      assert.deepEqual(payload, { url: 'https://example.com' });
      capturedOptions = options;
      return { url: 'https://example.com' };
    },
  } as unknown as Context;

  await navigate(false).handle(
    context,
    { url: 'https://example.com' },
    'call-123',
  );

  assert.deepEqual(capturedOptions, { requestId: 'call-123' });
});
