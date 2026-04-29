/**
 * Command Handler for PartyBrowser extension
 * Routes commands to appropriate command modules
 */

/// <reference path="../types/global.d.ts" />

import type {
  CommandResult,
  CommandName,
  NavigateParams,
  ClickParams,
  TypeParams,
  EvaluateParams,
  ScreenshotParams,
  SnapshotParams,
  SelectOptionParams,
  WaitParams,
  GetNetworkRequestsParams,
  GetConsoleMessagesParams,
  GoBackParams,
  GoForwardParams,
  PressKeyParams,
  WaitForParams,
  DragParams,
  HoverParams,
  CloseParams,
  GetUrlParams,
  GetTitleParams
} from '../types/commands';
import { ErrorCodes, type ErrorCode, CodedError } from '../utils/errors';
import type { SessionManager } from '../session/session-manager';
import type { NetworkCapture } from '../session/network-capture';
import type { ContentBridge } from '../messaging/content-bridge';
import { NavigationCommands } from './navigation';
import { InteractionCommands } from './interaction';
import { InspectionCommands } from './inspection';
import { logCommandPhase } from './command-logging';
import { PageStateReader } from './page-state-reader';
import { CommandWorkflowError, TabLifecycle } from './tab-lifecycle';

/**
 * Command handler that routes commands to category modules
 */
export class CommandHandler {
  private navigation: NavigationCommands;
  private interaction: InteractionCommands;
  private inspection: InspectionCommands;

  constructor(
    private sessionManager: SessionManager,
    private networkCapture: NetworkCapture,
    private contentBridge: ContentBridge
  ) {
    const pageStateReader = new PageStateReader(contentBridge, sessionManager);
    const lifecycle = new TabLifecycle();

    this.navigation = new NavigationCommands(sessionManager, networkCapture, pageStateReader, lifecycle);
    this.interaction = new InteractionCommands(sessionManager, contentBridge, pageStateReader, lifecycle);
    this.inspection = new InspectionCommands(sessionManager, networkCapture, contentBridge, pageStateReader);
  }

  /**
   * Execute a command by name
   * @param command The command name
   * @param params Command parameters
   * @returns Promise resolving to command result
   */
  async execute(
    command: CommandName,
    params: Record<string, unknown>,
    sessionId: string,
    commandId?: string,
  ): Promise<CommandResult> {
    const sessionScopedParams = {
      ...params,
      sessionId,
    };

    logCommandPhase('log', 'Command workflow started.', {
      command,
      commandId,
      origin: 'user',
      phase: 'begin',
      sessionId,
      params: sessionScopedParams,
    });

    try {
      await this.sessionManager.resolveTargetTab(
        sessionScopedParams as { sessionId?: string; tabId?: number },
      );

      let result: CommandResult;

      switch (command) {
        // Navigation commands
        case 'navigate':
          result = await this.navigation.navigate(sessionScopedParams as unknown as NavigateParams, { commandId });
          break;
        case 'go_back':
          result = await this.navigation.goBack(sessionScopedParams as unknown as GoBackParams, { commandId });
          break;
        case 'go_forward':
          result = await this.navigation.goForward(sessionScopedParams as unknown as GoForwardParams, { commandId });
          break;

        // Interaction commands
        case 'click':
          result = await this.interaction.click(sessionScopedParams as unknown as ClickParams, { commandId });
          break;
        case 'type':
          result = await this.interaction.type(sessionScopedParams as unknown as TypeParams, { commandId });
          break;
        case 'select_option':
          result = await this.interaction.selectOption(sessionScopedParams as unknown as SelectOptionParams, { commandId });
          break;
        case 'press_key':
          result = await this.interaction.pressKey(sessionScopedParams as unknown as PressKeyParams, { commandId });
          break;
        case 'drag':
          result = await this.interaction.drag(sessionScopedParams as unknown as DragParams, { commandId });
          break;
        case 'hover':
          result = await this.interaction.hover(sessionScopedParams as unknown as HoverParams, { commandId });
          break;
        case 'wait':
          result = await this.interaction.wait(sessionScopedParams as unknown as WaitParams);
          break;
        case 'wait_for':
          result = await this.interaction.waitFor(sessionScopedParams as unknown as WaitForParams);
          break;

        // Inspection commands
        case 'screenshot':
          result = await this.inspection.screenshot(sessionScopedParams as unknown as ScreenshotParams);
          break;
        case 'snapshot':
          result = await this.inspection.snapshot(sessionScopedParams as unknown as SnapshotParams);
          break;
        case 'getUrl':
          result = await this.inspection.getUrl(sessionScopedParams as unknown as GetUrlParams);
          break;
        case 'getTitle':
          result = await this.inspection.getTitle(sessionScopedParams as unknown as GetTitleParams);
          break;
        case 'getNetworkRequests':
          result = await this.inspection.getNetworkRequests(sessionScopedParams as unknown as GetNetworkRequestsParams);
          break;
        case 'getConsoleMessages':
          result = await this.inspection.getConsoleMessages(sessionScopedParams as unknown as GetConsoleMessagesParams);
          break;
        case 'evaluate':
          result = await this.inspection.evaluate(sessionScopedParams as unknown as EvaluateParams);
          break;
        case 'close':
          result = await this.inspection.close(sessionScopedParams as unknown as CloseParams);
          break;
        case 'getTabs':
          result = await this.inspection.getTabs();
          break;

        default:
          throw new Error(`Unknown command: ${command}`);
      }

      logCommandPhase('log', 'Command workflow succeeded.', {
        command,
        commandId,
        origin: 'user',
        phase: 'success',
        sessionId,
        waitRequired: result.meta?.workflow?.waitRequired,
      });

      return result;
    } catch (error) {
      const failedPhase = error instanceof CommandWorkflowError ? error.phase : undefined;
      logCommandPhase('error', 'Command workflow failed.', {
        command,
        commandId,
        origin: 'user',
        phase: 'failure',
        failedPhase,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Pass through CodedError as-is
      if (error instanceof CodedError) {
        return {
          success: false,
          error: error.message,
          errorCode: error.errorCode,
          stack: error.stack,
          meta: failedPhase
            ? { workflow: { failedPhase } }
            : undefined,
        };
      }

      return {
        success: false,
        error: (error as Error).message,
        errorCode: (error as { errorCode?: ErrorCode }).errorCode || ErrorCodes.COMMAND_FAILED,
        stack: (error as Error).stack,
        meta: failedPhase
          ? { workflow: { failedPhase } }
          : undefined,
      };
    }
  }
}
