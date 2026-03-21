import { strict as assert } from 'node:assert';
import test from 'node:test';

import { parseElementRef } from './element-refs';

test('parseElementRef recognizes supported ref prefixes', () => {
  assert.deepEqual(parseElementRef('e12'), { type: 'index', index: 12 });
  assert.deepEqual(parseElementRef('css:#submit'), { type: 'css', selector: '#submit' });
  assert.deepEqual(parseElementRef('xpath://button'), { type: 'xpath', path: '//button' });
  assert.deepEqual(parseElementRef('Continue'), { type: 'text', text: 'Continue' });
  assert.equal(parseElementRef(''), null);
});
