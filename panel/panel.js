/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

import * as Connection from './connection.js';
import * as EventUtils from './event-utils.js';
import * as Bookmarks from './bookmarks.js';
import * as ContextMenu from './context-menu.js';
import * as DragAndDrop from './drag-and-drop.js';
import * as Dialogs from './dialogs.js';
import './searchbar.js';

let configs = {};
let mInitiaized = false;

const mRoot = document.getElementById('root');

async function init() {
  if (mInitiaized)
    return;
  try {
    await Promise.all([
      Bookmarks.init(),
      (async () => {
        configs = await browser.runtime.sendMessage({
          type: Constants.COMMAND_GET_CONFIGS,
          keys: [
            'openedFolders',
            'openInTabDefault',
            'openInTabAlways',
            'scrollPosition',
            'openAsActiveTab'
          ]
        });
      })()
    ]);

    mRoot.scrollTop = configs.scrollPosition;

    DragAndDrop.init();
    ContextMenu.init();

    mInitiaized = true;
  }
  catch(_error) {
  }
}

init();

Connection.onMessage.addListener(async message => {
  switch (message.type) {
    case Constants.NOTIFY_UPDATED_CONFIGS:
      for (const key of Object.keys(message.values)) {
        if (key in configs)
          configs[key] = message.values[key];
      }
      break;
  }
});


let mLastMouseDownTarget = null;

mRoot.addEventListener('mousedown', event => {
  const item = EventUtils.getItemFromEvent(event);
  if (!item)
    return;

  mLastMouseDownTarget = item.raw.id;

  Bookmarks.setActive(item);

  if (event.button == 1) {
    // We need to cancel mousedown to block the "auto scroll" behavior
    // of Firefox itself.
    event.stopPropagation();
    event.preventDefault();
  }

  if (event.button == 2 ||
      (event.button == 0 &&
       event.ctrlKey)) {
    // context menu
    return;
  }
}, { capture: true });

// We need to handle mouseup instead of click to bypass the "auto scroll"
// behavior of Firefox itself.
mRoot.addEventListener('mouseup', event => {
  if (event.button == 2)
    return;

  const item = EventUtils.getItemFromEvent(event);
  if (!item)
    return;

  if (mLastMouseDownTarget != item.raw.id) {
    mLastMouseDownTarget = null;
    return;
  }

  mLastMouseDownTarget = null;

  const accel = event.ctrlKey || event.metaKey || event.button == 1;

  if (item.classList.contains('folder')) {
    if (accel) {
      const urls = item.raw.children.map(item => item.url).filter(url => url && Constants.LOADABLE_URL_MATCHER.test(url));
      Dialogs.warnOnOpenTabs(urls.length).then(granted => {
        if (!granted)
          return;
        Connection.sendMessage({
          type: Constants.COMMAND_OPEN_BOOKMARKS,
          urls
        });
      });
    }
    else {
      item.classList.toggle('collapsed');
      Bookmarks.updateOpenState(item);
    }
    return;
  }

  if (item.classList.contains('bookmark') &&
      !item.classList.contains('unavailable')) {
    if (!configs.openInTabAlways &&
        configs.openInTabDefault == accel)
      Connection.sendMessage({
        type: Constants.COMMAND_LOAD_BOOKMARK,
        url:  item.raw.url
      });
    else
      Connection.sendMessage({
        type:       Constants.COMMAND_OPEN_BOOKMARKS,
        urls:       [item.raw.url],
        background: configs.openAsActiveTab ? event.shiftKey : !event.shiftKey
      });
    return;
  }
});

mRoot.addEventListener('scroll', () => {
  Connection.sendMessage({
    type:   Constants.COMMAND_SET_CONFIGS,
    values: {
      scrollPosition: mRoot.scrollTop
    }
  });
});
