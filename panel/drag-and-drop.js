/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

import * as EventUtils from './event-utils.js';
import * as Connection from './connection.js';
import * as Bookmarks from './bookmarks.js';

const configs = Connection.getConfigs([
  'autoExpandDelay'
]);

const mRowsContainer = document.getElementById('rows');

mRowsContainer.addEventListener('dragstart', onDragStart);
mRowsContainer.addEventListener('dragover', onDragOver);
mRowsContainer.addEventListener('dragenter', onDragEnter);
mRowsContainer.addEventListener('dragleave', onDragLeave);
mRowsContainer.addEventListener('dragend', onDragEnd);
mRowsContainer.addEventListener('drop', onDrop);


const TYPE_BOOKMARK_ITEMS = 'application/x-tst-bookmarks-subpanel-bookmark-items';
const TYPE_X_MOZ_URL      = 'text/x-moz-url';
const TYPE_URI_LIST       = 'text/uri-list';
const TYPE_TEXT_PLAIN     = 'text/plain';
const kTYPE_ADDON_DRAG_DATA = `application/x-treestyletab-drag-data;provider=${browser.runtime.id}&id=`;

let mDraggedFolderIdsForTreeOpen = [];
let mDroppedOnSelf = false;

function isRootItem(id) {
  return Constants.ROOT_ITEMS.includes(id);
}

function onDragStart(event) {
  const item = EventUtils.getItemFromEvent(event);
  if (!item)
    return;

  const items = [...new Set([Bookmarks.getActive(), ...Bookmarks.getMultiselected()])].filter(item => !!item);
  const hasFolder = items.some(item => item.type == 'folder');
  mDraggedFolderIdsForTreeOpen = hasFolder && items.every(item => item.type == 'folder') ?
    items.map(item => item.id) :
    [];
  mDroppedOnSelf = false;

  const dragDataForExternals = {};
  const dt = event.dataTransfer;
  dt.effectAllowed = items.some(item => isRootItem(item.id)) ? 'copy' : 'copyMove';
  dt.setData(TYPE_BOOKMARK_ITEMS, dragDataForExternals[TYPE_BOOKMARK_ITEMS] = items.map(item => item.id).join(','));

  if (!hasFolder) {
    const places = items.filter(item => item.type == 'bookmark' && Constants.LOADABLE_URL_MATCHER.test(item.url));
    if (places.length > 0) {
      dt.setData(TYPE_X_MOZ_URL, dragDataForExternals[TYPE_X_MOZ_URL] = places.map(item => `${item.url}\n${item.title}`).join('\n'));
      dt.setData(TYPE_URI_LIST, dragDataForExternals[TYPE_URI_LIST] = places.map(item => `#${item.title}\n${item.url}`).join('\n'));
      dt.setData(TYPE_TEXT_PLAIN, dragDataForExternals[TYPE_TEXT_PLAIN] = places.map(item => item.url).join('\n'));
    }
  }

  const dragDataForExternalsId = `${parseInt(Math.random() * 65000)}-${Date.now()}`;
  dt.setData(`${kTYPE_ADDON_DRAG_DATA}${dragDataForExternalsId}`, '');

  Connection.sendMessage({
    type: Constants.COMMAND_UPDATE_DRAG_DATA,
    id:   dragDataForExternalsId,
    data: dragDataForExternals
  });

  const focusable = Bookmarks.getFocusable(item);
  if (focusable) {
    const focusableRect = focusable.getBoundingClientRect();
    dt.setDragImage(focusable, event.clientX - focusableRect.left, event.clientY - focusableRect.top);
  }
}

const DROP_POSITION_NONE   = '';
const DROP_POSITION_SELF   = 'self';
const DROP_POSITION_BEFORE = 'before';
const DROP_POSITION_AFTER  = 'after';

function getDropPosition(event) {
  const item = EventUtils.getItemFromEvent(event);
  if (!item)
    return DROP_POSITION_NONE;
  const areaCount  = item.type == 'folder' ? 3 : 2;
  const focusable  = Bookmarks.getFocusable(item);
  const rect       = focusable.getBoundingClientRect();
  if (event.clientY <= (rect.y + (rect.height / areaCount)))
    return DROP_POSITION_BEFORE;
  if (event.clientY >= (rect.y + rect.height - (rect.height / areaCount)))
    return DROP_POSITION_AFTER;
  return DROP_POSITION_SELF;
}

