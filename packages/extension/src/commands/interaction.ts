/**
 * Interaction Commands for PartyBrowser extension
 * Handles DOM interaction commands (click, type, drag, hover, etc.)
 */

/// <reference path="../types/global.d.ts" />

import type {
  CommandResult,
  ClickParams,
  TypeParams,
  SelectOptionParams,
  PressKeyParams,
  DragParams,
  HoverParams,
  WaitParams,
  WaitForParams,
  WaitForPayload
} from '../types/commands';
import type { SessionManager } from '../session/session-manager';
import type { ContentBridge } from '../messaging/content-bridge';

/**
 * Interaction command implementations
 */
export class InteractionCommands {
  constructor(
    private sessionManager: SessionManager,
    private contentBridge: ContentBridge
  ) {}

  /**
   * Click on an element
   */
  async click(params: ClickParams): Promise<CommandResult> {
    const { element } = params;
    const targetTabId = await this.sessionManager.resolveTargetTab(params);

    return await this.contentBridge.sendCommand(targetTabId, 'click', { element }) as CommandResult;
  }

  /**
   * Type text into an element
   */
  async type(params: TypeParams): Promise<CommandResult> {
    const { element, text } = params;
    const targetTabId = await this.sessionManager.resolveTargetTab(params);

    return await this.contentBridge.sendCommand(targetTabId, 'type', { element, text }) as CommandResult;
  }

  /**
   * Select an option from a dropdown
   */
  async selectOption(params: SelectOptionParams): Promise<CommandResult> {
    const { element, value } = params;
    const targetTabId = await this.sessionManager.resolveTargetTab(params);

    return await this.contentBridge.sendCommand(targetTabId, 'select_option', { element, value }) as CommandResult;
  }

  /**
   * Press a key
   */
  async pressKey(params: PressKeyParams): Promise<CommandResult> {
    const { key } = params;
    const targetTabId = await this.sessionManager.resolveTargetTab(params);

    return await this.contentBridge.sendCommand(targetTabId, 'press_key', { key }) as CommandResult;
  }

  /**
   * Drag an element from start to end
   */
  async drag(params: DragParams): Promise<CommandResult> {
    const { startElement, endElement } = params;
    const targetTabId = await this.sessionManager.resolveTargetTab(params);

    return await this.contentBridge.sendCommand(targetTabId, 'drag', { startElement, endElement }) as CommandResult;
  }

  /**
   * Hover over an element
   */
  async hover(params: HoverParams): Promise<CommandResult> {
    const { element } = params;
    const targetTabId = await this.sessionManager.resolveTargetTab(params);

    return await this.contentBridge.sendCommand(targetTabId, 'hover', { element }) as CommandResult;
  }

  /**
   * Wait for a specified time
   */
  async wait(params: WaitParams): Promise<CommandResult> {
    const { time } = params;
    const targetTabId = await this.sessionManager.resolveTargetTab(params);
    return await this.contentBridge.sendCommand(targetTabId, 'wait', { time }) as CommandResult;
  }

  /**
   * Wait for a condition to be met
   */
  async waitFor(params: WaitForParams): Promise<CommandResult> {
    const targetTabId = await this.sessionManager.resolveTargetTab(params);
    let payload: WaitForPayload;

    if (params.mode === 'time') {
      payload = { mode: 'time', value: params.value, timeout: params.timeout };
    } else if (params.mode === 'text') {
      payload = { mode: 'text', value: params.value, timeout: params.timeout };
    } else {
      payload = { mode: 'text_gone', value: params.value, timeout: params.timeout };
    }

    return await this.contentBridge.sendCommand(targetTabId, 'wait_for', payload) as CommandResult;
  }
}
