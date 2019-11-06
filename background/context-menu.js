/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

import * as Connection from './connection.js';
import * as Commands from './commands.js';

let mCopiedItems = [];

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
  },

  'separator:extra': {
    type: 'separator'
  },
  'openAllBookmarksWithStructure': {
    title: browser.i18n.getMessage('menu_openAllBookmarksWithStructure_label')
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
function init() {
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
}
init();

browser.runtime.onMessage.addListener((message, _sender) => {
  switch (message.type) {
    case Constants.COMMAND_GET_MENU_ITEMS:
      return Promise.resolve(mMenuItemDefinitions);

    case Constants.NOTIFY_MENU_SHOWN:
      return onShown(message.contextItem, message.contextItems);
  }
});

Connection.onMessage.addListener(message => {
  switch (message.type) {
    case Constants.NOTIFY_MENU_CLICKED:
      onClicked({
        bookmarkId: message.bookmarkId,
        bookmark:   message.bookmark,
        bookmarks:  message.bookmarks,
        menuItemId: message.menuItemId
      });
      break
  }
});

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

async function onShown(contextItem, contextItems) {
  const hasFolder    = contextItems.some(item => item.type == 'folder');
  const hasBookmark  = contextItems.some(item => item.type == 'bookmark');
  const hasSeparator = contextItems.some(item => item.type == 'separator');
  const allBookmarks = hasBookmark && !hasFolder && !hasSeparator;
  const modifiable   = contextItems.every(item => !item.unmodifiable && !Constants.UNMODIFIABLE_ITEMS.has(item.id));
  const multiselected = contextItems.length > 1;

  updateVisible('open', !multiselected && hasBookmark);
  updateVisible('openTab', !multiselected && hasBookmark);
  updateVisible('openWindow', !multiselected && hasBookmark);
  updateVisible('openPrivateWindow', !multiselected && hasBookmark);
  updateVisible('openAllInTabs', multiselected ? allBookmarks : hasFolder);
  updateEnabled('openAllInTabs', multiselected ? allBookmarks : (hasFolder && contextItem.children.length > 0));

  updateEnabled('cut', modifiable);
  updateEnabled('paste', !multiselected && mCopiedItems.length > 0);

  updateEnabled('delete', modifiable);

  updateVisible('sortByName', !multiselected && hasFolder);

  updateVisible('properties', !multiselected && !hasSeparator);
  updateEnabled('properties', modifiable);

  updateVisible('openAllBookmarksWithStructure', !multiselected && (hasBookmark || hasFolder));
  updateEnabled('openAllBookmarksWithStructure', !multiselected && (hasBookmark || hasFolder));

  for (const separator of mSeparators) {
    updateSeparator(separator.id);
  }

  return mItems;
}

async function onClicked(info) {
  /*
  let bookmark = info.bookmarkId && await browser.bookmarks.get(info.bookmarkId);
  if (Array.isArray(bookmark))
    bookmark = bookmark[0];
  if (bookmark && bookmark.type == 'folder') {
    bookmark = await browser.bookmarks.getSubTree(bookmark.id);
    if (Array.isArray(bookmark))
      bookmark = bookmark[0];
  }
  */
  const bookmark  = info.bookmark;
  const bookmarks = info.bookmarks;

  if (!bookmark)
    return;

  const destination = {
    parentId: bookmark.type == 'folder' ? bookmark.id : bookmark.parentId
  };
  if (bookmark.type != 'folder')
    destination.index = bookmark.index;

  switch (info.menuItemId) {
    case 'open':
      Commands.load(bookmark.url);
      break;

    case 'openTab':
      Commands.openInTabs([bookmark.url]);
      break;

    case 'openWindow':
      Commands.openInWindow(bookmark.url);
      break;

    case 'openPrivateWindow':
      Commands.openInWindow(bookmark.url, { incognito: true });
      break;

      /*
    case 'openAllInTabs':
      Commands.openInTabs(bookmark.children.map(item => item.url).filter(url => url && Constants.LOADABLE_URL_MATCHER.test(url)));
      break;
      */


      /*
    case 'createBookmark':
      Commands.create(Object.assign({
        type:  'bookmark',
        title: browser.i18n.getMessage('defaultBookmarkTitle'),
        url:   ''
      }, destination));
      break;

    case 'createFolder':
      Commands.create(Object.assign({
        type:  'folder',
        title: browser.i18n.getMessage('defaultFolderTitle')
      }, destination));
      break;
      */

    case 'createSeparator':
      Commands.create(Object.assign({
        type: 'separator'
      }, destination));
      break;


    case 'copy':
      mCopiedItems = bookmarks;
      break;

    case 'cut':
      mCopiedItems = bookmarks;
    case 'delete':
      for (const bookmark of bookmarks) {
        if (bookmark.type == 'folder')
          browser.bookmarks.removeTree(bookmark.id);
        else
          browser.bookmarks.remove(bookmark.id);
      }
      break;

    case 'paste':
      Commands.copy(mCopiedItems, destination);
      break;


    case 'sortByName':
      bookmark.children.sort((a, b) => a.title > b.title);
      for (let i = 0, maxi = bookmark.children.length; i < maxi; i++) {
        const child = bookmark.children[i];
        await browser.bookmarks.move(child.id, { index: i });
      }
      break;

      /*
    case 'properties':
      break;
      */

    case 'openAllBookmarksWithStructure':
      browser.runtime.sendMessage(Constants.TST_ID, {
        type: 'open-all-bookmarks-with-structure',
        id:   bookmark.id
      });
      break;
  }
}
