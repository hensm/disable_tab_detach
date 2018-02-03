"use strict";

browser.tabs.onDetached.addListener((tabId, details) => {
    browser.tabs.move(tabId, {
        windowId: details.oldWindowId
      , index: details.oldPosition
    }).then(([ tab ]) => {
        browser.tabs.update(tab.id, {
            active: true
        });
    });
});
