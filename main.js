"use strict";

const pinnedTabs = new Set;

browser.tabs.query({ pinned: true })
    .then(tabs => {
        for (const tab of tabs) {
            pinnedTabs.add(tab.id);
        }
    });

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!("windowId" in changeInfo) && ("pinned" in changeInfo)) {
        if (changeInfo.pinned) {
            pinnedTabs.add(tabId);
        } else {
            pinnedTabs.delete(tabId);
        }
    }
});

browser.tabs.onCreated.addListener(tab => {
    if (tab.pinned) {
        pinnedTabs.add(tab.id);
    }
});

browser.tabs.onRemoved.addListener(tabId => {
    pinnedTabs.delete(tabId);
});



let shouldRevert = true;

browser.tabs.onDetached.addListener(async (tabId, details) => {
    if (!shouldRevert) {
        return;
    }

    const { length: highlightedCount }
        = await browser.tabs.query({ highlighted: true });
    const { length: windowCount }
        = await browser.windows.getAll({ windowTypes: [ "normal" ] });

    // Don't try to revert actions on multiple highlighted tabs
    if (highlightedCount > windowCount) {
        return;
    }    

    shouldRevert = false;

    try {
        await browser.windows.get(details.oldWindowId);

        await browser.tabs.move(tabId, {
            windowId: details.oldWindowId
          , index: details.oldPosition
        });
    } catch (err) {
        await browser.windows.create({
            tabId
        });
    }

    await browser.tabs.update(tabId, {
        active: true
      , pinned: pinnedTabs.has(tabId)
    });

    shouldRevert = true;
});
