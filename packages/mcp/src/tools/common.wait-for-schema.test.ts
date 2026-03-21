import { strict as assert } from 'node:assert';
import test from 'node:test';

import { waitFor } from './common';

test('wait_for exposes a Codex-compatible object schema', () => {
  const schema = waitFor.schema.inputSchema as Record<string, unknown>;

  assert.equal(schema.type, 'object');
  assert.equal(Object.hasOwn(schema, 'oneOf'), false);
  assert.equal(Object.hasOwn(schema, 'anyOf'), false);
  assert.equal(Object.hasOwn(schema, 'allOf'), false);
  assert.equal(Object.hasOwn(schema, 'not'), false);
  assert.equal(Object.hasOwn(schema, 'enum'), false);
});
