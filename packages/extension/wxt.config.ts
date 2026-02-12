import { defineConfig } from 'wxt';
import path from 'path';

export default defineConfig({
  manifestVersion: 2,
  manifest: {
    name: 'PartyBrowser',
    description: 'Browser automation for AI agents',
    permissions: [
      'activeTab',
      'tabs',
      'tabGroups',
      'storage',
      'webRequest',
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
        strict_min_version: '109.0'
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
