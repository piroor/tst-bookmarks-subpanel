/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

import * as Connection from './connection.js';
import * as EventUtils from './event-utils.js';
import * as ContextMenu from './context-menu.js';

const LOADABLE_URL_MATCHER = /^(https?|ftp|moz-extension):/;

let configs = {};

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

  if (!LOADABLE_URL_MATCHER.test(bookmark.url))
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

function updateFolderOpenState(item) {
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


/* initializing */

let mInitiaized = false;

async function init() {
  if (mInitiaized)
    return;
  try {
    const [rootItems] = await Promise.all([
      browser.runtime.sendMessage({
        type: Constants.COMMAND_GET_ALL_BOOKMARKS
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
    mRoot.addEventListener('dragleave', onDragLeave);
    mRoot.addEventListener('dragend', onDragEnd);
    mRoot.addEventListener('drop', onDrop);

    ContextMenu.init();

    mInitiaized = true;
  }
  catch(_error) {
  }
}

function storeRawItems(rawItem) {
  // I don't kwno why, but sometimes the first child of a folder can have invalid index.
  if (rawItem.index < 0)
    rawItem.index = 0;
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

let mLastMouseDownTarget = null;

window.addEventListener('mousedown', event => {
  const item = EventUtils.getItemFromEvent(event);
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
    // context menu
    return;
  }
}, { capture: true });

// We need to handle mouseup instead of click to bypass the "auto scroll"
// behavior of Firefox itself.
window.addEventListener('mouseup', event => {
  if (event.button == 2)
    return;

  const item = EventUtils.getItemFromEvent(event);
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
      Connection.sendMessage({
        type: Constants.COMMAND_OPEN_BOOKMARKS,
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
      Connection.sendMessage({
        type: Constants.COMMAND_LOAD_BOOKMARK,
        url:  item.raw.url
      });
    else
      Connection.sendMessage({
        type:       Constants.COMMAND_OPEN_BOOKMARKS,
        urls:       [item.raw.url],
        background: configs.openAsActiveTab ? event.shiftKey : !event.shiftKey
      });
    return;
  }
});

window.addEventListener('scroll', () => {
  Connection.sendMessage({
    type:   Constants.COMMAND_SET_CONFIGS,
    values: {
      scrollPosition: window.scrollY
    }
  });
});

// handling of messages sent from the background page
Connection.onMessage.addListener(async message => {
  switch (message.type) {
    case Constants.NOTIFY_READY:
      init();
      break

    case Constants.NOTIFY_UPDATED_CONFIGS:
      for (const key of Object.keys(message.values)) {
        configs[key] = message.values[key];
      }
      break;

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

      const parentRawItem = mRawItemsById.get(message.removeInfo.parentId);
      if (parentRawItem)
        parentRawItem.children.splice(message.removeInfo.index, 1);

      deleteRawItem(rawItem);
    }; break

    case Constants.NOTIFY_BOOKMARK_MOVED: {
      const rawItem = mRawItemsById.get(message.id);
      if (!rawItem)
        return;

      const oldParentRawItem = mRawItemsById.get(message.moveInfo.oldParentId);
      if (oldParentRawItem)
        oldParentRawItem.children.splice(message.moveInfo.oldIndex, 1);
      const newParentRawItem = mRawItemsById.get(message.moveInfo.parentId);
      if (newParentRawItem)
        newParentRawItem.children.splice(message.moveInfo.index, 0, rawItem);

      rawItem.parentId = message.moveInfo.parentId;
      rawItem.index    = message.moveInfo.index;

      const item = mItemsById.get(message.id);
      if (!item)
        return;
      if (item.parentNode.childNodes.length == 1)
        mItemsById.get(message.removeInfo.oldParentId).classList.add('blank');
      item.parentNode.removeChild(item);
      const newParentItem = mItemsById.get(message.moveInfo.parentId);
      if (newParentItem) {
        newParentItem.dirty = true;
        buildChildren(newParentItem);
      }
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


// drag and drop
const TYPE_BOOKMARK_ITEM = 'application/x-tst-bookmarks-subpanel-bookmark-item';
const TYPE_X_MOZ_URL     = 'text/x-moz-url';
const TYPE_URI_LIST      = 'text/uri-list';
const TYPE_TEXT_PLAIN    = 'text/plain';

function onDragStart(event) {
  const item = EventUtils.getItemFromEvent(event);
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

const DROP_POSITION_NONE   = '';
const DROP_POSITION_SELF   = 'self';
const DROP_POSITION_BEFORE = 'before';
const DROP_POSITION_AFTER  = 'after';

function getDropPosition(event) {
  const item = EventUtils.getItemFromEvent(event);
  if (!item)
    return DROP_POSITION_NONE;
  const areaCount = item.raw.type == 'folder' ? 3 : 2;
  const rect      = item.querySelector('.row').getBoundingClientRect();
  if (event.clientY <= (rect.y + (rect.height / areaCount)))
    return DROP_POSITION_BEFORE;
  if (event.clientY >= (rect.y + rect.height - (rect.height / areaCount)))
    return DROP_POSITION_AFTER;
  return DROP_POSITION_SELF;
}

function creatDropPositionMarker() {
  for (const node of document.querySelectorAll('[data-drop-position]')) {
    delete node.dataset.dropPosition;
  }
}

function retrievePlacesFromDragEvent(event) {
  const dt    = event.dataTransfer;
  const types = [
    TYPE_URI_LIST,
    TYPE_X_MOZ_URL,
    TYPE_TEXT_PLAIN
  ];
  let places = [];
  for (const type of types) {
    const placeData = dt.getData(type);
    if (placeData)
      places = places.concat(retrievePlacesFromData(placeData, type));
    if (places.length)
      break;
  }
  return places.filter(place => place && place.url);
}

function retrievePlacesFromData(data, type) {
  switch (type) {
    case TYPE_URI_LIST: {
      const lines = data
        .replace(/\r/g, '\n')
        .replace(/\n\n+/g, '\n')
        .split('\n');
      let lastComment = null;
      const places = [];
      for (const line of lines) {
        if (line.startsWith('#')) {
          lastComment = line;
          continue;
        }
        const url = fixupURIFromText(line);
        places.push({
          title: lastComment || url,
          url
        });
        lastComment = null;
      }
      return places;
    }

    case TYPE_X_MOZ_URL: {
      const lines = data
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n');
      const places = [];
      for (let i = 0, maxi = lines.length; i < maxi; i += 2) {
        const url = fixupURIFromText(lines[i]);
        places.push({
          title: lines[i + 1] || url,
          url
        });
      }
      return places;
    }

    case TYPE_TEXT_PLAIN:
      return data
        .replace(/\r/g, '\n')
        .replace(/\n\n+/g, '\n')
        .trim()
        .split('\n')
        .filter(line => /^\w+:.+/.test(line))
        .map(url => {
          url = fixupURIFromText(url);
          return {
            title: url,
            url
          };
        });
  }
  return [];
}

function fixupURIFromText(maybeURI) {
  if (/^\w+:/.test(maybeURI))
    return maybeURI;

  if (/^([^\.\s]+\.)+[^\.\s]{2}/.test(maybeURI))
    return `http://${maybeURI}`;

  return maybeURI;
}

function onDragOver(event) {
  creatDropPositionMarker();
  const draggedId = event.dataTransfer.getData(TYPE_BOOKMARK_ITEM);
  const places    = draggedId ? [] : retrievePlacesFromDragEvent(event);
  if (!draggedId &&
      places.length == 0) {
    event.dataTransfer.effectAllowed = 'none';
    return;
  }

  const item     = EventUtils.getItemFromEvent(event);
  const position = getDropPosition(event);
  if (item) {
    if (draggedId) {
      const dragged = mItemsById.get(draggedId);
      if (dragged && dragged.contains(item)) {
        event.dataTransfer.effectAllowed = 'none';
        return;
      }
    }
    item.dataset.dropPosition = position;
    event.dataTransfer.effectAllowed = event.ctrlKey ? 'copy' : 'move';
    event.preventDefault();
  }
}

function onDragLeave(_event) {
  creatDropPositionMarker();
}

function onDragEnd(_event) {
  creatDropPositionMarker();
}

function getLastVisibleItem(item) {
  if (item.lastChild.localName != 'ul' ||
      item.lastChild.classList.contains('collapsed'))
    return item;
  return getLastVisibleItem(item.lastChild.lastChild);
}

function onDrop(event) {
  creatDropPositionMarker();
  const item     = EventUtils.getItemFromEvent(event) || getLastVisibleItem(mRoot.lastChild);
  const position = item ? getDropPosition(event) : DROP_POSITION_AFTER;

  const parentId = position == DROP_POSITION_SELF ? item.raw.id : item.raw.parentId;
  const index    = position == DROP_POSITION_SELF ? -1 : position == DROP_POSITION_BEFORE ? item.raw.index : item.raw.index + 1;

  const draggedId = event.dataTransfer.getData(TYPE_BOOKMARK_ITEM);
  if (draggedId) {
    event.preventDefault();
    const dragged = mItemsById.get(draggedId);
    if (dragged && dragged.contains(item))
      return;

    if (event.ctrlKey) {
      Connection.sendMessage({
        type: Constants.COMMAND_COPY_BOOKMARK,
        id:   draggedId,
        destination: {
          parentId,
          index
        }
      });
    }
    else {
      Connection.sendMessage({
        type: Constants.COMMAND_MOVE_BOOKMARK,
        id:   draggedId,
        destination: {
          parentId,
          index
        }
      });
    }
    return;
  }

  const places = retrievePlacesFromDragEvent(event);
  if (places.length > 0) {
    event.preventDefault();
    Connection.sendMessage({
      type:    Constants.COMMAND_CREATE_BOOKMARK,
      details: {
        type:  'bookmark',
        title: places[0].title,
        url:   places[0].url,
        parentId,
        index
      }
    });
    return;
  }
}