function getDropDestination(event) {
  const item = EventUtils.getItemFromEvent(event);
  if (!item)
    return null;

  const position = getDropPosition(event);
  let parentId;
  let index;
  if (item.type != 'folder') {
    parentId = item.parentId;
    index = position == DROP_POSITION_BEFORE ? item.index : item.index + 1;
  }
  else {
    switch (position) {
      default:
      case DROP_POSITION_SELF:
        parentId = item.id;
        index = null;
        break;

      case DROP_POSITION_BEFORE:
        parentId = item.parentId;
        index = item.index;
        break;

      case DROP_POSITION_AFTER:
        if (Bookmarks.isFolderCollapsed(item)) {
          parentId = item.parentId;
          index = item.index + 1;
        }
        else {
          parentId = item.id;
          index = 0;
        }
        break;
    }
  }

  const draggedItems = getDraggedItems(event);
  if (draggedItems.length > 0 &&
      draggedItems.some(draggedItem => findAncestorById(item, draggedItem.id)))
    return null;

  if (parentId == Constants.ROOT_ID)
    return null;

  return { parentId, index };
}

function findAncestorById(item, id) {
  while (item) {
    if (item.id == id)
      return item;
    item = Bookmarks.getParent(item);
  }
  return null;
}

function getDraggedItems(event) {
  const draggedIds = event.dataTransfer.getData(TYPE_BOOKMARK_ITEMS);
  return draggedIds ? draggedIds.split(',').map(id => id && Bookmarks.getById(id)).filter(item => !!item) : [];
}

const ACCEPTABLE_DRAG_DATA_TYPES = [
  TYPE_URI_LIST,
  TYPE_X_MOZ_URL,
  TYPE_TEXT_PLAIN
];

function hasAcceptableDragData(event) {
  const dt = event.dataTransfer;
  return ACCEPTABLE_DRAG_DATA_TYPES.some(type => dt.types.includes(type) || dt.getData(type)) ||
    Array.from(dt.types).some(type => /^application\/x-treestyletab-drag-data;/.test(type));
}

function retrievePlacesFromDragEvent(event) {
  const dt   = event.dataTransfer;
  let places = [];
  for (const type of ACCEPTABLE_DRAG_DATA_TYPES) {
    const placeData = dt.getData(type);
    if (placeData)
      places = places.concat(retrievePlacesFromData(placeData, type));
    if (places.length > 0)
      break;
  }
  if (places.length > 0)
    return places;

  for (const type of dt.types) {
    if (!/^application\/x-treestyletab-drag-data;(.+)$/.test(type))
      continue;
    const params     = RegExp.$1;
    const providerId = /provider=([^;&]+)/.test(params) && RegExp.$1;
    const dataId     = /id=([^;&]+)/.test(params) && RegExp.$1;
    places.push(browser.runtime.sendMessage(providerId, {
      type: 'get-drag-data',
      id:   dataId
    }).then(dragData => {
      let places = [];
      if (!dragData || typeof dragData != 'object')
        return places;
      for (const type of ACCEPTABLE_DRAG_DATA_TYPES) {
        const placeData = dragData[type];
        if (placeData)
          places = places.concat(retrievePlacesFromData(placeData, type));
        if (places.length > 0)
          break;
      }
      return places;
    }).catch(_error => []));
  }
  return places.filter(place =>
    place &&
    typeof place == 'object' &&
    (typeof place.then == 'function' ||
     place.url));
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
        if (!line)
          continue;
        if (line.startsWith('#')) {
          lastComment = line.replace(/^#\s*/, '');
          continue;
        }
        const url = fixupURIFromText(line);
        if (Constants.LOADABLE_URL_MATCHER.test(url)) {
          places.push({
            title: lastComment || url,
            url
          });
        }
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
        if (Constants.LOADABLE_URL_MATCHER.test(url)) {
          places.push({
            title: lines[i + 1] || url,
            url
          });
        }
      }
      return places;
    }

    case TYPE_TEXT_PLAIN:
      return data
        .replace(/\r/g, '\n')
        .replace(/\n\n+/g, '\n')
        .trim()
        .split('\n')
        .filter(line => /^(ext\+)?\w+:.+/.test(line))
        .map(url => {
          url = fixupURIFromText(url);
          return {
            title: url,
            url
          };
        })
        .filter(place => Constants.LOADABLE_URL_MATCHER.test(place.url));
  }
  return [];
}

