/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

import * as Commands from './commands.js';
import * as Dialogs from './dialogs.js';

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
  }
};
const mItems = Array.from(Object.values(mItemsById));
const mSeparators = mItems.filter(item => item.type == 'separator');

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
  }
  //browser.menus.onShown.addListener(onShown);
  //browser.menus.onClicked.addListener(onClicked);
  createItems();
}
init();

function createItems() {
  const itemIds = Object.keys(mItemsById);
  for (const id of itemIds) {
    const item = mItemsById[id];
    const info = {
      id,
      title: item.title,
      type:  item.type || 'normal',
    };
    if (item.parentId)
      info.parentId = item.parentId;
    const createInfo = {
      ...info,
      contexts: ['bookmark'],
      viewTypes: ['sidebar'],
      //documentUrlPatterns: SIDEBAR_URL_PATTERN
    };
    browser.runtime.sendMessage(Constants.TST_ID, {
      type:   'contextMenu-create',
      params: createInfo
    });
    //browser.menus.create(createInfo);
  }
}

function updateVisible(id, visible) {
  const item = mItemsById[id];
  item.visible = item.lastVisible = visible;
  browser.runtime.sendMessage(Constants.TST_ID, {
    type:   'contextMenu-update',
    params: [id, { visible }]
  });
  //browser.menus.update(id, { visible });
}

function updateEnabled(id, enabled) {
  const item = mItemsById[id];
  item.enabled = item.lastEnabled = enabled;
  browser.runtime.sendMessage(Constants.TST_ID, {
    type:   'contextMenu-update',
    params: [id, { enabled }]
  });
  //browser.menus.update(id, { enabled });
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

async function onShown(info) {
  const contextItems = await browser.bookmarks.get(info.bookmarkId);
  for (const item of contextItems) {
    if (item.type == 'bookmark' &&
        /^place:parent=([^&]+)$/.test(item.url)) { // alias for special folders
      const [realItem,] = await browser.bookmarks.get(RegExp.$1);
      item.id    = realItem.id;
      item.type  = realItem.type;
      item.title = realItem.title;
    }
  }

  const contextItem  = contextItems[0];
  const hasFolder    = contextItems.some(item => item.type == 'folder');
  const hasBookmark  = contextItems.some(item => item.type == 'bookmark');
  const hasSeparator = contextItems.some(item => item.type == 'separator');
  const allBookmarks = hasBookmark && !hasFolder && !hasSeparator;
  const modifiable   = contextItems.every(item => !item.unmodifiable && !Constants.UNMODIFIABLE_ITEMS.has(item.id));
  const multiselected = contextItems.length > 1;

  if (contextItem.type == 'folder' &&
      !contextItem.children)
    contextItem.children = await browser.bookmarks.getChildren(contextItem.id);

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

  for (const separator of mSeparators) {
    updateSeparator(separator.id);
  }

  return mItems;
}

async function onClicked(info) {
  let [bookmark,] = info.bookmarkId && await browser.bookmarks.get(info.bookmarkId);
  if (bookmark.type == 'bookmark' &&
      /^place:parent=([^&]+)$/.test(bookmark.url)) { // alias for special folders
    const [realItem,] = await browser.bookmarks.get(RegExp.$1);
    bookmark.id    = realItem.id;
    bookmark.type  = realItem.type;
    bookmark.title = realItem.title;
  }
  if (bookmark && bookmark.type == 'folder') {
    bookmark = await browser.bookmarks.getSubTree(bookmark.id);
    if (Array.isArray(bookmark))
      bookmark = bookmark[0];
  }

  if (!bookmark)
    return;

  const bookmarks = [bookmark];

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

    case 'openAllInTabs': {
      const urls = (
        bookmark.type == 'folder' ?
          bookmark.children.map(item => item.url) :
          bookmarks.map(item => item.url)
      ).filter(url => url && Constants.LOADABLE_URL_MATCHER.test(url));
      Dialogs.warnOnOpenTabs(urls.length).then(granted => {
        if (!granted)
          return;
        Commands.openInTabs(urls);
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
        Commands.create({
          type:  'bookmark',
          ...details,
          ...destination
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
        Commands.create({
          type:  'folder',
          ...details,
          ...destination
        });
      });
      break;

    case 'createSeparator':
      Commands.create({
        type: 'separator',
        ...destination
      });
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

    case 'properties':
      Dialogs.showBookmarkDialog({
        mode:  'save',
        type:  bookmark.type,
        title: bookmark.title,
        url:   bookmark.url
      }).then(details => {
        if (!details)
          return;
        Commands.update(bookmark.id, details);
      });
      break;
  }
}


browser.runtime.onMessageExternal.addListener((message, sender) => {
  switch (sender.id) {
    case Constants.TST_ID:
      switch (message.type) {
        case 'ready':
          createItems();
          break;

        case 'contextMenu-shown':
          if (message.info.bookmarkId)
            onShown(message.info);
          break;

        case 'contextMenu-click':
          if (message.info.bookmarkId)
            onClicked(message.info);
          break;
      }
      break;
  }
});
