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
  'openedFolders',
  'openInTabAlways',
  'scrollPosition',
  'openAsActiveTab',
  'showScrollbarLeft'
]);

const mSearchBox = document.getElementById('searchbox');
const mContent = document.getElementById('content');
const mRoot = document.getElementById('root');
let mWindowId;

async function init() {
  if (mInitiaized)
    return;
  try {
    await Promise.all([
      Bookmarks.init(),
      configs.$loaded
    ]);

    mContent.scrollTop = configs.scrollPosition;

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

mContent.addEventListener('mousedown', event => {
  const rawItem = EventUtils.getItemFromEvent(event);
  if (!rawItem)
    return;

  mLastMouseDownTarget = rawItem.id;

  const target = EventUtils.getElementTarget(event);
  if (!target.classList.contains('twisty'))
    Bookmarks.setActive(rawItem, {
      multiselect: Bookmarks.isReallyMultiselected(rawItem),
    });

  if (event.button == 1) {
    // We need to cancel mousedown to block the "auto scroll" behavior
    // of Firefox itself.
    event.stopPropagation();
    event.preventDefault();
  }

  if (event.button == 2 ||
      (/^Mac/i.test(navigator.platform) &&
       event.button == 0 &&
       event.ctrlKey)) {
    // context menu
    if (target.closest('input, textarea'))
      return;
    if (rawItem)
      browser.runtime.sendMessage(Constants.TST_ID, {
        type:       'override-context',
        context:    'bookmark',
        bookmarkId: rawItem.id,
        windowId:   mWindowId
      });
    return;
  }
}, { capture: true });

// We need to handle mouseup instead of click to bypass the "auto scroll"
// behavior of Firefox itself.
mContent.addEventListener('mouseup', async event => {
  if (event.button == 2 ||
      (/^Mac/i.test(navigator.platform) &&
       event.button == 0 &&
       event.ctrlKey))
    return;

  const rawItem = EventUtils.getItemFromEvent(event);
  if (!rawItem)
    return;

  if (mLastMouseDownTarget != rawItem.id) {
    mLastMouseDownTarget = null;
    return;
  }

  mLastMouseDownTarget = null;

  const accel = event.ctrlKey || event.metaKey || event.button == 1;

  if (rawItem.type == 'folder') {
    if (accel || event.shiftKey) {
      const children = rawItem.children || await browser.runtime.sendMessage({
        type: Constants.COMMAND_GET_CHILDREN,
        id:   rawItem.id,
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
      Bookmarks.toggleOpenState(rawItem);
      if (!EventUtils.getElementTarget(event).classList.contains('twisty'))
        Bookmarks.setActive(rawItem);
    }
    return;
  }

  if (rawItem.type == 'bookmark' &&
      !Constants.LOADABLE_URL_MATCHER.test(rawItem.url)) {
    if (event.shiftKey)
      Connection.sendMessage({
        type:     Constants.COMMAND_OPEN_BOOKMARKS,
        urls:     [rawItem.url],
        inWindow: true
      });
    else if (configs.openInTabAlways || event.button == 1)
      Connection.sendMessage({
        type:       Constants.COMMAND_OPEN_BOOKMARKS,
        urls:       [rawItem.url],
        background: !configs.openAsActiveTab
      });
    else
      Connection.sendMessage({
        type: Constants.COMMAND_LOAD_BOOKMARK,
        url:  rawItem.url
      });
    return;
  }
});

mContent.addEventListener('scroll', () => {
  Connection.sendMessage({
    type:   Constants.COMMAND_SET_CONFIGS,
    values: {
      scrollPosition: mContent.scrollTop
    }
  });
});

window.addEventListener('focus', () => {
  setTimeout(() => {
    if (!mSearchBox.matches(':focus'))
      mRoot.classList.add('active');
  }, 0);
});

window.addEventListener('blur', () => {
  mRoot.classList.remove('active');
});
