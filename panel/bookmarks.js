/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

import * as Connection from './connection.js';

const mItemsById = new Map();
const mRawItemsById = new Map();
let mOpenedFolders;

const mRoot = document.getElementById('root');

export function get(id) {
  return mItemsById.get(id);
}

function buildFolder(folder, options = {}) {
  const item = document.createElement('li');
  item.raw = folder;
  item.level = options.level || 0;
  const row = buildRow(item);
  row.setAttribute('title', folder.title);
  const twisty = row.appendChild(document.createElement('button'));
  twisty.classList.add('twisty');
  const label = row.appendChild(document.createElement('span'));
  label.classList.add('label');
  label.appendChild(document.createTextNode(folder.title || browser.i18n.getMessage('blankTitle')));
  item.classList.add('folder');

  if (folder.children.length == 0)
    item.classList.add('blank');

  if (mOpenedFolders.has(folder.id)) {
    buildChildren(item);
  }
  else {
    item.classList.add('collapsed');
    item.dirty = true;
  }

  mItemsById.set(folder.id, item);
  return item;
}

function buildRow(item) {
  const row = item.appendChild(document.createElement('a'));
  row.classList.add('row');
  row.style.paddingLeft = `calc(1em * ${item.level + 1})`;
  row.setAttribute('draggable', true);
  return row;
}

function buildChildren(folderItem, options = {}) {
  if (folderItem.classList.contains('collapsed'))
    return;
  if (folderItem.lastChild.localName == 'ul') {
    if (!folderItem.dirty && !options.force)
      return;
    folderItem.removeChild(folderItem.lastChild);
  }
  folderItem.appendChild(document.createElement('ul'));
  buildItems(folderItem.raw.children, folderItem.lastChild, { level: folderItem.level + 1 });
  folderItem.dirty = false;
}

function buildBookmark(bookmark, options = {}) {
  const item = document.createElement('li');
  item.raw = bookmark;
  item.level = options.level || 0;
  const row = buildRow(item);
  const label = row.appendChild(document.createElement('span'));
  label.classList.add('label');
  //const icon = label.appendChild(document.createElement('img'));
  //icon.src = bookmark.favIconUrl;
  label.appendChild(document.createTextNode(bookmark.title || browser.i18n.getMessage('blankTitle')));
  label.setAttribute('title', `${bookmark.title}\n${bookmark.url}`);
  item.classList.add('bookmark');

  if (!Constants.LOADABLE_URL_MATCHER.test(bookmark.url))
    item.classList.add('unavailable');

  mItemsById.set(bookmark.id, item);
  return item;
}

function buildSeparator(separator, options = {}) {
  const item = document.createElement('li');
  item.raw = separator;
  item.level = options.level || 0;
  buildRow(item);
  item.classList.add('separator');
  mItemsById.set(separator.id, item);
  return item;
}

function buildItems(items, container, options = {}) {
  const level = options.level || 0;
  for (const item of items) {
    switch (item.type) {
      case 'folder':
        container.appendChild(buildFolder(item, { level }));
        break;

      case 'bookmark':
        container.appendChild(buildBookmark(item, { level }));
        break;

      case 'separator':
        container.appendChild(buildSeparator(item, { level }));
        break;
    }
  }
}

export function updateOpenState(item) {
  if (item.classList.contains('collapsed'))
    mOpenedFolders.delete(item.raw.id);
  else
    mOpenedFolders.add(item.raw.id);
  Connection.sendMessage({
    type:   Constants.COMMAND_SET_CONFIGS,
    values: {
      openedFolders: Array.from(mOpenedFolders)
    }
  });
  if (!item.classList.contains('collapsed') &&
      item.lastChild.localName != 'ul') {
    buildChildren(item);
  }
}

function clearActive() {
  for (const node of document.querySelectorAll('.active')) {
    node.classList.remove('active');
  }
}

export function setActive(item) {
  clearActive();
  if (!item)
    return;
  item.classList.add('active');
  item.firstChild.focus();
}


/* initializing */

