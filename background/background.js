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

import * as Connection from './connection.js';
import * as ContextMenu from './context-menu.js';
import * as Commands from './commands.js';

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
  Connection.broadcastMessage({
    type: Constants.NOTIFY_READY
  });
  ContextMenu.init();
});

configs.$addObserver(key => {
  const values = {};
  values[key] = configs[key];
  Connection.broadcastMessage({
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

Connection.onMessage.addListener(async message => {
  switch (message.type) {
    case Constants.COMMAND_SET_CONFIGS: {
      for (const key of Object.keys(message.values)) {
        configs[key] = message.values[key];
      }
      return Promise.resolve(true);
    }

    case Constants.COMMAND_LOAD_BOOKMARK:
      Commands.load(message.url);
      break;

    case Constants.COMMAND_OPEN_BOOKMARKS:
      Commands.openInTabs(message.urls, message);
      break;

    case Constants.COMMAND_CREATE_BOOKMARK:
      Commands.create(message.details);
      break;

    case Constants.COMMAND_UPDATE_BOOKMARK:
      Commands.update(message.id, message.changes);
      break;

    case Constants.COMMAND_MOVE_BOOKMARK: {
      const destination = {
        parentId: message.destination.parentId
      };
      if (typeof message.destination.index == 'number')
        destination.index = message.destination.index;
      browser.bookmarks.move(message.id, destination);
    }; break;

    case Constants.COMMAND_COPY_BOOKMARK: {
      const destination = {
        parentId: message.destination.parentId
      };
      if (typeof message.destination.index == 'number')
        destination.index = message.destination.index;
      Commands.copy(message.id, destination);
    }; break;
  }
});

browser.bookmarks.onCreated.addListener(async (id, bookmark) => {
  // notified bookmark has no children information!
  if (bookmark.type == 'folder') {
    bookmark = await browser.bookmarks.getSubTree(id);
    if (Array.isArray(bookmark))
      bookmark = bookmark[0];
  }
  Connection.broadcastMessage({
    type: Constants.NOTIFY_BOOKMARK_CREATED,
    id,
    bookmark
  });
});

browser.bookmarks.onRemoved.addListener((id, removeInfo) => {
  Connection.broadcastMessage({
    type: Constants.NOTIFY_BOOKMARK_REMOVED,
    id,
    removeInfo
  });
});

browser.bookmarks.onMoved.addListener((id, moveInfo) => {
  Connection.broadcastMessage({
    type: Constants.NOTIFY_BOOKMARK_MOVED,
    id,
    moveInfo
  });
});

browser.bookmarks.onChanged.addListener((id, changeInfo) => {
  Connection.broadcastMessage({
    type: Constants.NOTIFY_BOOKMARK_CHANGED,
    id,
    changeInfo
  });
});
