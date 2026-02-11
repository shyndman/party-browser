import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground({
  persistent: true,
  main() {
    console.log('[Blindflight] Background script initialized');
  }
});
