/**
 * Inspection Commands for PartyBrowser extension
 * Handles inspection commands (screenshot, snapshot, logs, etc.)
 */

/// <reference path="../types/global.d.ts" />

import type BrowserNamespace from 'webextension-polyfill';

import type {
  CommandResult,
  ScreenshotParams,
  SnapshotParams,
  GetNetworkRequestsParams,
  GetNetworkRequestDetailsParams,
  GetConsoleMessagesParams,
  GetUrlParams,
  GetTitleParams,
  EvaluateParams,
  CloseParams
} from '../types/commands';
import type { SessionManager } from '../session/session-manager';
import type { NetworkCapture } from '../session/network-capture';
import type { ContentBridge } from '../messaging/content-bridge';
import { PageStateReader } from './page-state-reader';

const DEFAULT_NETWORK_BODY_ENCODING = 'utf-8';

interface DecodedUploadData {
  body?: string;
  file?: string;
}

interface DecodedRequestBody {
  error?: string;
  formData?: Record<string, string>;
  raw?: DecodedUploadData[];
}

function decodeRequestBody(
  requestBody: BrowserNamespace.WebRequest.OnBeforeRequestDetailsTypeRequestBodyType | null,
  decoder: TextDecoder,
): DecodedRequestBody | null {
  if (!requestBody) return null;
  return {
    error: requestBody.error,
    formData: requestBody.formData,
    raw: requestBody.raw?.map(({ bytes, file }) => ({
      body: bytes instanceof ArrayBuffer ? decoder.decode(bytes) : undefined,
      file,
    })),
  };
}

/**
 * Inspection command implementations
 */
export class InspectionCommands {
  constructor(
    private sessionManager: SessionManager,
    private networkCapture: NetworkCapture,
    private contentBridge: ContentBridge,
    private pageStateReader: PageStateReader = new PageStateReader(contentBridge, sessionManager),
  ) {}

  /**
   * Take a screenshot of the current tab
   */
  async screenshot(params: ScreenshotParams): Promise<CommandResult> {
    const targetTabId = await this.sessionManager.resolveTargetTab(params);

    const screenshot = await browser.tabs.captureTab(targetTabId, {
      format: 'png'
    });

    return { success: true, data: { screenshot } };
  }

  /**
   * Get accessibility tree snapshot
   */
  async snapshot(params: SnapshotParams): Promise<CommandResult> {
    const targetTabId = await this.sessionManager.resolveTargetTab(params);
    return await this.pageStateReader.snapshot(targetTabId);
  }

  /**
   * Get the current URL
   */
  async getUrl(params: GetUrlParams): Promise<CommandResult> {
    const targetTabId = await this.sessionManager.resolveTargetTab(params);
    const tab = await browser.tabs.get(targetTabId);
    return { success: true, data: { url: tab.url } };
  }

  /**
   * Get the current page title
   */
  async getTitle(params: GetTitleParams): Promise<CommandResult> {
    const targetTabId = await this.sessionManager.resolveTargetTab(params);
    const tab = await browser.tabs.get(targetTabId);
    return { success: true, data: { title: tab.title } };
  }

  /**
   * Get captured network requests
   */
  async getNetworkRequests(params: GetNetworkRequestsParams): Promise<CommandResult> {
    const tabId = await this.sessionManager.resolveTargetTab(params);

    const { filter } = params;
    const logs = this.networkCapture.getRequests(tabId, filter);

    const formatted = logs.map((r) => ({
      id: r.requestId,
      url: r.url,
      method: r.method,
      type: r.type,
      status: r.statusCode,
      timestamp: r.timestamp,
      error: r.error
    }));

    return {
      success: true,
      data: {
        count: formatted.length,
        requests: formatted
      }
    };
  }

  /**
   * Get all captured data for one network request.
   */
  async getNetworkRequestDetails(params: GetNetworkRequestDetailsParams): Promise<CommandResult> {
    const tabId = await this.sessionManager.resolveTargetTab(params);
    const request = this.networkCapture.getRequest(tabId, params.id);
    if (!request) throw new Error(`Network request "${params.id}" is no longer available.`);

    const encoding = params.encoding ?? DEFAULT_NETWORK_BODY_ENCODING;
    const decoder = new TextDecoder(encoding);
    const responseBody = request.responseBody
      ? decoder.decode(await request.responseBody.arrayBuffer())
      : null;

    return {
      success: true,
      data: {
        id: request.id,
        requestId: request.requestId,
        url: request.url,
        method: request.method,
        type: request.type,
        timestamp: request.timestamp,
        requestHeaders: request.requestHeaders,
        requestBody: decodeRequestBody(request.requestBody, decoder),
        status: request.statusCode,
        responseHeaders: request.responseHeaders,
        responseBody,
        encoding,
        error: request.error,
      },
    };
  }

  /**
   * Get console messages (filtered)
   */
  async getConsoleMessages(params: GetConsoleMessagesParams): Promise<CommandResult> {
    const targetTabId = await this.sessionManager.resolveTargetTab(params);

    let logs = await this.contentBridge.getConsoleMessages(targetTabId, false);

    if (params.level && params.level !== 'all') {
      logs = logs.filter((l) => l.level === params.level);
    }

    if (params.since) {
      logs = logs.filter((l) => l.timestamp >= params.since!);
    }

    return {
      success: true,
      data: {
        count: logs.length,
        logs: logs.map((l) => ({
          level: l.level,
          message: l.message,
          timestamp: l.timestamp,
          stack: l.stack
        }))
      }
    };
  }

  /**
   * Evaluate JavaScript in the page
   */
  async evaluate(params: EvaluateParams): Promise<CommandResult> {
    const { script } = params;
    const targetTabId = await this.sessionManager.resolveTargetTab(params);

    return await this.contentBridge.sendCommand(targetTabId, 'evaluate', { script }) as CommandResult;
  }

  /**
   * Close the session
   */
  async close(params: CloseParams): Promise<CommandResult> {
    const tabId = await this.sessionManager.resolveTargetTab(params);

    console.warn(
      `[PartyBrowser] Close command is revoking lease (sessionId=${params.sessionId})`,
    );

    await this.sessionManager.revokeLease(params.sessionId, 'user_close');
    this.networkCapture.stopCapture(tabId);
    this.networkCapture.clearLogs(tabId);

    return { success: true, data: { message: 'Session closed' } };
  }

  /**
   * Get all tabs
   */
  async getTabs(): Promise<CommandResult> {
    const tabs = await browser.tabs.query({});
    return {
      success: true,
      data: tabs.map((tab) => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        active: tab.active
      }))
    };
  }
}