function fixupURIFromText(maybeURI) {
  if (/^(ext\+)?\w+:/.test(maybeURI))
    return maybeURI;

  if (/^([^\.\s]+\.)+[^\.\s]{2}/.test(maybeURI))
    return `http://${maybeURI}`;

  return maybeURI;
}

function onDragOver(event) {
  const draggedItems = getDraggedItems(event);
  if (draggedItems.length == 0 &&
      !hasAcceptableDragData(event)) {
    Bookmarks.clearDropPosition();
    event.dataTransfer.dropEffect = 'none';
    return;
  }

  const destination = getDropDestination(event);
  if (!destination) {
    Bookmarks.clearDropPosition();
    event.dataTransfer.dropEffect = 'none';
    return;
  }

  const item = EventUtils.getItemFromEvent(event);
  if (item) {
    if (draggedItems.some(draggedItem => findAncestorById(item, draggedItem.id))) {
      Bookmarks.clearDropPosition();
      event.dataTransfer.dropEffect = 'none';
      return;
    }
    Bookmarks.setDropPosition(item, getDropPosition(event));
    event.dataTransfer.dropEffect = event.ctrlKey || isRootItem(item.id) ? 'copy' : 'move';
    event.preventDefault();
  }
}

const mDelayedExpandTimer = new Map();

function onDragEnter(event) {
  const item = EventUtils.getItemFromEvent(event);
  if (!item ||
      item.type != 'folder' ||
      !Bookmarks.isFolderCollapsed(item) ||
      item == EventUtils.getRelatedItemFromEvent(event))
    return;

  const timer = mDelayedExpandTimer.get(item.fullId);
  if (timer)
    clearTimeout(timer);
  mDelayedExpandTimer.set(item.fullId, setTimeout(() => {
    mDelayedExpandTimer.delete(item.fullId);
    if (Bookmarks.isFolderCollapsed(item))
      Bookmarks.toggleOpenState(item);
  }, configs.autoExpandDelay));
}

function onDragLeave(event) {
  Bookmarks.clearDropPosition();
  const item = EventUtils.getItemFromEvent(event);
  const leftItem = EventUtils.getRelatedItemFromEvent(event);
  if (!item ||
      !leftItem ||
      item == leftItem)
    return;

  const timer = mDelayedExpandTimer.get(item.fullId);
  if (timer)
    clearTimeout(timer);
  mDelayedExpandTimer.delete(item.fullId);
}

function onDragEnd(event) {
  Bookmarks.clearDropPosition();
  if (!mDroppedOnSelf &&
      mDraggedFolderIdsForTreeOpen.length > 0 &&
      event.dataTransfer.dropEffect != 'none') {
    for (const id of mDraggedFolderIdsForTreeOpen) {
      Connection.sendMessage({
        type: Constants.COMMAND_OPEN_BOOKMARKS_AS_TREE,
        id
      });
    }
  }
  mDraggedFolderIdsForTreeOpen = [];
  mDroppedOnSelf = false;
  setTimeout(() => {
    Connection.sendMessage({
      type: Constants.COMMAND_UPDATE_DRAG_DATA,
      id:   null,
      data: null
    });
  }, 500);
}

async function onDrop(event) {
  Bookmarks.clearDropPosition();
  mDroppedOnSelf = true;

  const destination = getDropDestination(event);
  if (!destination) {
    event.preventDefault();
    return;
  }

  const draggedItems = getDraggedItems(event);
  if (draggedItems.length > 0) {
    event.preventDefault();
    const item = EventUtils.getItemFromEvent(event) || Bookmarks.getLast();
    const ids  = draggedItems.map(draggedItem => draggedItem.id);
    if (event.ctrlKey || isRootItem(item.id)) {
      Connection.sendMessage({
        type: Constants.COMMAND_COPY_BOOKMARK,
        ids,
        destination
      });
    }
    else {
      Connection.sendMessage({
        type: Constants.COMMAND_MOVE_BOOKMARK,
        ids,
        destination
      });
    }
    return;
  }

  const places = (await Promise.all(retrievePlacesFromDragEvent(event))).flat();
  if (places.length > 0) {
    event.preventDefault();
    const details = places.map((place, offset) => {
      const details = {
        type:     'bookmark',
        title:    place.title,
        url:      place.url,
        parentId: destination.parentId,
      };
      if (typeof destination.index == 'number')
        details.index = destination.index + offset;
      return details;
    });
    Connection.sendMessage({
      type: Constants.COMMAND_CREATE_BOOKMARK,
      details
    });
    return;
  }
}
