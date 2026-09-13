import { defineConfig } from 'wxt';
import path from 'path';
import { execSync } from 'child_process';

// Determine Firefox binary to use:
// 1. PARTYBROWSER_FIREFOX_BIN environment variable
// 2. firefox-devedition (default for this project)
// 3. firefox (fallback)
function getFirefoxBinary(): string {
  if (process.env.PARTYBROWSER_FIREFOX_BIN) {
    return process.env.PARTYBROWSER_FIREFOX_BIN;
  }

  // Check for firefox-devedition
  try {
    execSync('which firefox-devedition', { stdio: 'pipe' });
    return 'firefox-devedition';
  } catch {
    // fall through
  }

  // Default to firefox
  return 'firefox';
}

const firefoxBinary = getFirefoxBinary();

export default defineConfig({
  manifestVersion: 2,
  webExt: {
    binaries: {
      firefox: firefoxBinary,
    },
  },
  manifest: {
    name: 'PartyBrowser',
    description: 'Browser automation for AI agents',
    permissions: [
      'activeTab',
      'tabs',
      'tabGroups',
      'storage',
      'webNavigation',
      'webRequest',
      'webRequestBlocking',
      'ws://localhost:3456/',
      '<all_urls>'
    ],
    browser_action: {
      default_title: 'PartyBrowser (click to toggle)',
      default_icon: {
        64: 'icons/state_disconnected_64.png',
        128: 'icons/state_disconnected_128.png'
      }
    },
    web_accessible_resources: ['*'],
    icons: {
      48: 'icons/state_connected_48.png',
      96: 'icons/state_connected_96.png'
    },
    browser_specific_settings: {
      gecko: {
        id: 'partybrowser@partybrowser.io',
        strict_min_version: '139.0'
      }
    }
  },
  vite: () => ({
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    }
  })
});
