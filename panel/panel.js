/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

const LOADABLE_URL_MATCHER = /^(https?|ftp|moz-extension):/;

let configs = {};
let mConnection = null;

const mRoot = document.getElementById('root');


/* buiding bookmarks tree UI */

let mOpenedFolders = new Set();
const mItemsById = new Map();
const mRawItemsById = new Map();

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
  label.appendChild(document.createTextNode(folder.title));
  item.classList.add('folder');

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
  label.appendChild(document.createTextNode(bookmark.title));
  label.setAttribute('title', `${bookmark.title}\n${bookmark.url}`);
  item.classList.add('bookmark');

  if (!LOADABLE_URL_MATCHER.test(bookmark.url))
    item.classList.add('unavailable');

  mItemsById.set(bookmark.id, item);
  return item;
}

function buildSeparator(separator, options = {}) {
  const item = document.createElement('li');
  item.raw = separator;
  item.level = options.level || 0;
  const row = buildRow(item);
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

function updateFolderOpenState(item) {
  if (item.classList.contains('collapsed'))
    mOpenedFolders.delete(item.raw.id);
  else
    mOpenedFolders.add(item.raw.id);
  mConnection.postMessage({
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


/* initializing */

let mInitiaized = false;

async function init() {
  if (mInitiaized)
    return;
  try {
    // runtime.onMessage listener registerad at a restricted page (like this
    // subpanel page) won't receive messages from the background page, so
    // we need to use connection instead.
    mConnection = browser.runtime.connect({
      name: `panel:${Date.now()}`
    });
    mConnection.onMessage.addListener(onOneWayMessage);
    const [rootItems] = await Promise.all([
      browser.runtime.sendMessage({
        type: Constants.COMMAND_GET_ALL
      }),
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

    mOpenedFolders = new Set(configs.openedFolders);
    storeRawItems(rootItems[0]);
    buildItems(rootItems[0].children, mRoot);

    window.scrollTo(0, configs.scrollPosition);

    mRoot.addEventListener('dragstart', onDragStart);
    mRoot.addEventListener('dragover', onDragOver);
    mRoot.addEventListener('dragenter', onDragEnter);
    mRoot.addEventListener('dragleave', onDragLeave);
    mRoot.addEventListener('dragend', onDragEnd);
    mRoot.addEventListener('drop', onDrop);

    mInitiaized = true;
  }
  catch(_error) {
  }
}

function storeRawItems(rawItem) {
  mRawItemsById.set(rawItem.id, rawItem);
  if (rawItem.children)
    for (const child of rawItem.children) {
      storeRawItems(child);
    }
}

init();


/* event handling */

function clearActive() {
  for (const node of document.querySelectorAll('.active')) {
    node.classList.remove('active');
  }
}

function getItemFromEvent(event) {
  let target = event.target;
  if (target.nodeType != Node.ELEMENT_NODE)
    target = target.parentNode;
  const row = target && target.closest('.row');
  return row && row.parentNode;
}

let mLastMouseDownTarget = null;

window.addEventListener('mousedown', event => {
  const item = getItemFromEvent(event);
  if (!item)
    return;

  mLastMouseDownTarget = item.raw.id;

  clearActive();
  item.firstChild.classList.add('active');
  item.firstChild.focus();

  if (event.button == 1) {
    // We need to cancel mousedown to block the "auto scroll" behavior
    // of Firefox itself.
    event.stopPropagation();
    event.preventDefault();
  }

  if (event.button == 2 ||
      (event.button == 0 &&
       event.ctrlKey)) {
    browser.runtime.sendMessage(Constants.TST_ID, {
      type:       'set-override-context',
      context:    'bookmark',
      bookmarkId: item.raw.id
    });
    return;
  }
}, { capture: true });

// We need to handle mouseup instead of click to bypass the "auto scroll"
// behavior of Firefox itself.
window.addEventListener('mouseup', event => {
  const item = getItemFromEvent(event);
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
      const urls = item.raw.children.map(item => item.url).filter(url => url && LOADABLE_URL_MATCHER.test(url));
      mConnection.postMessage({
        type: Constants.COMMAND_OPEN,
        urls
      });
    }
    else {
      item.classList.toggle('collapsed');
      updateFolderOpenState(item);
    }
    return;
  }

  if (item.classList.contains('bookmark') &&
      !item.classList.contains('unavailable')) {
    if (!configs.openInTabAlways &&
        configs.openInTabDefault == accel)
      mConnection.postMessage({
        type: Constants.COMMAND_LOAD,
        url:  item.raw.url
      });
    else
      mConnection.postMessage({
        type:       Constants.COMMAND_OPEN,
        urls:       [item.raw.url],
        background: configs.openAsActiveTab ? event.shiftKey : !event.shiftKey
      });
    return;
  }
});

window.addEventListener('scroll', () => {
  mConnection.postMessage({
    type:   Constants.COMMAND_SET_CONFIGS,
    values: {
      scrollPosition: window.scrollY
    }
  });
});

// handling of messages sent from the background page
function onOneWayMessage(message) {
  switch (message.type) {
    case Constants.NOTIFY_READY:
      init();
      break

    case Constants.NOTIFY_UPDATED_CONFIGS:
      for (const key of Object.keys(message.values)) {
        configs[key] = message.values[key];
      }
      break;

    case Constants.NOTIFY_CREATED: {
      mRawItemsById.set(message.id, message.bookmark);
      const parentRawItem = mRawItemsById.get(message.bookmark.parentId);
      if (parentRawItem)
        parentRawItem.children.splice(message.bookmark.index, 0, message.bookmark);
      const parentItem = mItemsById.get(message.bookmark.parentId);
      if (parentItem) {
        parentItem.dirty = true;
        buildChildren(parentItem);
      }
    }; break

    case Constants.NOTIFY_REMOVED: {
      const rawItem = mRawItemsById.get(message.id);
      if (!rawItem)
        return;

      const parentRawItem = mRawItemsById.get(message.removeInfo.parentId);
      if (parentRawItem)
        parentRawItem.children.splice(message.removeInfo.index, 1);

      mRawItemsById.delete(message.id);

      const item = mItemsById.get(message.id);
      if (!item)
        return;
      item.parentNode.removeChild(item);
      mItemsById.delete(message.id);
    }; break

    case Constants.NOTIFY_MOVED: {
      const rawItem = mRawItemsById.get(message.id);
      if (!rawItem)
        return;

      const oldParentRawItem = mRawItemsById.get(message.moveInfo.oldParentId);
      if (oldParentRawItem)
        oldParentRawItem.children.splice(message.moveInfo.oldIndex, 1);
      const newParentRawItem = mRawItemsById.get(message.moveInfo.parentId);
      if (newParentRawItem)
        newParentRawItem.children.splice(message.moveInfo.index, 0, rawItem);

      const item = mItemsById.get(message.id);
      if (!item)
        return;
      item.parentNode.removeChild(item);
      const newParentItem = mItemsById.get(message.moveInfo.parentId);
      if (newParentItem) {
        newParentItem.dirty = true;
        buildChildren(newParentItem);
      }
    }; break

    case Constants.NOTIFY_CHANGED: {
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
}

// drag and drop
const TYPE_BOOKMARK_ITEM = 'application/x-tst-bookmarks-subpanel-bookmark-item';
const TYPE_X_MOZ_URL     = 'text/x-moz-url';
const TYPE_URI_LIST      = 'text/uri-list';
const TYPE_TEXT_PLAIN    = 'text/plain';

function onDragStart(event) {
  const item = getItemFromEvent(event);
  if (!item)
    return;

  const dt = event.dataTransfer;
  dt.effectAllowed = 'copyMove';
  dt.setData(TYPE_BOOKMARK_ITEM, item.raw.id);
  dt.setData(TYPE_X_MOZ_URL, `${item.raw.url}\n${item.raw.title}`);
  dt.setData(TYPE_URI_LIST, `#${item.raw.title}\n${item.raw.url}`);
  dt.setData(TYPE_TEXT_PLAIN, item.raw.url);

  const itemRect = item.getBoundingClientRect();
  dt.setDragImage(item, event.clientX - itemRect.left, event.clientY - itemRect.top);
}

function onDragOver(event) {
}

function onDragEnter(event) {
}

function onDragLeave(event) {
}

function onDragEnd(event) {
}

function onDrop(event) {
}
