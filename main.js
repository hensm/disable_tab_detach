"use strict";

const _ = browser.i18n.getMessage;


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


let detachDetails = null;
let attachDetails = null;

browser.tabs.onDetached.addListener(async (tabId, details) => {
    if (detachDetails && attachDetails) {
        attachDetails = null;
    }

    detachDetails = details;
});

browser.tabs.onAttached.addListener(async (tabId, details) => {
    attachDetails = details;

    onTabMovedBetweenWindows(tabId, {
        ...detachDetails
      , ...attachDetails
    });
});


let shouldRevert = true;

async function onTabMovedBetweenWindows (tabId, details) {
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

    const newWindow = await browser.windows.get(details.newWindowId, {
        populate: true
    });

    // Don't revert moves between existing windows
    if (newWindow.tabs.length > 1) {
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
}


async function moveTabToWindow (tabId, windowId, pinned) {
    shouldRevert = false;

    await browser.tabs.move(tabId, {
        windowId
      , index: pinned ? 0 : -1
    });

    shouldRevert = true;
}

async function moveTabToNewWindow (tabId) {
    shouldRevert = false;

    const newWindow = await browser.windows.create({
        tabId
    });

    shouldRevert = true;

    return newWindow;
}


browser.menus.create({
    id: "moveTabToNewWindow"
  , title: _("moveTabToNewWindow")
  , contexts: [ "tab" ]
});

browser.menus.create({
    id: "separator"
  , type: "separator"
  , contexts: [ "tab" ]
});
browser.menus.create({
    id: "separatorTitle"
  , title: _("moveTabToWindow")
  , enabled: false
  , contexts: [ "tab" ]
});

browser.menus.onClicked.addListener(async (info, tab) => {
    switch (info.menuItemId) {
        case "moveTabToNewWindow": {
            moveTabToNewWindow(tab.id);
            break;
        }

        default: {
            if (info.menuItemId.startsWith("win-")) {
                const destinationWindowId = getMenuWindowId(info.menuItemId);
                await moveTabToWindow(tab.id, destinationWindowId, tab.pinned);
                await browser.windows.update(destinationWindowId, {
                    focused: true
                });
                await browser.tabs.update(tab.id, {
                    active: true
                });
            }
        }
    }
});


function getWindowMenuId (windowId) {
    return `win-${windowId}`;
}
function getMenuWindowId (menuItemId) {
    return parseInt(menuItemId.slice(4));
}

let lastMenuInstanceId = 0;
let nextMenuInstanceId = 1;

const temporaryMenuIds = new Set();

browser.menus.onShown.addListener(async (info, tab) => {
    const menuInstanceId = nextMenuInstanceId++;
    lastMenuInstanceId = menuInstanceId;

    const windows = (await browser.windows.getAll({
            populate: true
          , windowTypes: [ "normal" ]
        })).filter(window => window.id !== tab.windowId);

    if (menuInstanceId !== lastMenuInstanceId) {
        return;
    }

    browser.menus.update("separator", {
        visible: !!windows.length
    });
    browser.menus.update("separatorTitle", {
        visible: !!windows.length
    });

    for (const menuId of temporaryMenuIds) {
        if (!windows.find(win => getWindowMenuId(win.id) === menuId)) {
            browser.menus.remove(menuId);
            temporaryMenuIds.delete(menuId);
        }
    }

    for (const win of windows) {
        const winMenuId = getWindowMenuId(win.id);
        const newTitle = _("windowTitle", [
            win.title.length > 25
                ? `${win.title.slice(0, 35)}...`
                : win.title
          , win.tabs.length
        ])

        if (!temporaryMenuIds.has(winMenuId)) {
            browser.menus.create({
                id: winMenuId
              , contexts: [ "tab" ]
              , title: newTitle
            });

            temporaryMenuIds.add(winMenuId);
        } else {
            browser.menus.update(winMenuId, {
                title: newTitle
            });
        }
    }

    browser.menus.refresh();
});


browser.commands.onCommand.addListener(async name => {
    switch (name) {
        case "moveTabToNewWindow": {
            const [ currentTab ] = await browser.tabs.query({
                currentWindow: true
              , active: true
            });

            moveTabToNewWindow(currentTab.id);
        }
    }
});
