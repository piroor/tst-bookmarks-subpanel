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
import './drag-and-drop.js';
import './keyboard-navigation.js';
import './searchbar.js';
import '/extlib/l10n.js';

let mInitiaized = false;

const configs = Connection.getConfigs([
  'openInTabAlways',
  'openAsActiveTab',
  'showScrollbarLeft'
]);

const mSearchBox = document.getElementById('searchbox');
const mContent = document.getElementById('content');
const mRowsContainer = document.getElementById('rows');
let mWindowId;

async function init() {
  if (mInitiaized)
    return;
  try {
    await Promise.all([
      Bookmarks.init(),
      configs.$loaded
    ]);

    configs.$addObserver(onConfigChange);
    onConfigChange('showScrollbarLeft');

    mWindowId = await browser.runtime.sendMessage({
      type: Constants.COMMAND_GET_CURRENT_WINDOW_ID
    });

    mInitiaized = true;
  }
  catch(_error) {
  }
}

init();

function onConfigChange(key) {
  switch (key) {
    case 'showScrollbarLeft':
      if (configs.showScrollbarLeft)
        document.documentElement.classList.add('left-scrollbar');
      else
        document.documentElement.classList.remove('left-scrollbar');
      break;
  }
}


let mLastMouseDownTarget = null;

function isContextMenuTriggerEvent(event) {
  return (
    event.button == 2 ||
    (/^Mac/i.test(navigator.platform) &&
     event.button == 0 &&
     event.ctrlKey)
  );
}

mContent.addEventListener('mousedown', event => {
  const item = EventUtils.getItemFromEvent(event);
  if (!item)
    return;

  mLastMouseDownTarget = item.id;

  const target = EventUtils.getElementTarget(event);
  if (!isContextMenuTriggerEvent(event) &&
      !target.classList.contains('twisty'))
    Bookmarks.setActive(item, {
      multiselect: Bookmarks.isReallyMultiselected(item),
    });

  if (event.button == 1) {
    // We need to cancel mousedown to block the "auto scroll" behavior
    // of Firefox itself.
    event.stopPropagation();
    event.preventDefault();
  }

  if (isContextMenuTriggerEvent(event)) {
    // context menu
    if (target.closest('input, textarea'))
      return;
    if (item)
      browser.runtime.sendMessage(Constants.TST_ID, {
        type:       'override-context',
        context:    'bookmark',
        bookmarkId: item.id,
        windowId:   mWindowId
      });
    return;
  }
}, { capture: true });

// We need to handle mouseup instead of click to bypass the "auto scroll"
// behavior of Firefox itself.
mContent.addEventListener('mouseup', async event => {
  if (isContextMenuTriggerEvent(event))
    return;

  const item = EventUtils.getItemFromEvent(event);
  if (!item)
    return;

  if (mLastMouseDownTarget != item.id) {
    mLastMouseDownTarget = null;
    return;
  }

  mLastMouseDownTarget = null;

  const accel = event.ctrlKey || event.metaKey || event.button == 1;

  if (item.type == 'folder') {
    if (accel || event.shiftKey) {
      const children = item.children || await browser.runtime.sendMessage({
        type: Constants.COMMAND_GET_CHILDREN,
        id:   item.id,
      });
      const urls = children.map(item => item.url).filter(url => url && Constants.LOADABLE_URL_MATCHER.test(url));
      browser.runtime.sendMessage({
        type:  Constants.COMMAND_CONFIRM_TO_OPEN_TABS,
        count: urls.length
      }).then(granted => {
        if (!granted)
          return;
        Connection.sendMessage({
          type: Constants.COMMAND_OPEN_BOOKMARKS,
          urls,
          inWindow: event.shiftKey
        });
      });
    }
    else {
      Bookmarks.toggleOpenState(item);
      if (!EventUtils.getElementTarget(event).classList.contains('twisty'))
        Bookmarks.setActive(item);
    }
    return;
  }

  if (item.type == 'bookmark' &&
      Constants.LOADABLE_URL_MATCHER.test(item.url)) {
    if (event.shiftKey)
      Connection.sendMessage({
        type:     Constants.COMMAND_OPEN_BOOKMARKS,
        urls:     [item.url],
        inWindow: true
      });
    else if (configs.openInTabAlways || event.button == 1)
      Connection.sendMessage({
        type:       Constants.COMMAND_OPEN_BOOKMARKS,
        urls:       [item.url],
        background: !configs.openAsActiveTab
      });
    else
      Connection.sendMessage({
        type: Constants.COMMAND_LOAD_BOOKMARK,
        url:  item.url
      });
    return;
  }
});

window.addEventListener('focus', () => {
  setTimeout(() => {
    if (!mSearchBox.matches(':focus'))
      mRowsContainer.classList.add('active');
  }, 0);
});

window.addEventListener('blur', () => {
  mRowsContainer.classList.remove('active');
});
