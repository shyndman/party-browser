import { z } from 'zod';
import type BrowserNamespace from 'webextension-polyfill';
import type { CommandHandler } from '../commands/command-handler';
import type { SessionManager } from '../session/session-manager';
import { ErrorCodes, type ErrorCode } from '../utils/errors';
import {
  MCP_COMMANDS,
  PopupMessageKinds,
  RuntimeMessageKinds,
  WaitingRoomDecisions,
  type KillSwitchResponse,
  type StatusResponse,
  type WaitingRoomDecision,
  type WaitingRoomDecisionResponse,
  type WaitingRoomListResponse,
} from '../types/messages';
import type { McpBridge } from './mcp-bridge';

const messageEnvelopeSchema = z.object({ type: z.string() });
const mcpCommandSchema = z.object({
  type: z.literal(RuntimeMessageKinds.MCP_COMMAND),
  sessionId: z.string().min(1),
  command: z.enum(MCP_COMMANDS),
  params: z.record(z.string(), z.unknown()).default({}),
});
const waitingRoomListSchema = z.object({
  type: z.literal(PopupMessageKinds.GET_WAITING_ROOM_LIST),
  refresh: z.boolean().default(false),
});
const waitingRoomDecisionSchema = z.object({
  type: z.literal(PopupMessageKinds.WAITING_ROOM_DECISION),
  sessionId: z.string().min(1),
  decision: z.enum(WaitingRoomDecisions),
});
const waitingRoomSessionSchema = waitingRoomDecisionSchema.pick({ sessionId: true });

type SendResponse = (response: unknown) => void;
type McpCommand = z.infer<typeof mcpCommandSchema>;
type WaitingRoomList = z.infer<typeof waitingRoomListSchema>;
type WaitingRoomDecisionMessage = z.infer<typeof waitingRoomDecisionSchema>;

export interface RuntimeMessageContext {
  readonly isKillSwitchEnabled: boolean;
  commandHandler: Pick<CommandHandler, 'execute'>;
  sessionManager: Pick<SessionManager, 'getLeaseCount'>;
  mcpBridge: Pick<McpBridge, 'isConnected' | 'getReconnectAttempts' | 'getWaitingRoomEntries'>;
  toggleKillSwitch: () => Promise<KillSwitchResponse>;
  getWaitingRoomList: (refresh: boolean) => Promise<WaitingRoomListResponse>;
  submitWaitingRoomDecision: (sessionId: string, decision: WaitingRoomDecision) => Promise<WaitingRoomDecisionResponse>;
}

export function handleRuntimeMessage(
  context: RuntimeMessageContext,
  message: unknown,
  _sender: BrowserNamespace.Runtime.MessageSender,
  sendResponse: SendResponse,
): boolean {
  console.log('[PartyBrowser] Message received:', message);
  const envelope = messageEnvelopeSchema.safeParse(message);
  if (!envelope.success) {
    console.warn('[PartyBrowser] Invalid runtime message:', envelope.error);
    return false;
  }npm i -g @open-pencil/mcp@0.16.0

  switch (envelope.data.type) {
    case RuntimeMessageKinds.MCP_COMMAND: {
      if (!context.isKillSwitchEnabled) {
        return rejectDisabledMcpCommand(sendResponse);
      }
      const parsed = mcpCommandSchema.safeParse(message);
      return parsed.success
        ? handleMcpCommandMessage(context, parsed.data, sendResponse)
        : rejectInvalidMcpCommand(parsed.error, sendResponse);
    }
    case PopupMessageKinds.GET_STATUS:
      return handleGetStatusMessage(context, sendResponse);
    case PopupMessageKinds.TOGGLE_KILL_SWITCH:
      return handleToggleKillSwitchMessage(context, sendResponse);
    case PopupMessageKinds.GET_KILL_SWITCH_STATE:
      return handleGetKillSwitchStateMessage(context, sendResponse);
    case PopupMessageKinds.GET_WAITING_ROOM_LIST: {
      const parsed = waitingRoomListSchema.safeParse(message);
      return parsed.success
        ? handleGetWaitingRoomListMessage(context, parsed.data, sendResponse)
        : rejectInvalidWaitingRoomList(parsed.error, sendResponse);
    }
    case PopupMessageKinds.WAITING_ROOM_DECISION: {
      const parsed = waitingRoomDecisionSchema.safeParse(message);
      if (!parsed.success) {
        const session = waitingRoomSessionSchema.safeParse(message);
        return rejectInvalidWaitingRoomDecision(parsed.error, session.success ? session.data.sessionId : '', sendResponse);
      }
      return handleWaitingRoomDecisionMessage(context, parsed.data, sendResponse);
    }
    default:
      return false;
  }
}

