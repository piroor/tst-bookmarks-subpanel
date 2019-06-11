/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

import * as Connection from './connection.js';
import * as Commands from './commands.js';

let mCopiedItem = null;

const mItemsById = {
  'open': {
    title: browser.i18n.getMessage('menu_open_label')
  },
  'openTab': {
    title: browser.i18n.getMessage('menu_openTab_label')
  },
  'openWindow': {
    title: browser.i18n.getMessage('menu_openWindow_label')
  },
  'openPrivateWindow': {
    title: browser.i18n.getMessage('menu_openPrivateWindow_label')
  },
  'openAllInTabs': {
    title: browser.i18n.getMessage('menu_openAllInTabs_label')
  },
  'separator:afterOpen': {
    type: 'separator'
  },
  'createBookmark': {
    title: browser.i18n.getMessage('menu_createBookmark_label')
  },
  'createFolder': {
    title: browser.i18n.getMessage('menu_createFolder_label')
  },
  'createSeparator': {
    title: browser.i18n.getMessage('menu_createSeparator_label')
  },
  'separator:afterCreate': {
    type: 'separator'
  },
  'cut': {
    title: browser.i18n.getMessage('menu_cut_label')
  },
  'copy': {
    title: browser.i18n.getMessage('menu_copy_label')
  },
  'paste': {
    title: browser.i18n.getMessage('menu_paste_label')
  },
  'separator:afterEdit': {
    type: 'separator'
  },
  'delete': {
    title: browser.i18n.getMessage('menu_delete_label')
  },
  'separator:afterDelete': {
    type: 'separator'
  },
  'sortByName': {
    title: browser.i18n.getMessage('menu_sortByName_label')
  },
  'separator:afterSort': {
    type: 'separator'
  },
  'properties': {
    title: browser.i18n.getMessage('menu_properties_label')
  }
};
const mItems = Array.from(Object.values(mItemsById));
const mSeparators = mItems.filter(item => item.type == 'separator');

const mMenuItemDefinitions = [];

//const SIDEBAR_URL_PATTERN = [`moz-extension://${location.host}/*`];

function getItemPlacementSignature(item) {
  if (item.placementSignature)
    return item.placementSignature;
  return item.placementSignature = JSON.stringify({
    parentId: item.parentId
  });
}
export async function init() {
  const itemIds = Object.keys(mItemsById);
  for (const id of itemIds) {
    const item = mItemsById[id];
    item.id          = id;
    item.lastVisible = true;
    item.lastEnabled = true;
    if (item.type == 'separator') {
      let beforeSeparator = true;
      item.precedingItems = [];
      item.followingItems = [];
      for (const id of itemIds) {
        const possibleSibling = mItemsById[id];
        if (getItemPlacementSignature(item) != getItemPlacementSignature(possibleSibling)) {
          if (beforeSeparator)
            continue;
          else
            break;
        }
        if (id == item.id) {
          beforeSeparator = false;
          continue;
        }
        if (beforeSeparator) {
          if (possibleSibling.type == 'separator') {
            item.previousSeparator = possibleSibling;
            item.precedingItems = [];
          }
          else {
            item.precedingItems.push(id);
          }
        }
        else {
          if (possibleSibling.type == 'separator')
            break;
          else
            item.followingItems.push(id);
        }
      }
    }
    const info = {
      id,
      title:    item.title,
      type:     item.type || 'normal',
      //contexts: ['bookmark'],
      //viewTypes: ['sidebar'],
      //visible:  false, // hide all by default
      //documentUrlPatterns: SIDEBAR_URL_PATTERN
    };
    if (item.parentId)
      info.parentId = item.parentId;
    //browser.menus.create(info);
    mMenuItemDefinitions.push(info);
  }
  //browser.menus.onShown.addListener(onShown);
  //browser.menus.onClicked.addListener(onClicked);
  browser.runtime.onMessage.addListener(onMessage);
  Connection.onMessage.addListener(onOneWayMessage);
}

