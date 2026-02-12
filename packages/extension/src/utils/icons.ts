/**
 * Icon Manager for PartyBrowser extension
 * Manages toolbar icon states
 */

/// <reference path="../types/global.d.ts" />

export type IconState = 'connected' | 'disconnected' | 'off';

export const ICON_PATHS = {
  connected: {
    64: 'icons/state_connected_64.png',
    128: 'icons/state_connected_128.png'
  },
  disconnected: {
    64: 'icons/state_disconnected_64.png',
    128: 'icons/state_disconnected_128.png'
  },
  off: {
    64: 'icons/state_off_64.png',
    128: 'icons/state_off_128.png'
  }
} as const;

/**
 * Manages the toolbar icon state
 */
export class IconManager {
  private currentState: IconState = 'disconnected';

  /**
   * Set the icon state
   * @param state The icon state ('connected', 'disconnected', or 'off')
   */
  setState(state: IconState): void {
    this.currentState = state;

    void browser.browserAction.setIcon({ path: ICON_PATHS[state] }).catch((error: Error) => {
      console.error('[PartyBrowser] Failed to update toolbar icon:', error);
    });
  }

  /**
   * Get the current icon state
   */
  getState(): IconState {
    return this.currentState;
  }

  /**
   * Update icon based on connection and kill switch status
   * @param isConnected Whether connected to MCP server
   * @param isKillSwitchEnabled Whether kill switch is enabled
   */
  updateFromStatus(isConnected: boolean, isKillSwitchEnabled: boolean): void {
    const state: IconState = !isKillSwitchEnabled
      ? 'off'
      : (isConnected ? 'connected' : 'disconnected');
    this.setState(state);
  }
}
