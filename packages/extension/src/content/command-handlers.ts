import type { CommandResult, WaitForPayload } from '../types/commands';
import {
  createClickEventPlan,
  createDragEventPlan,
  createHoverEventPlan,
  createPressKeyPlan,
} from '../commands/interaction-realism';
import {
  applyTextInsertion,
  dispatchDragLikeEvent,
  dispatchKeyboardLikeEvent,
  dispatchMouseLikeEvent,
  dispatchPointerLikeEvent,
  getKeyboardTarget,
  moveFocusToNextFocusableElement,
} from './dom-events';
import { findElement } from './element-refs';
import { getSnapshot, type SnapshotCommandParams } from './snapshot';

export type CommandHandlers = ReturnType<typeof createCommandHandlers>;

export function createCommandHandlers() {
  async function snapshot(params: SnapshotCommandParams = {}): Promise<CommandResult> {
    return getSnapshot(params);
  }

  async function click(params: { element: string }): Promise<CommandResult> {
    const { element: ref } = params;
    const element = findElement(ref);

    if (!element) {
      throw new Error(`Element not found: ${ref}`);
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(100);

    const rect = element.getBoundingClientRect();
    const eventInit = {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };

    for (const plannedEvent of createClickEventPlan()) {
      if (plannedEvent.family === 'pointer') {
        dispatchPointerLikeEvent(element, plannedEvent.type, eventInit);
      } else {
        dispatchMouseLikeEvent(element, plannedEvent.type, eventInit);
      }
    }

    return {
      success: true,
      data: {
        element: ref,
        tagName: element.tagName,
        text: element.textContent?.trim().slice(0, 50),
      },
    };
  }

  async function type(params: { element: string; text: string }): Promise<CommandResult> {
    const { element: ref, text } = params;
    const element = findElement(ref) as HTMLInputElement | HTMLTextAreaElement;

    if (!element) {
      throw new Error(`Element not found: ${ref}`);
    }

    element.focus();
    await delay(50);

    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    for (const char of text) {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));

      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value += char;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }

      element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
      await delay(10);
    }

    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();

    return {
      success: true,
      data: {
        element: ref,
        value: text.slice(0, 50),
      },
    };
  }

  async function evaluate(params: { script: string }): Promise<CommandResult> {
    const { script } = params;

    try {
      const fn = new Function(script);
      const result = fn.call(window);
      const resolved = result instanceof Promise ? await result : result;

      return {
        success: true,
        data: { result: serializeResult(resolved) },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        stack: (error as Error).stack,
      };
    }
  }

  async function selectOption(params: { element: string; value: string }): Promise<CommandResult> {
    const { element: ref, value } = params;
    const element = findElement(ref) as HTMLSelectElement;

    if (!element) {
      throw new Error(`Element not found: ${ref}`);
    }

    if (element.tagName !== 'SELECT') {
      throw new Error(`Element is not a select: ${ref}`);
    }

    const option = Array.from(element.options).find((candidate) =>
      candidate.value === value || candidate.textContent?.trim() === value,
    );

    if (!option) {
      throw new Error(`Option not found: ${value}`);
    }

    element.value = option.value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));

    return {
      success: true,
      data: {
        element: ref,
        selectedValue: option.value,
        selectedText: option.textContent?.trim(),
      },
    };
  }

  async function pressKey(params: { key: string }): Promise<CommandResult> {
    const { key } = params;
    const target = getKeyboardTarget();
    const plan = createPressKeyPlan(key, {
      tagName: target.tagName,
      type: target instanceof HTMLInputElement ? target.type : null,
      role: target.getAttribute('role'),
      isContentEditable: target.isContentEditable,
    });

    let keydownAllowed = true;

    for (const plannedEvent of plan.events) {
      if (plannedEvent.family === 'keyboard') {
        const allowed = dispatchKeyboardLikeEvent(target, plannedEvent.type, key);
        if (plannedEvent.type === 'keydown') {
          keydownAllowed = allowed;
        }
        continue;
      }

      const inputEvent = new InputEvent(plannedEvent.type, {
        bubbles: true,
        cancelable: plannedEvent.type === 'beforeinput',
        composed: true,
        data: plan.insertText ?? null,
        inputType: 'insertText',
      });

      const allowed = target.dispatchEvent(inputEvent);
      if (plannedEvent.type === 'beforeinput' && allowed && plan.insertText) {
        applyTextInsertion(target, plan.insertText);
      }
    }

    if (plan.activateElement && keydownAllowed && typeof target.click === 'function') {
      target.click();
    }

    if (plan.moveFocus && keydownAllowed) {
      moveFocusToNextFocusableElement(target);
    }

    return { success: true, data: { key } };
  }

  async function wait(params: { time: number }): Promise<CommandResult> {
    const seconds = Number(params.time);
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error(`Invalid wait time: ${params.time}`);
    }

    const waited = seconds * 1000;
    await delay(waited);
    return { success: true, data: { waited } };
  }

  async function waitFor(params: WaitForPayload): Promise<CommandResult> {
    const { mode } = params;
    const startTime = Date.now();

    if (mode === 'time') {
      const waited = Math.max(0, params.value) * 1000;
      await delay(waited);
      return { success: true, data: { mode, waited } };
    }

    if (typeof params.timeout !== 'number') {
      throw new Error(`timeout is required for mode=${mode}`);
    }

    const timeoutMs = params.timeout * 1000;

    if (mode === 'text') {
      return waitForTextCondition({
        matches: (bodyText) => bodyText.includes(params.value),
        timeoutMs,
        errorMessage: `Timeout waiting for text: ${params.value}`,
        mode,
        startTime,
      });
    }

    if (mode === 'text_gone') {
      return waitForTextCondition({
        matches: (bodyText) => !bodyText.includes(params.value),
        timeoutMs,
        errorMessage: `Timeout waiting for text to disappear: ${params.value}`,
        mode,
        startTime,
      });
    }

    throw new Error(`Unknown wait mode: ${mode}`);
  }

  async function drag(params: { startElement: string; endElement: string }): Promise<CommandResult> {
    const { startElement, endElement } = params;
    const startEl = findElement(startElement);
    const endEl = findElement(endElement);

    if (!startEl) {
      throw new Error(`Start element not found: ${startElement}`);
    }
    if (!endEl) {
      throw new Error(`End element not found: ${endElement}`);
    }

    const startRect = startEl.getBoundingClientRect();
    const endRect = endEl.getBoundingClientRect();
    const dataTransfer = new DataTransfer();

    for (const plannedEvent of createDragEventPlan()) {
      const target = plannedEvent.target === 'source' ? startEl : endEl;
      const eventInit = plannedEvent.target === 'source'
        ? {
            clientX: startRect.left + startRect.width / 2,
            clientY: startRect.top + startRect.height / 2,
          }
        : {
            clientX: endRect.left + endRect.width / 2,
            clientY: endRect.top + endRect.height / 2,
          };

      if (plannedEvent.family === 'drag') {
        dispatchDragLikeEvent(target, plannedEvent.type, dataTransfer, eventInit);
      } else {
        dispatchMouseLikeEvent(target, plannedEvent.type, eventInit);
      }

      await delay(25);
    }

    return { success: true, data: { startElement, endElement } };
  }

  async function hover(params: { element: string }): Promise<CommandResult> {
    const element = findElement(params.element);
    if (!element) {
      throw new Error(`Element not found: ${params.element}`);
    }

    const rect = element.getBoundingClientRect();
    const eventInit = {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };

    for (const plannedEvent of createHoverEventPlan()) {
      if (plannedEvent.family === 'pointer') {
        dispatchPointerLikeEvent(element, plannedEvent.type, eventInit);
      } else {
        dispatchMouseLikeEvent(element, plannedEvent.type, eventInit);
      }
    }

    return { success: true, data: { element: params.element } };
  }

  return {
    click,
    type,
    evaluate,
    snapshot,
    selectOption,
    pressKey,
    wait,
    waitFor,
    drag,
    hover,
  };
}

