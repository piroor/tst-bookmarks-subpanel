/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

const mDefinitions = {
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

export const items = [];
const itemsById = {};

//const SIDEBAR_URL_PATTERN = [`moz-extension://${location.host}/*`];

function getItemPlacementSignature(item) {
  if (item.placementSignature)
    return item.placementSignature;
  return item.placementSignature = JSON.stringify({
    parentId: item.parentId
  });
}
export async function init() {
  const itemIds = Object.keys(mDefinitions);
  for (const id of itemIds) {
    const item = mDefinitions[id];
    item.id          = id;
    item.lastVisible = false;
    item.lastEnabled = true;
    if (item.type == 'separator') {
      let beforeSeparator = true;
      item.precedingItems = [];
      item.followingItems = [];
      for (const id of itemIds) {
        const possibleSibling = mDefinitions[id];
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
    items.push(info);
    itemsById[info.id] = info;
  }
  //browser.menus.onShown.addListener(onShown);
  //browser.menus.onClicked.addListener(onClick);
  browser.runtime.onMessage.addListener(onMessage);
}

function onMessage(message, _sender) {
  switch (message.type) {
    case Constants.COMMAND_GET_MENU_ITEMS:
      return Promise.resolve(items);

    case Constants.NOTIFY_MENU_SHOWN:
      return onShown(message.contextItem);
  }
}

async function onShown(contextItem) {
  const isFolder    = contextItem && contextItem.type == 'folder';
  const isBookmark  = contextItem && contextItem.type == 'bookmark';
  const isSeparator = contextItem && contextItem.type == 'separator';

  itemsById.open.visible              = isBookmark;
  itemsById.openTab.visible           = isBookmark;
  itemsById.openWindow.visible        = isBookmark;
  itemsById.openPrivateWindow.visible = isBookmark;
  itemsById.openAllInTabs.visible     = isFolder;
  itemsById.openAllInTabs.enabled     = isFolder && contextItem.children.length > 0;

  itemsById.delete.enabled = true;

  itemsById.sortByName.visible = isFolder;

  itemsById.properties.visible = !isSeparator;

  return items;
}

/*
function onClick() {
}
*/
