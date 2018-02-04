"use strict";

let should_revert = true;

browser.tabs.onDetached.addListener((tabId, details) => {
    if (should_revert) {
        should_revert = false;

        browser.tabs.move(tabId, {
            windowId: details.oldWindowId
          , index: details.oldPosition
        }).then(([ tab ]) => {
            return browser.tabs.update(tab.id, {
                active: true
            })
        }).then(() => {
            should_revert = true;
        });
    }
});
