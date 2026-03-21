import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createClickEventPlan } from './interaction-realism';

test('click plan emits one realistic click sequence without double triggering', () => {
  const plan = createClickEventPlan();
  const eventTypes = plan.map((event) => event.type);

  assert.deepEqual(eventTypes, [
    'pointerover',
    'pointerenter',
    'mouseover',
    'mouseenter',
    'pointermove',
    'mousemove',
    'pointerdown',
    'mousedown',
    'pointerup',
    'mouseup',
    'click',
  ]);
  assert.equal(eventTypes.filter((type) => type === 'click').length, 1);
});
