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
import * as Commands from './commands.js';
import * as Dialogs from './dialogs.js';
import './context-menu.js';

async function registerToTST() {
  try {
    await browser.runtime.sendMessage(Constants.TST_ID, {
      type: 'register-self',
      name: browser.i18n.getMessage('extensionName'),
      icons: browser.runtime.getManifest().icons,
      listeningTypes: [
        'wait-for-shutdown',
        'contextMenu-shown',
        'contextMenu-click'
      ],
      subPanel: {
        title: browser.i18n.getMessage('subpanelName'),
        url:   `moz-extension://${location.host}/panel/panel.html`
      }
    });
    // This is required to override the context menu on macOS and Linux.
    browser.browserSettings.contextMenuShowEvent.set({
      value: 'mouseup'
    });
  }
  catch(_error) {
    // TST is not available
  }
}

const promisedUnloaded = new Promise((resolve, _reject) => {
  // If this promise doesn't do anything then there seems to be a timeout
  // so it only works if the tracked extension (this extension) is disabled
  // within about 10 seconds after this promise is used as a response to a
  // message. After that it will not throw an error for the waiting extension.
  // See also: https://github.com/piroor/treestyletab/issues/2313

  // If we use the following then the returned promise will be rejected when
  // the extension is disabled even for longer times:
  window.addEventListener('beforeunload', () => resolve(true));
});

let mCurrentDragDataForExternalsId = null;
let mCurrentDragDataForExternals = null;

browser.runtime.onMessageExternal.addListener((message, sender) => {
  switch (sender.id) {
    case Constants.TST_ID:
      switch (message.type) {
        case 'ready':
          registerToTST();
          break;

        case 'wait-for-shutdown':
          return promisedUnloaded;
      }
      break;
  }

  switch (message && typeof message == 'object' && message.type) {
    case 'get-drag-data':
      if (message.id == mCurrentDragDataForExternalsId &&
          mCurrentDragDataForExternals)
        return Promise.resolve(mCurrentDragDataForExternals);
      break;
  }
});

registerToTST();


let mOpenedFolders = new Set();

configs.$loaded.then(() => {
  mOpenedFolders = new Set(configs.openedFolders);
});

configs.$addObserver(key => {
  const values = {};
  values[key] = configs[key];
  Connection.broadcastMessage({
    type: Constants.NOTIFY_UPDATED_CONFIGS,
    values
  });
});

browser.runtime.onMessage.addListener((message, _sender) => {
  switch (message.type) {
    case Constants.COMMAND_GET_CONFIGS:
      return configs.$loaded.then(() => {
        const values = {};
        for (const key of message.keys) {
          values[key] = configs[key];
        }
        return values;
      });

    case Constants.COMMAND_GET_CURRENT_WINDOW_ID:
      return browser.windows.getCurrent({}).then(window => window.id);

    case Constants.COMMAND_GET_ALL_BOOKMARKS:
      return browser.bookmarks.getTree();

    case Constants.COMMAND_GET_ROOT:
      return (async () => {
        const [items, children] = await Promise.all([
          browser.bookmarks.get(Constants.ROOT_ID),
          browser.bookmarks.getChildren(Constants.ROOT_ID)
        ]);
        const root = items[0];
        root.children = children;
        return root;
      })();

    case Constants.COMMAND_GET_CHILDREN:
      return (async () => {
        const children = await browser.bookmarks.getChildren(message.id);
        const promises = [];
        for (const item of children) {
          if (item.type == 'bookmark' &&
              /^place:parent=([^&]+)$/.test(item.url)) { // alias for special folders
            promises.push(
              browser.bookmarks.get(RegExp.$1).then(realItems => {
                item.id    = realItems[0].id;
                item.type  = realItems[0].type;
                item.title = realItems[0].title;
              })
            );
          }
        }
        await Promise.all(promises);
        return children;
      })();

    case Constants.COMMAND_SEARCH_BOOKMARKS:
      return browser.bookmarks.search(message.query);

    case Constants.COMMAND_GET_BROWSER_NAME:
      return browser.runtime.getBrowserInfo().then(info => info.name);

    case Constants.COMMAND_CONFIRM_TO_OPEN_TABS:
      return Dialogs.warnOnOpenTabs(message.count);
  }
});

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
      if (message.inWindow)
        Commands.openInWindow(message.urls, message);
      else
        Commands.openInTabs(message.urls, message);
      break;

    case Constants.COMMAND_CREATE_BOOKMARK:
      Commands.create(message.details);
      break;

    case Constants.COMMAND_MOVE_BOOKMARK: {
      const destination = {
        parentId: message.destination.parentId
      };
      if (typeof message.destination.index == 'number')
        destination.index = message.destination.index;
      const ids = message.ids || [message.id];
      for (const id of ids) {
        browser.bookmarks.move(id, destination);
        if (typeof destination.index == 'number')
          destination.index++;
      }
    }; break;

    case Constants.COMMAND_COPY_BOOKMARK: {
      const destination = {
        parentId: message.destination.parentId
      };
      if (typeof message.destination.index == 'number')
        destination.index = message.destination.index;
      Commands.copy(message.ids || [message.id], destination);
    }; break;

    case Constants.COMMAND_UPDATE_DRAG_DATA:
      mCurrentDragDataForExternalsId = message.id || null;
      mCurrentDragDataForExternals = message.data || null;
      break;
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

  if (mOpenedFolders.has(id)) {
    mOpenedFolders.delete(id);
    configs.openedFolders = Array.from(mOpenedFolders);
  }
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
