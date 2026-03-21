import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createHoverEventPlan } from './interaction-realism';

test('hover plan includes pointer enter and movement events', () => {
  const eventTypes = createHoverEventPlan().map((event) => event.type);

  assert.deepEqual(eventTypes, [
    'pointerover',
    'pointerenter',
    'mouseover',
    'mouseenter',
    'pointermove',
    'mousemove',
  ]);
});
