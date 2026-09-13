import type { TabGroups, Tabs } from 'webextension-polyfill';

const TAKEOVER_GROUP_TITLE = '✨';
const TAKEOVER_GROUP_COLOR = 'grey';

/** Saves only the borrowed tab's placement; existing groups remain user-owned. */
export class TakeoverGroup {
  private originalTab?: Tabs.Tab;
  private originalGroup?: TabGroups.TabGroup;
  private recreateOriginal = false;
  private moved = false;

  constructor(private readonly tabId: number) {}

  async setup(): Promise<void> {
    const tab = await browser.tabs.get(this.tabId);
    this.originalTab = tab;
    let singleton = false;
    if (tab.groupId !== undefined && tab.groupId !== browser.tabGroups.TAB_GROUP_ID_NONE) {
      this.originalGroup = await browser.tabGroups.get(tab.groupId);
      const members = await browser.tabs.query({ groupId: tab.groupId });
      singleton = members.length === 1 && members[0]?.id === this.tabId;
    }

    const groupId = await browser.tabs.group({
      tabIds: this.tabId,
      createProperties: { windowId: tab.windowId },
    });
    this.moved = true;
    // Moving the last member removes its group as part of tabs.group itself.
    // A group that retained other members must never be resurrected later.
    this.recreateOriginal = singleton;
    await browser.tabGroups.update(groupId, {
      title: TAKEOVER_GROUP_TITLE,
      color: TAKEOVER_GROUP_COLOR,
      collapsed: false,
    });
  }

  async restore(): Promise<void> {
    const tab = this.originalTab;
    if (!this.moved || !tab) {
      return;
    }
    this.moved = false;

    try {
      await browser.tabs.get(this.tabId);
      const groups = this.originalGroup ? await browser.tabGroups.query({}) : [];
      const existingGroup = groups.find((group) => group.id === this.originalGroup?.id);
      const windowId = existingGroup?.windowId ?? tab.windowId;

      await browser.tabs.ungroup(this.tabId);
      // Grouping unpins tabs, so restore pinning before moving to a pinned index.
      if (tab.pinned) {
        await browser.tabs.update(this.tabId, { pinned: true });
      }
      await browser.tabs.move(this.tabId, { windowId, index: tab.index });

      if (existingGroup) {
        await browser.tabs.group({ tabIds: this.tabId, groupId: existingGroup.id });
        const members = await browser.tabs.query({ groupId: existingGroup.id });
        // Existing groups may have moved meanwhile. Keep membership intact when
        // the saved absolute index is no longer inside the group's span.
        const indices = members.map((member) => member.index);
        const index = Math.max(Math.min(...indices), Math.min(tab.index, Math.max(...indices)));
        await browser.tabs.move(this.tabId, { index });
      } else if (this.originalGroup && this.recreateOriginal) {
        const groupId = await browser.tabs.group({
          tabIds: this.tabId,
          createProperties: { windowId },
        });
        await browser.tabGroups.update(groupId, {
          title: this.originalGroup.title ?? '',
          color: this.originalGroup.color,
          collapsed: this.originalGroup.collapsed,
        });
      } else {
        // Moving between grouped tabs may implicitly group the borrowed tab.
        await browser.tabs.ungroup(this.tabId);
      }
    } catch (error) {
      console.warn(`[PartyBrowser] Failed to restore takeover tab ${this.tabId}:`, error);
    }
  }
}