type WaitForTextConditionArgs = {
  matches: (bodyText: string) => boolean;
  timeoutMs: number;
  errorMessage: string;
  mode: 'text' | 'text_gone';
  startTime: number;
};

function waitForTextCondition(args: WaitForTextConditionArgs): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      const bodyText = document.body.innerText || '';
      const elapsed = Date.now() - args.startTime;

      if (args.matches(bodyText)) {
        clearInterval(checkInterval);
        resolve({ success: true, data: { mode: args.mode, waited: elapsed } });
      }

      if (elapsed >= args.timeoutMs) {
        clearInterval(checkInterval);
        reject(new Error(args.errorMessage));
      }
    }, 100);
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function serializeResult(result: unknown): unknown {
  if (result === null) {
    return null;
  }
  if (result === undefined) {
    return undefined;
  }

  switch (typeof result) {
    case 'boolean':
    case 'number':
    case 'string':
      return result;
    case 'object':
      if (Array.isArray(result)) {
        return result.map(serializeResult);
      }
      if (result instanceof Element) {
        return {
          type: 'Element',
          tagName: result.tagName,
          id: result.id,
          className: result.className,
        };
      }
      if (result instanceof NodeList || result instanceof HTMLCollection) {
        return Array.from(result).map(serializeResult);
      }
      try {
        return JSON.parse(JSON.stringify(result));
      } catch {
        return String(result);
      }
    case 'function':
      return `[Function: ${(result as Function).name || 'anonymous'}]`;
    default:
      return String(result);
  }
}
