import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createPressKeyPlan } from './interaction-realism';

test('press_key plans text entry against editable targets', () => {
  const plan = createPressKeyPlan('a', {
    tagName: 'INPUT',
    type: 'text',
    role: null,
    isContentEditable: false,
  });

  assert.equal(plan.insertText, 'a');
  assert.equal(plan.activateElement, false);
  assert.equal(plan.moveFocus, false);
  assert.deepEqual(
    plan.events.map((event) => event.type),
    ['keydown', 'keypress', 'beforeinput', 'input', 'keyup'],
  );
});

test('press_key keeps non-text keys on the focused target without text insertion', () => {
  const plan = createPressKeyPlan('Escape', {
    tagName: 'DIV',
    role: null,
    isContentEditable: false,
  });

  assert.equal(plan.insertText, undefined);
  assert.equal(plan.activateElement, false);
  assert.equal(plan.moveFocus, false);
  assert.deepEqual(
    plan.events.map((event) => event.type),
    ['keydown', 'keyup'],
  );
});
