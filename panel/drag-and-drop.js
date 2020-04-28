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

const mRoot = document.getElementById('root');

mRoot.addEventListener('dragstart', onDragStart);
mRoot.addEventListener('dragover', onDragOver);
mRoot.addEventListener('dragenter', onDragEnter);
mRoot.addEventListener('dragleave', onDragLeave);
mRoot.addEventListener('dragend', onDragEnd);
mRoot.addEventListener('drop', onDrop);


const TYPE_BOOKMARK_ITEMS = 'application/x-tst-bookmarks-subpanel-bookmark-items';
const TYPE_X_MOZ_URL      = 'text/x-moz-url';
const TYPE_URI_LIST       = 'text/uri-list';
const TYPE_TEXT_PLAIN     = 'text/plain';
const kTYPE_ADDON_DRAG_DATA = `application/x-moz-addon-drag-data;provider=${browser.runtime.id}&id=`;

function isRootItem(id) {
  return Constants.ROOT_ITEMS.includes(id);
}

function onDragStart(event) {
  const item = EventUtils.getItemFromEvent(event);
  if (!item)
    return;

  const items = Array.from(mRoot.querySelectorAll('li.highlighted, li.active'));

  const dragDataForExternals = {};
  const dt = event.dataTransfer;
  dt.effectAllowed = items.some(item => isRootItem(item.raw.id)) ? 'copy' : 'copyMove';
  dt.setData(TYPE_BOOKMARK_ITEMS, dragDataForExternals[TYPE_BOOKMARK_ITEMS] = items.map(item => item.raw.id).join(','));
  dt.setData(TYPE_X_MOZ_URL, dragDataForExternals[TYPE_X_MOZ_URL] = items.map(item => `${item.raw.url}\n${item.raw.title}`).join('\n'));
  dt.setData(TYPE_URI_LIST, dragDataForExternals[TYPE_URI_LIST] = items.map(item => `#${item.raw.title}\n${item.raw.url}`).join('\n'));
  dt.setData(TYPE_TEXT_PLAIN, dragDataForExternals[TYPE_TEXT_PLAIN] = items.map(item => item.raw.url).join('\n'));

  const dragDataForExternalsId = `${parseInt(Math.random() * 65000)}-${Date.now()}`;
  dt.setData(`${kTYPE_ADDON_DRAG_DATA}${dragDataForExternalsId}`, JSON.stringify(dragDataForExternals));

  Connection.sendMessage({
    type: Constants.COMMAND_UPDATE_DRAG_DATA,
    id:   dragDataForExternalsId,
    data: dragDataForExternals
  });

  const itemRect = item.firstChild.getBoundingClientRect();
  dt.setDragImage(item.firstChild, event.clientX - itemRect.left, event.clientY - itemRect.top);
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

function getDropDestination(event) {
  const item = EventUtils.getItemFromEvent(event);
  if (!item)
    return null;

  const position = getDropPosition(event);
  let parentId;
  let index;
  if (item.raw.type != 'folder') {
    parentId = item.raw.parentId;
    index = position == DROP_POSITION_BEFORE ? item.raw.index : item.raw.index + 1;
  }
  else {
    switch (position) {
      default:
      case DROP_POSITION_SELF:
        parentId = item.raw.id;
        index = null;
        break;

      case DROP_POSITION_BEFORE:
        parentId = item.raw.parentId;
        index = item.raw.index;
        break;

      case DROP_POSITION_AFTER:
        if (item.classList.contains('collapsed')) {
          parentId = item.raw.parentId;
          index = item.raw.index + 1;
        }
        else {
          parentId = item.raw.id;
          index = 0;
        }
        break;
    }
  }

  const draggedItems = getDraggedItems(event);
  if (draggedItems.length > 0) {
    if (draggedItems.some(draggedItem => draggedItem.contains(item)))
      return null;

    for (const draggedItem of draggedItems) {
      if (parentId == draggedItem.parentId &&
          index > draggedItem.index)
        index--;
    }
  }

  if (parentId == Constants.ROOT_ID)
    return null;

  return { parentId, index };
}

function creatDropPositionMarker() {
  for (const node of document.querySelectorAll('[data-drop-position]')) {
    delete node.dataset.dropPosition;
  }
}

function getDraggedItems(event) {
  const draggedIds = event.dataTransfer.getData(TYPE_BOOKMARK_ITEMS);
  return draggedIds ? draggedIds.split(',').map(id => id && Bookmarks.get(id)).filter(item => !!item) : [];
}

const ACCEPTABLE_DRAG_DATA_TYPES = [
  TYPE_URI_LIST,
  TYPE_X_MOZ_URL,
  TYPE_TEXT_PLAIN
];

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
  for (const type of dt.types) {
    if (!/^application\/x-moz-addon-drag-data;(.+)$/.test(type))
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
        if (line.startsWith('#')) {
          lastComment = line.replace(/^#\s*/, '');
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
  const draggedItems = getDraggedItems(event);
  const places       = draggedItems.length > 0 ? [] : retrievePlacesFromDragEvent(event);
  if (draggedItems.length == 0 &&
      places.length == 0) {
    event.dataTransfer.effectAllowed = 'none';
    return;
  }

  const destination = getDropDestination(event);
  if (!destination) {
    event.dataTransfer.effectAllowed = 'none';
    return;
  }

  const item = EventUtils.getItemFromEvent(event);
  if (item) {
    if (draggedItems.some(draggedItem => draggedItem.contains(item))) {
      event.dataTransfer.effectAllowed = 'none';
      return;
    }
    item.dataset.dropPosition = getDropPosition(event);
    event.dataTransfer.effectAllowed = event.ctrlKey || isRootItem(item.raw.id) ? 'copy' : 'move';
    event.preventDefault();
  }
}

function onDragEnter(event) {
  const item = EventUtils.getItemFromEvent(event);
  if (!item ||
      !item.classList.contains('folder') ||
      !item.classList.contains('collapsed') ||
      item == EventUtils.getRelatedItemFromEvent(event))
    return;

  if (item.delayedExpandTimer)
    clearTimeout(item.delayedExpandTimer);
  item.delayedExpandTimer = setTimeout(() => {
    item.delayedExpandTimer = null;
    if (item.classList.contains('collapsed'))
      Bookmarks.toggleOpenState(item);
  }, configs.autoExpandDelay);
}

function onDragLeave(event) {
  creatDropPositionMarker();
  const item = EventUtils.getItemFromEvent(event);
  const leftItem = EventUtils.getRelatedItemFromEvent(event);
  if (!item ||
      !leftItem ||
      item == leftItem)
    return;

  clearTimeout(item.delayedExpandTimer);
  item.delayedExpandTimer = null;
}

function onDragEnd(_event) {
  creatDropPositionMarker();
  setTimeout(() => {
    Connection.sendMessage({
      type: Constants.COMMAND_UPDATE_DRAG_DATA,
      id:   null,
      data: null
    });
  }, 500);
}

function getLastVisibleItem(item) {
  if (item.lastChild.localName != 'ul' ||
      item.lastChild.classList.contains('collapsed'))
    return item;
  return getLastVisibleItem(item.lastChild.lastChild);
}

async function onDrop(event) {
  creatDropPositionMarker();

  const destination = getDropDestination(event);
  if (!destination) {
    event.preventDefault();
    return;
  }

  const draggedItems = getDraggedItems(event);
  if (draggedItems.length > 0) {
    event.preventDefault();
    const item = EventUtils.getItemFromEvent(event) || getLastVisibleItem(mRoot.lastChild);
    const ids  = draggedItems.map(draggedItem => draggedItem.raw.id);
    if (event.ctrlKey || isRootItem(item.raw.id)) {
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
    Connection.sendMessage({
      type:    Constants.COMMAND_CREATE_BOOKMARK,
      details: {
        type:  'bookmark',
        title: places[0].title,
        url:   places[0].url,
        parentId: destination.parentId,
        index:    destination.index
      }
    });
    return;
  }
}
