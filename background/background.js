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
import * as ContextMenu from './context-menu.js';

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
  ContextMenu.init();
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

    case Constants.COMMAND_GET_ALL_BOOKMARKS:
      return browser.bookmarks.getTree();
  }
}

async function onOneWayMessage(message) {
  switch (message.type) {
    case Constants.COMMAND_SET_CONFIGS: {
      for (const key of Object.keys(message.values)) {
        configs[key] = message.values[key];
      }
      return Promise.resolve(true);
    }

    case Constants.COMMAND_LOAD_BOOKMARK: {
      const window    = await browser.windows.getCurrent({ populate: true });
      const activeTab = window.tabs.find(tab => tab.active);
      browser.tabs.update(activeTab.id, {
        url: message.url
      });
    }; break;

    case Constants.COMMAND_OPEN_BOOKMARKS: {
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
    }; break;

    case Constants.COMMAND_CREATE_BOOKMARK: {
      const details = {
        title:    message.details.title,
        type:     message.details.type || 'bookmark',
        parentId: message.details.parentId
      };
      if (message.details.url)
        details.url = message.details.url;
      if (message.details.index >= 0)
        details.index = message.details.index;
      browser.bookmarks.create(details);
    }; break;

    case Constants.COMMAND_MOVE_BOOKMARK: {
      const destination = {
        parentId: message.destination.parentId
      };
      if (message.destination.index >= 0)
        destination.index = message.destination.index;
      browser.bookmarks.move(message.id, destination);
    }; break;

    case Constants.COMMAND_COPY_BOOKMARK: {
      const destination = {
        parentId: message.destination.parentId
      };
      if (message.destination.index >= 0)
        destination.index = message.destination.index;
      copyItem(message.id, destination);
    }; break;
  }
}

async function copyItem(original, destination) {
  if (typeof original == 'string') {
    original = await browser.bookmarks.get(original);
    if (Array.isArray(original))
      original = original[0];
    if (original.type == 'folder')
      original = await browser.bookmarks.getSubTree(original.id);
  }
  if (Array.isArray(original))
    original = original[0];
  const details = Object.assign({
    type: original.type
  }, destination)
  if (original.title)
    details.title = original.title;
  if (original.url)
    details.url = original.url;
  const created = await browser.bookmarks.create(details);
  if (original.children && original.children.length > 0) {
    for (const child of original.children) {
      copyItem(child, {
        parentId: created.id
      });
    }
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

browser.bookmarks.onCreated.addListener(async (id, bookmark) => {
  // notified bookmark has no children information!
  if (bookmark.type == 'folder') {
    bookmark = await browser.bookmarks.getSubTree(id);
    if (Array.isArray(bookmark))
      bookmark = bookmark[0];
  }
  broadcastMessage({
    type: Constants.NOTIFY_BOOKMARK_CREATED,
    id,
    bookmark
  });
});

browser.bookmarks.onRemoved.addListener((id, removeInfo) => {
  broadcastMessage({
    type: Constants.NOTIFY_BOOKMARK_REMOVED,
    id,
    removeInfo
  });
});

browser.bookmarks.onMoved.addListener((id, moveInfo) => {
  broadcastMessage({
    type: Constants.NOTIFY_BOOKMARK_MOVED,
    id,
    moveInfo
  });
});

browser.bookmarks.onChanged.addListener((id, changeInfo) => {
  broadcastMessage({
    type: Constants.NOTIFY_BOOKMARK_CHANGED,
    id,
    changeInfo
  });
});
