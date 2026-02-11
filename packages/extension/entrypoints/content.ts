/**
 * Content script for Blindflight Firefox extension
 * Handles DOM interaction and accessibility tree generation
 */

/// <reference path="../src/types/global.d.ts" />

import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { CommandResult } from '../src/types/commands';

const MAX_CONSOLE_LOGS = 1000;

interface ConsoleLogEntry {
  level: 'log' | 'error' | 'warn' | 'info';
  message: string;
  timestamp: number;
  stack?: string;
}

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
    console.log('[Blindflight] Content script loaded on', window.location.href);

    // Ring buffer for console logs
    const consoleLogs: ConsoleLogEntry[] = [];

    // Store original console methods
    const originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info
    };

    /**
     * Push log entry to ring buffer
     */
    function pushConsoleLog(level: ConsoleLogEntry['level'], args: unknown[]): void {
      const entry: ConsoleLogEntry = {
        level,
        message: args.map((arg) => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        }).join(' '),
        timestamp: Date.now(),
        stack: level === 'error' ? new Error().stack : undefined
      };

      consoleLogs.push(entry);

      if (consoleLogs.length > MAX_CONSOLE_LOGS) {
        consoleLogs.shift();
      }
    }

    // Override console methods
    console.log = function(...args: unknown[]) {
      pushConsoleLog('log', args);
      originalConsole.log.apply(console, args);
    };

    console.error = function(...args: unknown[]) {
      pushConsoleLog('error', args);
      originalConsole.error.apply(console, args);
    };

    console.warn = function(...args: unknown[]) {
      pushConsoleLog('warn', args);
      originalConsole.warn.apply(console, args);
    };

    console.info = function(...args: unknown[]) {
      pushConsoleLog('info', args);
      originalConsole.info.apply(console, args);
    };

    // Capture uncaught errors
    window.onerror = function(message, source, lineno, colno) {
      pushConsoleLog('error', [`Uncaught: ${message} at ${source}:${lineno}:${colno}`]);
      return false;
    };

    // Capture unhandled promise rejections
    window.onunhandledrejection = function(event) {
      pushConsoleLog('error', [`Unhandled Promise Rejection: ${event.reason}`]);
    };

    /**
     * Get console logs with optional clear
     */
    function getConsoleLogs(clear = false): ConsoleLogEntry[] {
      const logs = [...consoleLogs];
      if (clear) {
        consoleLogs.length = 0;
      }
      return logs;
    }

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
        console.error('[Blindflight] XPath error:', e);
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

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      element.dispatchEvent(clickEvent);

      (element as HTMLElement).click();

      return {
        success: true,
        data: {
          element: ref,
          tagName: element.tagName,
          text: element.textContent?.trim().slice(0, 50)
        }
      };
    }

    async function typeIntoElement(params: { element: string; value: string }): Promise<CommandResult> {
      const { element: ref, value } = params;
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

      for (const char of value) {
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
          value: value.slice(0, 50)
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

      const keydownEvent = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(keydownEvent);

      const keyupEvent = new KeyboardEvent('keyup', {
        key,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(keyupEvent);

      return { success: true, data: { key } };
    }

    async function waitForCondition(params: { mode: string; value: string; timeout?: number }): Promise<CommandResult> {
      const { mode, value, timeout: timeoutSeconds = 30 } = params;
      const timeoutMs = timeoutSeconds * 1000;
      const startTime = Date.now();

      if (mode === 'time') {
        const seconds = parseInt(value, 10) || 1;
        const ms = seconds * 1000;
        await new Promise((resolve) => setTimeout(resolve, ms));
        return { success: true, data: { mode, waited: ms } };
      }

      if (mode === 'text') {
        return new Promise((resolve, reject) => {
          const checkInterval = setInterval(() => {
            const bodyText = document.body.innerText || '';
            const elapsed = Date.now() - startTime;

            if (bodyText.includes(value)) {
              clearInterval(checkInterval);
              resolve({ success: true, data: { mode, waited: elapsed } });
            }

            if (elapsed >= timeoutMs) {
              clearInterval(checkInterval);
              reject(new Error(`Timeout waiting for text: ${value}`));
            }
          }, 100);
        });
      }

      if (mode === 'text_gone') {
        return new Promise((resolve, reject) => {
          const checkInterval = setInterval(() => {
            const bodyText = document.body.innerText || '';
            const elapsed = Date.now() - startTime;

            if (!bodyText.includes(value)) {
              clearInterval(checkInterval);
              resolve({ success: true, data: { mode, waited: elapsed } });
            }

            if (elapsed >= timeoutMs) {
              clearInterval(checkInterval);
              reject(new Error(`Timeout waiting for text to disappear: ${value}`));
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

      startEl.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: startX,
        clientY: startY
      }));

      await new Promise((resolve) => setTimeout(resolve, 50));

      document.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        clientX: endX,
        clientY: endY
      }));

      await new Promise((resolve) => setTimeout(resolve, 50));

      endEl.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        clientX: endX,
        clientY: endY
      }));

      return { success: true, data: { startElement, endElement } };
    }

    async function hoverElement(params: { element: string }): Promise<CommandResult> {
      const { element } = params;
      const el = findElement(element);

      if (!el) {
        throw new Error(`Element not found: ${element}`);
      }

      el.dispatchEvent(new MouseEvent('mouseover', {
        bubbles: true,
        cancelable: true
      }));

      el.dispatchEvent(new MouseEvent('mouseenter', {
        bubbles: true,
        cancelable: true
      }));

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
          return await typeIntoElement(params as { element: string; value: string });
        case 'evaluate':
          return await evaluateScript(params as { script: string });
        case 'snapshot':
          return getSnapshot();
        case 'select_option':
          return await selectOption(params as { element: string; value: string });
        case 'press_key':
          return await pressKey(params as { key: string });
        case 'wait_for':
          return await waitForCondition(params as { mode: string; value: string; timeout?: number });
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
      sender: browser.Runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ): boolean => {
      const msg = message as { type?: string; command?: string; params?: Record<string, unknown>; clear?: boolean };
      console.log('[Blindflight] Content script received:', message);

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

      if (msg.type === 'getConsoleLogs') {
        const logs = getConsoleLogs(msg.clear);
        sendResponse({
          success: true,
          logs: logs
        });
        return false;
      }

      return false;
    }) as browser.Runtime.OnMessageListener);

    // Cleanup on HMR
    ctx.onInvalidated(() => {
      console.log('[Blindflight] Content script invalidated');
    });

    // Signal ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        console.log('[Blindflight] Content script ready');
      });
    } else {
      console.log('[Blindflight] Content script ready (document already loaded)');
    }
  }
});
