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


const mRoot = document.getElementById('root');

export function init() {
  mRoot.addEventListener('dragstart', onDragStart);
  mRoot.addEventListener('dragover', onDragOver);
  mRoot.addEventListener('dragleave', onDragLeave);
  mRoot.addEventListener('dragend', onDragEnd);
  mRoot.addEventListener('drop', onDrop);
}

const TYPE_BOOKMARK_ITEM = 'application/x-tst-bookmarks-subpanel-bookmark-item';
const TYPE_X_MOZ_URL     = 'text/x-moz-url';
const TYPE_URI_LIST      = 'text/uri-list';
const TYPE_TEXT_PLAIN    = 'text/plain';

function onDragStart(event) {
  const item = EventUtils.getItemFromEvent(event);
  if (!item ||
      Constants.ROOT_ITEMS.includes(item.raw.id))
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

  const position = getDropPosition(event);
  if (position == DROP_POSITION_NONE) {
    event.dataTransfer.effectAllowed = 'none';
    return;
  }

  const item = EventUtils.getItemFromEvent(event);
  if (item) {
    if (draggedId) {
      const dragged = Bookmarks.get(draggedId);
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

  let parentId;
  let index;
  if (item) {
    if (item.raw.type == 'folder') {
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
    else {
      parentId = item.raw.parentId;
      index = position == DROP_POSITION_BEFORE ? item.raw.index : item.raw.index + 1;
    }
  }

  const draggedId = event.dataTransfer.getData(TYPE_BOOKMARK_ITEM);
  if (draggedId) {
    event.preventDefault();
    const dragged = Bookmarks.get(draggedId);
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
