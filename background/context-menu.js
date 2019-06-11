/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

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
  //browser.menus.onClicked.addListener(onClick);
  browser.runtime.onMessage.addListener(onMessage);
}

function onMessage(message, _sender) {
  switch (message.type) {
    case Constants.COMMAND_GET_MENU_ITEMS:
      return Promise.resolve(mMenuItemDefinitions);

    case Constants.NOTIFY_MENU_SHOWN:
      return onShown(message.contextItem);
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

async function onShown(contextItem) {
  const isFolder    = contextItem && contextItem.type == 'folder';
  const isBookmark  = contextItem && contextItem.type == 'bookmark';
  const isSeparator = contextItem && contextItem.type == 'separator';

  updateVisible('open', isBookmark);
  updateVisible('openTab', isBookmark);
  updateVisible('openWindow', isBookmark);
  updateVisible('openPrivateWindow', isBookmark);
  updateVisible('openAllInTabs', isFolder);
  updateEnabled('openAllInTabs', isFolder && contextItem.children.length > 0);

  updateEnabled('delete', true);

  updateVisible('sortByName', isFolder);

  updateVisible('properties', isSeparator);

  for (const separator of mSeparators) {
    updateSeparator(separator.id);
  }

  return mItems;
}

/*
function onClick() {
}
*/
