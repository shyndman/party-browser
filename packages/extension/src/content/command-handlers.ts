import type { CommandResult, WaitForPayload } from '../types/commands';
import { ErrorCodes } from '../utils/errors';
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
import { compileEvaluation } from './evaluation';
import { getSnapshot, type SnapshotCommandParams } from './snapshot';

export type CommandHandlers = ReturnType<typeof createCommandHandlers>;

export function createCommandHandlers() {
  function describeElement(element: Element, ref: string): string {
    const role = element.getAttribute('role') || element.tagName.toLowerCase();
    const name = element.getAttribute('aria-label')
      || element.getAttribute('placeholder')
      || element.textContent?.trim().slice(0, 30);
    
    return `${role} '${name || ref}'`;
  }

  async function snapshot(params: SnapshotCommandParams = {}): Promise<CommandResult> {
    return getSnapshot(params);
  }

  async function click(params: { element: string }): Promise<CommandResult> {
    const { element: ref } = params;
    const element = findElement(ref);

    if (!element) {
      throw new Error(`Element not found or stale: ${ref}; capture a new snapshot and retry`);
    }

    if (isDisabledControlOrDescendant(element)) {
      const error = `Cannot click disabled element: ${ref}`;
      console.error(`[PartyBrowser] Click failed: ${error}`);
      throw new Error(error);
    }

    console.log(`[PartyBrowser] Clicking ${describeElement(element, ref)}`);
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(100);

    const currentElement = findElement(ref);
    if (!currentElement || currentElement !== element) {
      const error = `Element not found or stale: ${ref}; capture a new snapshot and retry`;
      console.error(`[PartyBrowser] Click failed: ${error}`);
      throw new Error(error);
    }
    if (isDisabledControlOrDescendant(currentElement)) {
      const error = `Cannot click disabled element: ${ref}`;
      console.error(`[PartyBrowser] Click failed: ${error}`);
      throw new Error(error);
    }

    const rect = currentElement.getBoundingClientRect();
    const eventInit = {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };

    for (const plannedEvent of createClickEventPlan()) {
      if (plannedEvent.family === 'pointer') {
        dispatchPointerLikeEvent(currentElement, plannedEvent.type, eventInit);
      } else {
        dispatchMouseLikeEvent(currentElement, plannedEvent.type, eventInit);
      }
    }

    return {
      success: true,
      data: {
        element: ref,
        tagName: currentElement.tagName,
        text: currentElement.textContent?.trim().slice(0, 50),
      },
    };
  }

  async function type(params: { element: string; text: string }): Promise<CommandResult> {
    const { element: ref, text } = params;
    const element = findElement(ref) as HTMLInputElement | HTMLTextAreaElement;

    if (!element) {
      throw new Error(`Element not found or stale: ${ref}; capture a new snapshot and retry`);
    }

    console.log(`[PartyBrowser] Typing into ${describeElement(element, ref)}`);
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

  async function selectOption(params: { element: string; value: string }): Promise<CommandResult> {
    const { element: ref, value } = params;
    const element = findElement(ref) as HTMLSelectElement;

    if (!element) {
      throw new Error(`Element not found or stale: ${ref}; capture a new snapshot and retry`);
    }

    if (element.tagName !== 'SELECT') {
      throw new Error(`Element is not a select: ${ref}`);
    }

    console.log(`[PartyBrowser] Selecting option "${value}" in ${describeElement(element, ref)}`);

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

  async function evaluate(params: { script: string }): Promise<CommandResult> {
    const { script } = params;
    console.log(`[PartyBrowser] Evaluating script: ${script.slice(0, 50)}${script.length > 50 ? '...' : ''}`);

    try {
      const fn = compileEvaluation(script);
      const resolved = await fn.call(window);

      return {
        success: true,
        data: { result: serializeResult(resolved) },
      };
    } catch (error) {
      const details = describeEvaluationError(error);
      console.error('[PartyBrowser] Evaluation failed:', details);
      return {
        success: false,
        error: details.message,
        errorCode: ErrorCodes.COMMAND_FAILED,
        ...(details.stack ? { stack: details.stack } : {}),
      };
    }
  }

  async function pressKey(params: { key: string }): Promise<CommandResult> {
    const { key } = params;
    const target = getKeyboardTarget();
    console.log(`[PartyBrowser] Pressing key '${key}' on ${describeElement(target, 'active element')}`);

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

    console.log(`[PartyBrowser] Waiting for ${seconds}s`);
    const waited = seconds * 1000;
    await delay(waited);
    return { success: true, data: { waited } };
  }

  async function waitFor(params: WaitForPayload): Promise<CommandResult> {
    const { mode } = params;
    const startTime = Date.now();

    if (mode === 'time') {
      console.log(`[PartyBrowser] Waiting for ${params.value}s`);
      const waited = Math.max(0, params.value) * 1000;
      await delay(waited);
      return { success: true, data: { mode, waited } };
    }

    if (typeof params.timeout !== 'number') {
      throw new Error(`timeout is required for mode=${mode}`);
    }

    const timeoutMs = params.timeout * 1000;

    if (mode === 'text') {
      console.log(`[PartyBrowser] Waiting for text "${params.value}" to appear (timeout: ${params.timeout}s)`);
      return waitForTextCondition({
        matches: (bodyText) => bodyText.includes(params.value),
        timeoutMs,
        errorMessage: `Timeout waiting for text: ${params.value}`,
        mode,
        startTime,
      });
    }

    if (mode === 'text_gone') {
      console.log(`[PartyBrowser] Waiting for text "${params.value}" to disappear (timeout: ${params.timeout}s)`);
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
      throw new Error(`Start element not found or stale: ${startElement}; capture a new snapshot and retry`);
    }
    if (!endEl) {
      throw new Error(`End element not found or stale: ${endElement}; capture a new snapshot and retry`);
    }

    console.log(`[PartyBrowser] Dragging ${describeElement(startEl, startElement)} to ${describeElement(endEl, endElement)}`);
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
      throw new Error(`Element not found or stale: ${params.element}; capture a new snapshot and retry`);
    }

    console.log(`[PartyBrowser] Hovering over ${describeElement(element, params.element)}`);
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
function isDisabledControlOrDescendant(element: Element): boolean {
  return element.matches(':disabled') || element.closest('button:disabled') !== null;
}

function describeEvaluationError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }

  return { message: String(error) };
}

function serializeElement(element: Element): { type: 'Element'; tagName: string; id: string; className: string } {
  return {
    type: 'Element',
    tagName: element.tagName,
    id: element.id,
    className: element.className,
  };
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
    case 'string':
      return result;
    case 'number':
      return Number.isFinite(result) ? result : String(result);
    case 'object':
      if (Array.isArray(result)) {
        return result.map(serializeResult);
      }
      if (result instanceof Element) {
        return serializeElement(result);
      }
      if (result instanceof NodeList || result instanceof HTMLCollection) {
        return Array.from(result).map(serializeResult);
      }
      try {
        return JSON.parse(JSON.stringify(result, (_key, value: unknown) => {
          if (typeof value === 'number' && !Number.isFinite(value)) {
            return String(value);
          }
          if (value instanceof Element) {
            return serializeElement(value);
          }
          if (value instanceof NodeList || value instanceof HTMLCollection) {
            return Array.from(value).map(serializeResult);
          }
          return value;
        }));
      } catch {
        return String(result);
      }
    case 'function':
      return `[Function: ${(result as Function).name || 'anonymous'}]`;
    default:
      return String(result);
  }
}