export async function init() {
  const [rootItems] = await Promise.all([
    browser.runtime.sendMessage({
      type: Constants.COMMAND_GET_ALL_BOOKMARKS
    }),
    (async () => {
      const configs = await browser.runtime.sendMessage({
        type: Constants.COMMAND_GET_CONFIGS,
        keys: [
          'openedFolders'
        ]
      });
      mOpenedFolders = new Set(configs.openedFolders);
    })()
  ]);

  storeRawItems(rootItems[0]);
  buildItems(rootItems[0].children, mRoot);
}

function storeRawItems(rawItem) {
  mRawItemsById.set(rawItem.id, rawItem);
  if (rawItem.children)
    for (const child of rawItem.children) {
      storeRawItems(child);
    }
}

// handling of messages sent from the background page
Connection.onMessage.addListener(async message => {
  switch (message.type) {
    case Constants.NOTIFY_BOOKMARK_CREATED: {
      mRawItemsById.set(message.id, message.bookmark);
      const parentRawItem = mRawItemsById.get(message.bookmark.parentId);
      if (parentRawItem)
        parentRawItem.children.splice(message.bookmark.index, 0, message.bookmark);
      const parentItem = mItemsById.get(message.bookmark.parentId);
      if (parentItem) {
        parentItem.dirty = true;
        parentItem.classList.remove('blank');
        buildChildren(parentItem);
      }
    }; break

    case Constants.NOTIFY_BOOKMARK_REMOVED: {
      const rawItem = mRawItemsById.get(message.id);
      if (!rawItem)
        return;

      const item = mItemsById.get(message.id);
      if (item) {
        const wasActive = item.classList.contains('active');
        const nextActive = item.nextSibling || item.previousSibling || item.closest('li');
        if (nextActive)
          setActive(nextActive);
      }

      const parentRawItem = mRawItemsById.get(message.removeInfo.parentId);
      if (parentRawItem)
        parentRawItem.children.splice(parentRawItem.children.findIndex(item => item.id == message.id), 1);

      deleteRawItem(rawItem);
    }; break

    case Constants.NOTIFY_BOOKMARK_MOVED: {
      const rawItem = mRawItemsById.get(message.id);
      if (!rawItem)
        return;

      const oldParentRawItem = mRawItemsById.get(message.moveInfo.oldParentId);
      if (oldParentRawItem)
        oldParentRawItem.children.splice(oldParentRawItem.children.findIndex(item => item.id == message.id), 1);
      const newParentRawItem = mRawItemsById.get(message.moveInfo.parentId);
      if (newParentRawItem)
        newParentRawItem.children.splice(message.moveInfo.index, 0, rawItem);

      rawItem.parentId = message.moveInfo.parentId;
      rawItem.index    = message.moveInfo.index;

      const item = mItemsById.get(message.id);
      if (!item)
        return;

      const wasActive = item.classList.contains('active');

      if (item.parentNode.childNodes.length == 1)
        mItemsById.get(message.removeInfo.oldParentId).classList.add('blank');
      item.parentNode.removeChild(item);
      const newParentItem = mItemsById.get(message.moveInfo.parentId);
      if (newParentItem) {
        newParentItem.dirty = true;
        buildChildren(newParentItem);
      }

      if (wasActive)
        setActive(mItemsById.get(message.id));
    }; break

    case Constants.NOTIFY_BOOKMARK_CHANGED: {
      const rawItem = mRawItemsById.get(message.id);
      if (!rawItem)
        return;

      for (const property of Object.keys(message.changeInfo)) {
        rawItem[property] = message.changeInfo[property];
      }

      const item = mItemsById.get(message.id);
      if (!item)
        return;
      const label = item.querySelector('.label');
      if (message.changeInfo.title)
        label.textContent = message.changeInfo.title;
    }; break
  }
});

function deleteRawItem(rawItem) {
  mRawItemsById.delete(rawItem.id);
  if (rawItem.children)
    for (const child of rawItem.children) {
      deleteRawItem(child);
    }

  const item = mItemsById.get(rawItem.id);
  if (!item)
    return;
  if (item.parentNode &&
      item.parentNode.childNodes.length == 1) {
    const parentItem = mItemsById.get(rawItem.parentId);
    if (parentItem)
      parentItem.classList.add('blank');
  }
  if (item.parentNode)
    item.parentNode.removeChild(item);
  mItemsById.delete(rawItem.id);
}