function onMessage(message, _sender) {
  switch (message.type) {
    case Constants.COMMAND_GET_MENU_ITEMS:
      return Promise.resolve(mMenuItemDefinitions);

    case Constants.NOTIFY_MENU_SHOWN:
      return onShown(message.contextItem);
  }
}

function onOneWayMessage(message) {
  switch (message.type) {
    case Constants.NOTIFY_MENU_CLICKED:
      onClicked({
        bookmarkId: message.bookmarkId,
        menuItemId: message.menuItemId
      });
      break
  }
}

function updateVisible(id, visible) {
  const item = mItemsById[id];
  item.visible = item.lastVisible = visible;
}

function updateEnabled(id, enabled) {
  const item = mItemsById[id];
  item.enabled = item.lastEnabled = enabled;
}

function updateSeparator(id, options = {}) {
  const item = mItemsById[id];
  const visible = (
    (options.hasVisiblePreceding ||
     hasVisiblePrecedingItem(item)) &&
    (options.hasVisibleFollowing ||
     item.followingItems.some(id => mItemsById[id].type != 'separator' && mItemsById[id].lastVisible))
  );
  updateVisible(id, visible);
}
function hasVisiblePrecedingItem(separator) {
  return (
    separator.precedingItems.some(id => mItemsById[id].type != 'separator' && mItemsById[id].lastVisible) ||
    (separator.previousSeparator &&
     !separator.previousSeparator.lastVisible &&
     hasVisiblePrecedingItem(separator.previousSeparator))
  );
}

const UNDELETABLE_ITEMS = new Set([
  'root________',
  'menu________',
  'toolbar_____',
  'unfiled_____',
  'mobile______'
]);

async function onShown(contextItem) {
  const isFolder    = contextItem && contextItem.type == 'folder';
  const isBookmark  = contextItem && contextItem.type == 'bookmark';
  const isSeparator = contextItem && contextItem.type == 'separator';
  const deletable   = contextItem && !contextItem.unmodifiable && !UNDELETABLE_ITEMS.has(contextItem.id);

  updateVisible('open', isBookmark);
  updateVisible('openTab', isBookmark);
  updateVisible('openWindow', isBookmark);
  updateVisible('openPrivateWindow', isBookmark);
  updateVisible('openAllInTabs', isFolder);
  updateEnabled('openAllInTabs', isFolder && contextItem.children.length > 0);

  updateEnabled('cut', deletable);
  updateEnabled('paste', !!mCopiedItem);

  updateEnabled('delete', deletable);

  updateVisible('sortByName', isFolder);

  updateVisible('properties', isSeparator);

  for (const separator of mSeparators) {
    updateSeparator(separator.id);
  }

  return mItems;
}

async function onClicked(info) {
  let bookmark = info.bookmarkId && await browser.bookmarks.get(info.bookmarkId);
  if (Array.isArray(bookmark))
    bookmark = bookmark[0];
  if (bookmark && bookmark.type == 'folder') {
    bookmark = await browser.bookmarks.getSubTree(bookmark.id);
    if (Array.isArray(bookmark))
      bookmark = bookmark[0];
  }

  if (!bookmark)
    return;

  switch (info.menuItemId) {
    case 'copy':
      mCopiedItem = bookmark;
      break;

    case 'cut':
      mCopiedItem = bookmark;
    case 'delete':
      if (bookmark.type == 'folder')
        browser.bookmarks.removeTree(info.bookmarkId);
      else
        browser.bookmarks.remove(info.bookmarkId);
      break;

    case 'paste': {
      const destination = {
        parentId: bookmark.type == 'folder' ? bookmark.id : bookmark.parentId
      };
      if (bookmark.type != 'folder')
        destination.index = bookmark.index;
      Commands.copy(mCopiedItem, destination);
    }; break;
  }
}
