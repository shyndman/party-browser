export function dispatchMouseLikeEvent(
  element: Element,
  type: string,
  init: MouseEventInit,
): void {
  element.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    ...init,
  }));
}

export function dispatchPointerLikeEvent(
  element: Element,
  type: string,
  init: MouseEventInit,
): void {
  if (typeof PointerEvent === 'function') {
    element.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      ...init,
    }));
    return;
  }

  dispatchMouseLikeEvent(element, type, init);
}

export function dispatchDragLikeEvent(
  element: Element,
  type: string,
  dataTransfer: DataTransfer,
  init: MouseEventInit,
): void {
  if (typeof DragEvent === 'function') {
    element.dispatchEvent(new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      dataTransfer,
      ...init,
    }));
    return;
  }

  const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  element.dispatchEvent(event);
}

export function dispatchKeyboardLikeEvent(element: Element, type: string, key: string): boolean {
  return element.dispatchEvent(new KeyboardEvent(type, {
    key,
    bubbles: true,
    cancelable: true,
    composed: true,
  }));
}

export function applyTextInsertion(target: HTMLElement, text: string): void {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    target.setRangeText(text, start, end, 'end');
    return;
  }

  if (!target.isContentEditable) {
    return;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    target.textContent = `${target.textContent ?? ''}${text}`;
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(document.createTextNode(text));
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function moveFocusToNextFocusableElement(current: HTMLElement): void {
  const focusable = Array.from(document.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
  )).filter((candidate) => !candidate.hasAttribute('disabled') && candidate.tabIndex >= 0);

  const currentIndex = focusable.indexOf(current);
  if (currentIndex === -1) {
    return;
  }

  focusable[(currentIndex + 1) % focusable.length]?.focus();
}

export function getKeyboardTarget(): HTMLElement {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) {
    return active;
  }

  return document.body;
}
