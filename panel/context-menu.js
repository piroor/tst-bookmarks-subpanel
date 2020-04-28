/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

import MenuUI from '/extlib/MenuUI.js';

import * as EventUtils from './event-utils.js';
import * as Connection from './connection.js';
import * as Dialogs from './dialogs.js';
import * as Bookmarks from './bookmarks.js';

const mRoot = document.getElementById('context-menu');
let mUI;

const mItemsById = {};
let mContextItemId;

async function init() {
  const items = await browser.runtime.sendMessage({
    type: Constants.COMMAND_GET_MENU_ITEMS
  });

  for (const item of items) {
    const node = document.createElement('li');
    if (item.title)
      node.textContent = item.title;
    node.dataset.command = item.id;
    node.classList.add(item.type);
    mRoot.appendChild(node);
    item.node = node;
    mItemsById[item.id] = item;
  }

  mUI = new MenuUI({
    root: mRoot,
    onCommand,
    //onShown,
    //onHidden,
    appearance:        'menu',
    animationDuration: 150, // configs.collapseDuration,
    subMenuOpenDelay:  300, // configs.subMenuOpenDelay,
    subMenuCloseDelay: 300  // configs.subMenuCloseDelay
  });
}
init();

function getContextItems() {
  const contextItem = Bookmarks.get(mContextItemId);
  if (!contextItem || contextItem.classList.contains('highlighted'))
    return Bookmarks.getHighlighted();
  return contextItem ? [contextItem] : [];
}

function onCommand(target, _event) {
  const menuItemId = target && target.dataset.command;
  const contextItem = Bookmarks.get(mContextItemId);
  const contextItems = getContextItems();

  const destination = {};
  if (contextItems.length > 0) {
    destination.parentId = contextItem.raw.type == 'folder' ? contextItem.raw.id : contextItem.raw.parentId;
    if (contextItem.raw.type != 'folder')
      destination.index = contextItem.raw.index;
  }

  switch (menuItemId) {
    case 'openAllInTabs': {
      const urls = contextItem.raw.type == 'folder' ? contextItem.raw.children.map(raw => raw.url) : contextItems.map(item => item.raw.url);
      Dialogs.warnOnOpenTabs(urls.length).then(granted => {
        if (!granted)
          return;
        Connection.sendMessage({
          type: Constants.COMMAND_OPEN_BOOKMARKS,
          urls: urls.filter(url => url && Constants.LOADABLE_URL_MATCHER.test(url))
        });
      });
    }; break;

    case 'createBookmark':
      Dialogs.showBookmarkDialog({
        mode:  'add',
        type:  'bookmark',
        title: browser.i18n.getMessage('defaultBookmarkTitle'),
        url:   ''
      }).then(details => {
        if (!details)
          return;
        Connection.sendMessage({
          type:    Constants.COMMAND_CREATE_BOOKMARK,
          details: {
            type:  'bookmark',
            ...details,
            ...destination
          }
        });
      });
      break;

    case 'createFolder':
      Dialogs.showBookmarkDialog({
        mode:  'add',
        type:  'folder',
        title: browser.i18n.getMessage('defaultFolderTitle')
      }).then(details => {
        if (!details)
          return;
        Connection.sendMessage({
          type:    Constants.COMMAND_CREATE_BOOKMARK,
          details: {
            type:  'folder',
            ...details,
            ...destination
          }
        });
      });
      break;

    case 'properties':
      Dialogs.showBookmarkDialog({
        mode:  'save',
        type:  contextItem.raw.type,
        title: contextItem.raw.title,
        url:   contextItem.raw.url
      }).then(details => {
        if (!details)
          return;
        Connection.sendMessage({
          type:    Constants.COMMAND_UPDATE_BOOKMARK,
          id:      contextItem.raw.id,
          changes: details
        });
      });
      break;

    default:
      Connection.sendMessage({
        type: Constants.NOTIFY_MENU_CLICKED,
        menuItemId,
        bookmarkId: contextItem.raw.id,
        bookmark:   contextItem.raw,
        bookmarks:  contextItems.map(item => item.raw)
      });
      break;
  }
  close();
}

async function onShown() {
  const contextItem = Bookmarks.get(mContextItemId);
  const contextItems = getContextItems();
  return browser.runtime.sendMessage({
    type: Constants.NOTIFY_MENU_SHOWN,
    contextItem:  contextItem && contextItem.raw,
    contextItems: contextItems.map(item => item.raw)
  });
}

window.addEventListener('mousedown', event => {
  const target = EventUtils.getElementTarget(event);
  if (target && target.closest('input, textarea'))
    return;

  if (event.button != 2 ||
      (/mac/.test(navigator.platform) &&
       event.button == 0 &&
       event.ctrlKey))
    return;

  const item = EventUtils.getItemFromEvent(event);
  if (item)
    browser.runtime.sendMessage(Constants.TST_ID, {
      type:       'override-context',
      context:    'bookmark',
      bookmarkId: item.raw.id
    });
}, { useCapture: true });

/*
window.addEventListener('contextmenu', async event => {
  const target = EventUtils.getElementTarget(event);
  if (target && target.closest('input, textarea'))
    return;

  const item = EventUtils.getItemFromEvent(event);
  mContextItemId = item && item.raw.id;

  event.stopPropagation();
  event.preventDefault();
  const updatedItems = await onShown();
  for (const updatedItem of updatedItems) {
    const item = mItemsById[updatedItem.id];
    if ('visible' in updatedItem) {
      item.visible = updatedItem.visible;
      item.node.style.display = item.visible ? 'block' : 'none';
    }
    if ('enabled' in updatedItem) {
      item.enabled = updatedItem.enabled;
      if (item.node.classList.contains('disabled') == item.enabled)
        item.node.classList.toggle('disabled');
    }
  }
  await open({
    left: event.clientX,
    top:  event.clientY
  });
}, { useCapture: true });
*/

async function open(options = {}) {
  await close();
  await mUI.open(options);
}

async function close() {
  await mUI.close();
}