function rejectDisabledMcpCommand(sendResponse: SendResponse): boolean {
  console.warn('[PartyBrowser] Runtime command rejected: kill switch is disabled.');
  sendResponse({
    success: false,
    error: 'Kill switch is disabled. Click the extension icon to resume MCP communications.',
    errorCode: ErrorCodes.KILL_SWITCH_DISABLED,
  });
  return false;
}

function rejectInvalidMcpCommand(error: z.ZodError, sendResponse: SendResponse): boolean {
  console.warn('[PartyBrowser] Invalid runtime command:', error);
  const missingSession = error.issues.some((issue) => issue.path[0] === 'sessionId');
  sendResponse({
    success: false,
    error: missingSession ? 'Missing required sessionId for command execution.' : error.message,
    errorCode: missingSession ? ErrorCodes.SESSION_ID_REQUIRED : ErrorCodes.COMMAND_FAILED,
  });
  return false;
}

function handleMcpCommandMessage(context: RuntimeMessageContext, message: McpCommand, sendResponse: SendResponse): boolean {
  context.commandHandler.execute(message.command, message.params, message.sessionId)
    .then((result) => sendResponse({ success: true, result }))
    .catch((error: Error & { errorCode?: ErrorCode }) => {
      console.error('[PartyBrowser] Runtime command failed:', error);
      sendResponse({ success: false, error: error.message, errorCode: error.errorCode || ErrorCodes.COMMAND_FAILED });
    });
  return true;
}

function handleGetStatusMessage(context: RuntimeMessageContext, sendResponse: SendResponse): boolean {
  const status: StatusResponse = {
    isServerRunning: context.mcpBridge.isConnected(),
    reconnectAttempts: context.mcpBridge.getReconnectAttempts(),
    isKillSwitchEnabled: context.isKillSwitchEnabled,
    activeLeaseCount: context.sessionManager.getLeaseCount(),
    waitingRoomCount: context.mcpBridge.getWaitingRoomEntries().length,
  };
  sendResponse(status);
  return false;
}

function handleToggleKillSwitchMessage(context: RuntimeMessageContext, sendResponse: SendResponse): boolean {
  context.toggleKillSwitch()
    .then(sendResponse)
    .catch((error: Error) => {
      console.error('[PartyBrowser] Runtime kill switch toggle failed:', error);
      sendResponse({ isEnabled: context.isKillSwitchEnabled, error: error.message });
    });
  return true;
}

function handleGetKillSwitchStateMessage(context: RuntimeMessageContext, sendResponse: SendResponse): boolean {
  sendResponse({ isEnabled: context.isKillSwitchEnabled });
  return false;
}

function rejectInvalidWaitingRoomList(error: z.ZodError, sendResponse: SendResponse): boolean {
  console.warn('[PartyBrowser] Invalid waiting-room list message:', error);
  sendResponse({ entries: [], refreshedAt: Date.now(), error: error.message });
  return false;
}

function handleGetWaitingRoomListMessage(context: RuntimeMessageContext, message: WaitingRoomList, sendResponse: SendResponse): boolean {
  context.getWaitingRoomList(message.refresh)
    .then(sendResponse)
    .catch((error: Error) => {
      console.error('[PartyBrowser] Runtime waiting-room list failed:', error);
      sendResponse({ entries: [], refreshedAt: Date.now(), error: error.message });
    });
  return true;
}

function rejectInvalidWaitingRoomDecision(error: z.ZodError, sessionId: string, sendResponse: SendResponse): boolean {
  console.warn('[PartyBrowser] Invalid waiting-room decision message:', error);
  sendResponse({
    success: false,
    sessionId,
    decision: WaitingRoomDecisions.REJECT,
    error: sessionId ? 'Invalid waiting-room decision.' : 'Missing required sessionId.',
    errorCode: ErrorCodes.CONTROL_EVENT_INVALID,
  });
  return false;
}

function handleWaitingRoomDecisionMessage(context: RuntimeMessageContext, message: WaitingRoomDecisionMessage, sendResponse: SendResponse): boolean {
  const { sessionId, decision } = message;
  context.submitWaitingRoomDecision(sessionId, decision)
    .then(sendResponse)
    .catch((error: Error) => {
      console.error('[PartyBrowser] Runtime waiting-room decision failed:', error);
      sendResponse({ success: false, sessionId, decision, error: error.message, errorCode: ErrorCodes.COMMAND_FAILED });
    });
  return true;
}
