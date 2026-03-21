export type InteractionTargetKind = {
  tagName: string;
  type?: string | null;
  role?: string | null;
  isContentEditable?: boolean;
};

export type PlannedEvent = {
  type: string;
  family: 'mouse' | 'pointer' | 'drag' | 'keyboard' | 'input';
  target: 'element' | 'source' | 'destination';
};

export type PressKeyPlan = {
  events: PlannedEvent[];
  insertText?: string;
  activateElement?: boolean;
  moveFocus?: boolean;
};

const BUTTONLIKE_ROLES = new Set(['button', 'link', 'menuitem']);
const TEXT_INPUT_TYPES = new Set(['', 'email', 'number', 'password', 'search', 'tel', 'text', 'url']);

export function isPrintableKey(key: string): boolean {
  return key.length === 1;
}

export function isTextEntryTarget(target: InteractionTargetKind): boolean {
  const tagName = target.tagName.toUpperCase();
  if (target.isContentEditable) {
    return true;
  }

  if (tagName === 'TEXTAREA') {
    return true;
  }

  if (tagName !== 'INPUT') {
    return false;
  }

  return TEXT_INPUT_TYPES.has((target.type ?? '').toLowerCase());
}

export function isButtonLikeTarget(target: InteractionTargetKind): boolean {
  const tagName = target.tagName.toUpperCase();
  return tagName === 'BUTTON'
    || tagName === 'A'
    || BUTTONLIKE_ROLES.has((target.role ?? '').toLowerCase());
}

export function createClickEventPlan(): PlannedEvent[] {
  return [
    { family: 'pointer', target: 'element', type: 'pointerover' },
    { family: 'pointer', target: 'element', type: 'pointerenter' },
    { family: 'mouse', target: 'element', type: 'mouseover' },
    { family: 'mouse', target: 'element', type: 'mouseenter' },
    { family: 'pointer', target: 'element', type: 'pointermove' },
    { family: 'mouse', target: 'element', type: 'mousemove' },
    { family: 'pointer', target: 'element', type: 'pointerdown' },
    { family: 'mouse', target: 'element', type: 'mousedown' },
    { family: 'pointer', target: 'element', type: 'pointerup' },
    { family: 'mouse', target: 'element', type: 'mouseup' },
    { family: 'mouse', target: 'element', type: 'click' },
  ];
}

export function createHoverEventPlan(): PlannedEvent[] {
  return [
    { family: 'pointer', target: 'element', type: 'pointerover' },
    { family: 'pointer', target: 'element', type: 'pointerenter' },
    { family: 'mouse', target: 'element', type: 'mouseover' },
    { family: 'mouse', target: 'element', type: 'mouseenter' },
    { family: 'pointer', target: 'element', type: 'pointermove' },
    { family: 'mouse', target: 'element', type: 'mousemove' },
  ];
}

export function createDragEventPlan(): PlannedEvent[] {
  return [
    { family: 'mouse', target: 'source', type: 'mousedown' },
    { family: 'drag', target: 'source', type: 'dragstart' },
    { family: 'drag', target: 'destination', type: 'dragenter' },
    { family: 'drag', target: 'destination', type: 'dragover' },
    { family: 'drag', target: 'destination', type: 'drop' },
    { family: 'drag', target: 'source', type: 'dragend' },
    { family: 'mouse', target: 'destination', type: 'mouseup' },
  ];
}

export function createPressKeyPlan(key: string, target: InteractionTargetKind): PressKeyPlan {
  const events: PlannedEvent[] = [
    { family: 'keyboard', target: 'element', type: 'keydown' },
  ];

  const editable = isTextEntryTarget(target);
  const printable = isPrintableKey(key);

  if (editable && printable) {
    events.push({ family: 'keyboard', target: 'element', type: 'keypress' });
    events.push({ family: 'input', target: 'element', type: 'beforeinput' });
    events.push({ family: 'input', target: 'element', type: 'input' });
  }

  events.push({ family: 'keyboard', target: 'element', type: 'keyup' });

  return {
    events,
    insertText: editable && printable ? key : undefined,
    activateElement: key === 'Enter' && isButtonLikeTarget(target),
    moveFocus: key === 'Tab',
  };
}
