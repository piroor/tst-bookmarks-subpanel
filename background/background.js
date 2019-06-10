/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  configs
} from '/common/common.js';

import * as Constants from '/common/constants.js';

async function registerToTST() {
  try {
    await browser.runtime.sendMessage(Constants.TST_ID, {
      type: 'register-self',
      name: browser.i18n.getMessage('extensionName'),
      icons: browser.runtime.getManifest().icons,
      subPanel: {
        title: 'Bookmarks',
        url:   `moz-extension://${location.host}/panel/panel.html`
      }
    });
  }
  catch(_error) {
    // TST is not available
  }
}

browser.runtime.onMessageExternal.addListener((message, sender) => {
  switch (sender.id) {
    case Constants.TST_ID:
      switch (message.type) {
        case 'ready':
          registerToTST();
          break;
      }
      break;
  }
});

registerToTST();

configs.$loaded.then(() => {
  browser.runtime.onMessage.addListener(onMessage);
  broadcastMessage({
    type: Constants.NOTIFY_READY
  });
});

configs.$addObserver(key => {
  const values = {};
  values[key] = configs[key];
  broadcastMessage({
    type: Constants.NOTIFY_UPDATED_CONFIGS,
    values
  });
});


function onMessage(message, _sender) {
  switch (message.type) {
    case Constants.COMMAND_GET_CONFIGS: {
      const values = {};
      for (const key of message.keys) {
        values[key] = configs[key];
      }
      return Promise.resolve(values);
    }

    case Constants.COMMAND_GET_ALL:
      return browser.bookmarks.getTree();
  }
}

function onOneWayMessage(message) {
  switch (message.type) {
    case Constants.COMMAND_SET_CONFIGS: {
      for (const key of Object.keys(message.values)) {
        configs[key] = message.values[key];
      }
      return Promise.resolve(true);
    }

    case Constants.COMMAND_LOAD:
      (async () => {
        const window    = await browser.windows.getCurrent({ populate: true });
        const activeTab = window.tabs.find(tab => tab.active);
        browser.tabs.update(activeTab.id, {
          url: message.url
        });
      })();
      break;

    case Constants.COMMAND_OPEN:
      (async () => {
        const window = await browser.windows.getCurrent({ populate: true });
        let index   = window.tabs.length;
        let isFirst = true;
        for (const url of message.urls) {
          browser.tabs.create({
            active: !message.background && isFirst,
            url,
            index
          });
          isFirst = false;
          index++;
        }
      })();
      break;
  }
}


// runtime.onMessage listeners registered at subpanels won't receive
// any message from this background page, so we need to use connections
// instead, to send messages from this background page to subpanel pages.

const mConnections = new Set();

browser.runtime.onConnect.addListener(port => {
  mConnections.add(port);
  port.onMessage.addListener(onOneWayMessage);
  port.onDisconnect.addListener(_message => {
    mConnections.delete(port);
    port.onMessage.removeListener(onOneWayMessage);
  });
});

function broadcastMessage(message) {
  for (const connection of mConnections) {
    connection.postMessage(message);
  }
}

browser.bookmarks.onCreated.addListener((id, bookmark) => {
  broadcastMessage({
    type: Constants.NOTIFY_CREATED,
    id,
    bookmark
  });
});

browser.bookmarks.onRemoved.addListener((id, removeInfo) => {
  broadcastMessage({
    type: Constants.NOTIFY_REMOVED,
    id,
    removeInfo
  });
});

browser.bookmarks.onMoved.addListener((id, moveInfo) => {
  broadcastMessage({
    type: Constants.NOTIFY_MOVED,
    id,
    moveInfo
  });
});

browser.bookmarks.onChanged.addListener((id, changeInfo) => {
  broadcastMessage({
    type: Constants.NOTIFY_CHANGED,
    id,
    changeInfo
  });
});

/* not implemented yet on Firefox
browser.bookmarks.onChildrenReordered.addListener((id, changeInfo) => {
  broadcastMessage({
    type: Constants.NOTIFY_CHILDREN_REORDERED,
    id,
    reorderInfo
  });
});
*/
