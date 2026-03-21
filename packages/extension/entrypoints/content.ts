/**
 * Content script entrypoint for PartyBrowser Firefox extension
 * Handles DOM interaction and console log capture
 */

/// <reference path="../src/types/global.d.ts" />

import { defineContentScript } from 'wxt/utils/define-content-script';
import type BrowserNamespace from 'webextension-polyfill';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { CommandResult, WaitForPayload } from '../src/types/commands';
import {
  createClickEventPlan,
  createDragEventPlan,
  createHoverEventPlan,
  createPressKeyPlan,
} from '../src/commands/interaction-realism';
import { ConsoleCapture } from '../src/session/console-capture';

const MAX_CONSOLE_LOGS = 1000;

interface ElementInfo {
  ref: string;
  tagName: string;
  role: string | null;
  type: string | null;
  name: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  checked?: boolean;
  interactive: boolean;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main(ctx: ContentScriptContext) {
    console.log('[PartyBrowser] Content script loaded on', window.location.href);

    // Initialize console capture
    const consoleCapture = new ConsoleCapture();

    // ============================================================
    // Element Finding
    // ============================================================

    interface ParsedRef {
      type: 'index' | 'css' | 'xpath' | 'text';
      index?: number;
      selector?: string;
      path?: string;
      text?: string;
    }

    function parseElementRef(ref: string): ParsedRef | null {
      if (!ref) return null;

      if (ref.match(/^e\d+$/)) {
        return { type: 'index', index: parseInt(ref.slice(1), 10) };
      }

      if (ref.startsWith('css:')) {
        return { type: 'css', selector: ref.slice(4) };
      }

      if (ref.startsWith('xpath:')) {
        return { type: 'xpath', path: ref.slice(6) };
      }

      return { type: 'text', text: ref };
    }

    function findElement(ref: string): Element | null {
      const parsed = parseElementRef(ref);
      if (!parsed) return null;

      switch (parsed.type) {
        case 'index': {
          const elements = document.querySelectorAll('[data-mcp-ref], a, button, input, select, textarea, [role="button"], [role="link"]');
          return elements[parsed.index!] || null;
        }
        case 'css':
          return document.querySelector(parsed.selector!);
        case 'xpath':
          return findByXPath(parsed.path!);
        case 'text':
          return findByText(parsed.text!);
        default:
          return null;
      }
    }

    function findByXPath(path: string): Element | null {
      try {
        const result = document.evaluate(
          path,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        return result.singleNodeValue as Element | null;
      } catch (e) {
        console.error('[PartyBrowser] XPath error:', e);
        return null;
      }
    }

    function findByText(text: string): Element | null {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        null
      );

      let node: Node | null;
      while ((node = walker.nextNode())) {
        const el = node as Element;
        if (el.textContent?.trim().includes(text)) {
          return el;
        }
      }
      return null;
    }

    function dispatchMouseLikeEvent(
      element: Element,
      type: string,
      init: MouseEventInit,
    ): void {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        ...init,
      });
      element.dispatchEvent(event);
    }

    function dispatchPointerLikeEvent(
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

    function dispatchDragLikeEvent(
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

    function dispatchKeyboardLikeEvent(element: Element, type: string, key: string): boolean {
      return element.dispatchEvent(new KeyboardEvent(type, {
        key,
        bubbles: true,
        cancelable: true,
        composed: true,
      }));
    }

    function applyTextInsertion(target: HTMLElement, text: string): void {
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        const start = target.selectionStart ?? target.value.length;
        const end = target.selectionEnd ?? target.value.length;
        target.setRangeText(text, start, end, 'end');
        return;
      }

      if (target.isContentEditable) {
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
    }

    function moveFocusToNextFocusableElement(current: HTMLElement): void {
      const focusable = Array.from(document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )).filter((candidate) => !candidate.hasAttribute('disabled') && candidate.tabIndex >= 0);

      const currentIndex = focusable.indexOf(current);
      if (currentIndex === -1) {
        return;
      }

      focusable[(currentIndex + 1) % focusable.length]?.focus();
    }

    function getKeyboardTarget(): HTMLElement {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) {
        return active;
      }

      return document.body;
    }

    // ============================================================
    // Command Implementations
    // ============================================================

    async function clickElement(params: { element: string }): Promise<CommandResult> {
      const { element: ref } = params;
      const element = findElement(ref);

      if (!element) {
        throw new Error(`Element not found: ${ref}`);
      }

      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise((resolve) => setTimeout(resolve, 100));

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
          text: element.textContent?.trim().slice(0, 50)
        }
      };
    }

    async function typeIntoElement(params: { element: string; text: string }): Promise<CommandResult> {
      const { element: ref, text } = params;
      const element = findElement(ref) as HTMLInputElement | HTMLTextAreaElement;

      if (!element) {
        throw new Error(`Element not found: ${ref}`);
      }

      element.focus();
      await new Promise((resolve) => setTimeout(resolve, 50));

      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }

      for (const char of text) {
        element.dispatchEvent(new KeyboardEvent('keydown', {
          key: char,
          bubbles: true
        }));

        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
          element.value += char;
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }

        element.dispatchEvent(new KeyboardEvent('keyup', {
          key: char,
          bubbles: true
        }));

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.blur();

      return {
        success: true,
        data: {
          element: ref,
          value: text.slice(0, 50)
        }
      };
    }

    async function evaluateScript(params: { script: string }): Promise<CommandResult> {
      const { script } = params;

      try {
        const fn = new Function(script);
        const result = fn.call(window);

        if (result instanceof Promise) {
          const resolved = await result;
          return {
            success: true,
            data: { result: serializeResult(resolved) }
          };
        }

        return {
          success: true,
          data: { result: serializeResult(result) }
        };
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message,
          stack: (error as Error).stack
        };
      }
    }

    function serializeResult(result: unknown): unknown {
      if (result === null) return null;
      if (result === undefined) return undefined;

      const type = typeof result;

      switch (type) {
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
              className: result.className
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

    function getSnapshot(): CommandResult {
      const tree = buildAccessibilityTree(document.body);
      return {
        success: true,
        data: {
          url: window.location.href,
          title: document.title,
          tree
        }
      };
    }

    function buildAccessibilityTree(root: HTMLElement): ElementInfo[] {
      const elements: ElementInfo[] = [];
      let refCounter = 0;

      function traverse(node: Element, depth = 0): void {
        if (depth > 50) return;

        const info = getElementInfo(node, refCounter++);
        if (info && info.interactive) {
          elements.push(info);
        }

        for (const child of Array.from(node.children)) {
          traverse(child as HTMLElement, depth + 1);
        }
      }

      traverse(root);
      return elements;
    }

    function getElementInfo(element: Element, ref: number): ElementInfo | null {
      const tagName = element.tagName.toLowerCase();
      const role = element.getAttribute('role');
      const ariaLabel = element.getAttribute('aria-label');
      const ariaLabelledBy = element.getAttribute('aria-labelledby');

      const interactiveTypes = ['a', 'button', 'input', 'select', 'textarea'];
      const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'textbox', 'combobox', 'menuitem'];

      const isInteractive = interactiveTypes.includes(tagName) ||
                           interactiveRoles.includes(role || '') ||
                           (element as HTMLElement).onclick !== null ||
                           (element as HTMLElement).tabIndex >= 0;

      if (!isInteractive) return null;

      let name = ariaLabel || '';
      if (!name && ariaLabelledBy) {
        const labelElement = document.getElementById(ariaLabelledBy);
        if (labelElement) {
          name = labelElement.textContent || '';
        }
      }
      if (!name) {
        name = element.textContent?.trim() || (element as HTMLInputElement).value || (element as HTMLInputElement).placeholder || '';
      }

      let inputType: string | null = null;
      if (tagName === 'input') {
        inputType = (element as HTMLInputElement).type || 'text';
      }

      element.setAttribute('data-mcp-ref', `e${ref}`);

      return {
        ref: `e${ref}`,
        tagName,
        role,
        type: inputType,
        name: name.slice(0, 100),
        value: (element as HTMLInputElement).value?.slice(0, 100),
        placeholder: (element as HTMLInputElement).placeholder,
        disabled: (element as HTMLInputElement).disabled,
        checked: (element as HTMLInputElement).checked,
        interactive: true
      };
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

      const options = Array.from(element.options);
      const option = options.find((opt) =>
        opt.value === value || opt.textContent?.trim() === value
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
          selectedText: option.textContent?.trim()
        }
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

        const inputType = plannedEvent.type === 'beforeinput' ? 'insertText' : 'insertText';
        const inputEvent = new InputEvent(plannedEvent.type, {
          bubbles: true,
          cancelable: plannedEvent.type === 'beforeinput',
          composed: true,
          data: plan.insertText ?? null,
          inputType,
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

    async function waitForDuration(params: { time: number }): Promise<CommandResult> {
      const seconds = Number(params.time);
      if (!Number.isFinite(seconds) || seconds < 0) {
        throw new Error(`Invalid wait time: ${params.time}`);
      }

      const waitMs = seconds * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return { success: true, data: { waited: waitMs } };
    }

    async function waitForCondition(params: WaitForPayload): Promise<CommandResult> {
      const { mode } = params;
      const startTime = Date.now();

      if (mode === 'time') {
        const delayMs = Math.max(0, params.value) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return { success: true, data: { mode, waited: delayMs } };
      }

      if (typeof params.timeout !== 'number') {
        throw new Error(`timeout is required for mode=${mode}`);
      }

      const timeoutMs = params.timeout * 1000;

      if (mode === 'text') {
        return new Promise((resolve, reject) => {
          const checkInterval = setInterval(() => {
            const bodyText = document.body.innerText || '';
            const elapsed = Date.now() - startTime;

            if (bodyText.includes(params.value)) {
              clearInterval(checkInterval);
              resolve({ success: true, data: { mode, waited: elapsed } });
            }

            if (elapsed >= timeoutMs) {
              clearInterval(checkInterval);
              reject(new Error(`Timeout waiting for text: ${params.value}`));
            }
          }, 100);
        });
      }

      if (mode === 'text_gone') {
        return new Promise((resolve, reject) => {
          const checkInterval = setInterval(() => {
            const bodyText = document.body.innerText || '';
            const elapsed = Date.now() - startTime;

            if (!bodyText.includes(params.value)) {
              clearInterval(checkInterval);
              resolve({ success: true, data: { mode, waited: elapsed } });
            }

            if (elapsed >= timeoutMs) {
              clearInterval(checkInterval);
              reject(new Error(`Timeout waiting for text to disappear: ${params.value}`));
            }
          }, 100);
        });
      }

      throw new Error(`Unknown wait mode: ${mode}`);
    }

    async function dragElement(params: { startElement: string; endElement: string }): Promise<CommandResult> {
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

      const startX = startRect.left + startRect.width / 2;
      const startY = startRect.top + startRect.height / 2;
      const endX = endRect.left + endRect.width / 2;
      const endY = endRect.top + endRect.height / 2;

      const dataTransfer = new DataTransfer();

      for (const plannedEvent of createDragEventPlan()) {
        const target = plannedEvent.target === 'source' ? startEl : endEl;
        const eventInit = plannedEvent.target === 'source'
          ? { clientX: startX, clientY: startY }
          : { clientX: endX, clientY: endY };

        if (plannedEvent.family === 'drag') {
          dispatchDragLikeEvent(target, plannedEvent.type, dataTransfer, eventInit);
        } else {
          dispatchMouseLikeEvent(target, plannedEvent.type, eventInit);
        }

        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      return { success: true, data: { startElement, endElement } };
    }

    async function hoverElement(params: { element: string }): Promise<CommandResult> {
      const { element } = params;
      const el = findElement(element);

      if (!el) {
        throw new Error(`Element not found: ${element}`);
      }

      const rect = el.getBoundingClientRect();
      const eventInit = {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      };

      for (const plannedEvent of createHoverEventPlan()) {
        if (plannedEvent.family === 'pointer') {
          dispatchPointerLikeEvent(el, plannedEvent.type, eventInit);
        } else {
          dispatchMouseLikeEvent(el, plannedEvent.type, eventInit);
        }
      }

      return { success: true, data: { element } };
    }

    // ============================================================
    // Command Router
    // ============================================================

    interface CommandMessage {
      command: string;
      params: Record<string, unknown>;
    }

    async function executeCommand(message: CommandMessage): Promise<CommandResult> {
      const { command, params } = message;

      switch (command) {
        case 'click':
          return await clickElement(params as { element: string });
        case 'type':
          return await typeIntoElement(params as { element: string; text: string });
        case 'evaluate':
          return await evaluateScript(params as { script: string });
        case 'snapshot':
          return getSnapshot();
        case 'select_option':
          return await selectOption(params as { element: string; value: string });
        case 'press_key':
          return await pressKey(params as { key: string });
        case 'wait':
          return await waitForDuration(params as { time: number });
        case 'wait_for':
          return await waitForCondition(params as WaitForPayload);
        case 'drag':
          return await dragElement(params as { startElement: string; endElement: string });
        case 'hover':
          return await hoverElement(params as { element: string });
        default:
          throw new Error(`Unknown command: ${command}`);
      }
    }

    // ============================================================
    // Message Listener
    // ============================================================

    browser.runtime.onMessage.addListener(((
      message: unknown,
      _sender: BrowserNamespace.Runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ): boolean => {
      const msg = message as { type?: string; command?: string; params?: Record<string, unknown>; clear?: boolean };
      console.log('[PartyBrowser] Content script received:', message);

      if (msg.type === 'executeCommand') {
        executeCommand({ command: msg.command!, params: msg.params || {} })
          .then((result) => sendResponse(result))
          .catch((error) => sendResponse({
            success: false,
            error: (error as Error).message,
            stack: (error as Error).stack
          }));
        return true;
      }

      if (msg.type === 'getConsoleMessages') {
        const logs = consoleCapture.getLogs(msg.clear);
        sendResponse({
          success: true,
          logs: logs
        });
        return false;
      }

      if (msg.type === 'ping') {
        sendResponse({ success: true });
        return false;
      }

      return false;
    }) as BrowserNamespace.Runtime.OnMessageListener);

    // Cleanup on HMR
    ctx.onInvalidated(() => {
      console.log('[PartyBrowser] Content script invalidated');
      consoleCapture.dispose();
    });

    // Signal ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        console.log('[PartyBrowser] Content script ready');
      });
    } else {
      console.log('[PartyBrowser] Content script ready (document already loaded)');
    }
  }
});
