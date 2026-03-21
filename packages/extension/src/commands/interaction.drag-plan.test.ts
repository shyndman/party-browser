import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createDragEventPlan } from './interaction-realism';

test('drag plan includes drag-and-drop lifecycle events', () => {
  const eventTypes = createDragEventPlan().map((event) => event.type);

  assert.deepEqual(eventTypes, [
    'mousedown',
    'dragstart',
    'dragenter',
    'dragover',
    'drop',
    'dragend',
    'mouseup',
  ]);
});
