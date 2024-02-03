/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

import * as Connection from './connection.js';

const mRawItemsById = new Map();
let mOpenedFolderIds;

const mRoot = document.getElementById('root');
let mRawItems = [];
let mActiveRawItemId;
const mHighlightedRawItemIds = new Set();
const mDirtyRawItemIds = new Set();

const mOnRenderdCallbacks = new Set();

export async function init() {
  listAll();
}


// Listing raw bookmark items

async function listAll() {
  const [rawRoot] = await Promise.all([
    browser.runtime.sendMessage({
      type: Constants.COMMAND_GET_ROOT
    }),
    (async () => {
      const configs = await browser.runtime.sendMessage({
        type: Constants.COMMAND_GET_CONFIGS,
        keys: [
          'openedFolders'
        ]
      });
      mOpenedFolderIds = new Set(configs.openedFolders);
    })(),
  ]);

  mRawItemsById.clear();
  mRawItems = [];
  await Promise.all(rawRoot.children.map(trackRawItem));
  renderRows();
}

async function trackRawItem(rawItem) {
  const parentRawItem = getParent(rawItem);
  rawItem.level = (parentRawItem && parentRawItem.level + 1) || 0;
  mRawItemsById.set(rawItem.id, rawItem);

  if (rawItem.parentId == 'root________') {
    mRawItems.push(rawItem);
  }
  else {
    const prevItemIndex = mRawItems.findLastIndex(item => item.id == rawItem.parentId || item.parentId == rawItem.parentId);
    mRawItems.splice(prevItemIndex + 1, 0, rawItem);
  }

  if (!isFolderOpen(rawItem))
    return;

  return trackRawItemChildren(rawItem);
}

async function trackRawItemChildren(rawItem) {
  if (!isFolderOpen(rawItem)) {
    const untrackedCount = untrackRawItemDescendants(rawItem);
    mRawItems.splice(mRawItems.indexOf(rawItem) + 1, untrackedCount);
    return;
  }

  rawItem.children = rawItem.children || await browser.runtime.sendMessage({
    type: Constants.COMMAND_GET_CHILDREN,
    id:   rawItem.id
  }) || null;
  if (!rawItem.children)
    return;
  for (const child of rawItem.children) {
    trackRawItem(child);
  }
  renderRows();
}

function untrackRawItem(rawItem) {
  untrackRawItemDescendants(rawItem);

  const parentRawItem = getParent(rawItem);
  if (parentRawItem) {
    parentRawItem.children.splice(parentRawItem.children.findIndex(item => item.id == rawItem.id), 1);
    mDirtyRawItemIds.add(parentRawItem.id);
  }

  mRawItems.splice(mRawItems.indexOf(rawItem), 1);
  mRawItemsById.delete(rawItem.id);
}

function untrackRawItemDescendants(rawItem) {
  if (!rawItem.children)
    return 0;

  let untrackedCount = rawItem.children.length;
  for (const child of rawItem.children) {
    untrackedCount += untrackRawItemDescendants(child);
    mRawItemsById.delete(child.id);
  }
  rawItem.children = null;
  return untrackedCount;
}


export async function search(query) {
  if (!query)
    return listAll();

  mRawItemsById.clear();

  mRawItems = (await browser.runtime.sendMessage({
    type: Constants.COMMAND_SEARCH_BOOKMARKS,
    query,
  })).filter(rawItem => rawItem.type == 'bookmark');
  renderRows();
}


// Utilities to operate bookmark items

export function getById(id) {
  return mRawItemsById.get(id);
}

export function indexOf(rawItem) {
  return mRawItems.indexOf(rawItem);
}

export function getRowById(id) {
  const rawItem = getById(id);
  return rawItem && document.getElementById(getRowId(rawItem)) || null;
}

export function getParent(rawItem) {
  return rawItem && getById(rawItem.parentId);
}

export function getPrevious(rawItem) {
  if (!rawItem)
    return null;
  const index = mRawItems.indexOf(rawItem);
  if (index <= 0)
    return null;
  return mRawItems[index - 1];
}

export function getNext(rawItem) {
  if (!rawItem)
    return null;
  const index = mRawItems.indexOf(rawItem);
  if (index < 0 ||
      index > mRawItems.length - 1)
    return null;
  return mRawItems[index + 1];
}

export function getFirst() {
  return mRawItems.length == 0 ? null : mRawItems[0];
}

export function getLast() {
  return mRawItems.length == 0 ? null : mRawItems[mRawItems.length - 1];
}

function clearActive() {
  mActiveRawItemId = null;
  mHighlightedRawItemIds.clear();
  reserveToRenderRows();
}

export function setActive(rawItem) {
  if (!rawItem)
    return;

  clearActive();

  mActiveRawItemId = rawItem.id;
  mHighlightedRawItemIds.add(rawItem.id);

  reserveToRenderRows();

  mOnRenderdCallbacks.add(() => {
    const rowElement = getRowById(mActiveRawItemId);
    if (rowElement)
      rowElement.firstChild.focus();
  });
  mRoot.classList.add('active');
}

export function getActive() {
  return getById(mActiveRawItemId);
}

export function clearMultiselected() {
  mHighlightedRawItemIds.clear();
  if (mActiveRawItemId)
    mHighlightedRawItemIds.add(mActiveRawItemId);
  reserveToRenderRows();
}

export function getMultiselected() {
  return Array.from(mHighlightedRawItemIds, getById);
}

export function isMultiselected(rawItem) {
  return rawItem && mHighlightedRawItemIds.has(rawItem.id);
}

export function addMultiselected(...rawItems) {
  for (const rawItem of rawItems) {
    mHighlightedRawItemIds.add(rawItem.id);
  }
  reserveToRenderRows();
}

export function removeMultiselected(...rawItems) {
  for (const rawItem of rawItems) {
    mHighlightedRawItemIds.delete(rawItem.id);
  }
  reserveToRenderRows();
}

export function isFolderOpen(rawItem) {
  return rawItem.type == 'folder' && mOpenedFolderIds.has(rawItem.id);
}

export function isFolderCollapsed(rawItem) {
  return rawItem.type == 'folder' && !mOpenedFolderIds.has(rawItem.id);
}

export async function toggleOpenState(rawItem) {
  if (isFolderOpen(rawItem))
    mOpenedFolderIds.delete(rawItem.id);
  else
    mOpenedFolderIds.add(rawItem.id);
  Connection.sendMessage({
    type:   Constants.COMMAND_SET_CONFIGS,
    values: {
      openedFolders: Array.from(mOpenedFolderIds)
    }
  });
  await trackRawItemChildren(rawItem);
  renderRows();
}


/* rendering */

export function reserveToRenderRows() {
  const startAt = `${Date.now()}-${parseInt(Math.random() * 65000)}`;
  renderRows.lastStartedAt = startAt;
  window.requestAnimationFrame(() => {
    if (renderRows.lastStartedAt != startAt)
      return;
    renderRows();
  });
}

async function renderRows() {
  renderRows.lastStartedAt = null;

  const range = document.createRange();
  range.selectNodeContents(mRoot);
  range.deleteContents();
  range.detach();

  for (const item of mRawItems) {
    if (!item)
      continue;
    switch (item.type) {
      case 'folder':
        mRoot.appendChild(renderFolderRow(item));
        break;

      case 'bookmark':
        mRoot.appendChild(renderBookmarkRow(item));
        break;

      case 'separator':
        mRoot.appendChild(renderSeparatorRow(item));
        break;
    }
  }

  const callbacks = [...mOnRenderdCallbacks];
  mOnRenderdCallbacks.clear();
  for (const callback of callbacks) {
    await callback();
  }
}


function getRowId(rawItem) {
  return `${rawItem.type}:${rawItem.id}`;
}

function createRow(rawItem) {
  const itemElement = document.createElement('li');
  itemElement.id         = getRowId(rawItem);
  itemElement.raw        = rawItem;
  itemElement.level      = rawItem.level || 0;
  itemElement.dataset.id = rawItem.id;
  const row = itemElement.appendChild(document.createElement('a'));
  row.classList.add('row');
  row.style.paddingLeft = `calc((var(--indent-size) * ${rawItem.level + 1}) - var(--indent-offset-size))`;
  row.setAttribute('draggable', true);
  row.setAttribute('tabindex', -1);
  return itemElement;
}

function renderFolderRow(rawItem) {
  const id = getRowId(rawItem);
  let rowElement = document.getElementById(id);
  if (!rowElement) {
    rowElement = createRow(rawItem);
    const row = rowElement.firstChild;
    row.setAttribute('title', rawItem.title);
    const twisty = row.appendChild(document.createElement('button'));
    twisty.classList.add('twisty');
    twisty.setAttribute('tabindex', -1);
    const label = row.appendChild(document.createElement('span'));
    label.classList.add('label');
    rowElement.labelElement = label;
    rowElement.classList.add('folder');
  }

  rowElement.classList.toggle('active', mActiveRawItemId == rawItem.id);
  rowElement.classList.toggle('highlighted', mHighlightedRawItemIds.has(rawItem.id) || (mActiveRawItemId == rawItem.id));
  rowElement.classList.toggle('blank', !!(rawItem.children && rawItem.children.length == 0));
  rowElement.classList.toggle('collapsed', !isFolderOpen(rawItem));
  rowElement.labelElement.textContent = rawItem.title || browser.i18n.getMessage('blankTitle');

  mDirtyRawItemIds.delete(rawItem.id);

  return rowElement;
}

function renderBookmarkRow(rawItem) {
  const id = getRowId(rawItem);
  let rowElement = document.getElementById(id);
  if (!rowElement) {
    rowElement = createRow(rawItem);
    const row = rowElement.firstChild;
    const label = row.appendChild(document.createElement('span'));
    label.classList.add('label');
    rowElement.labelElement = label;
    //const icon = label.appendChild(document.createElement('img'));
    //icon.src = bookmark.favIconUrl;
    rowElement.classList.add('bookmark');
  }

  rowElement.classList.toggle('active', mActiveRawItemId == rawItem.id);
  rowElement.classList.toggle('highlighted', mHighlightedRawItemIds.has(rawItem.id) || (mActiveRawItemId == rawItem.id));
  rowElement.classList.toggle('unavailable', !Constants.LOADABLE_URL_MATCHER.test(rawItem.url));
  rowElement.labelElement.textContent = rawItem.title || browser.i18n.getMessage('blankTitle');
  rowElement.labelElement.setAttribute('title', `${rawItem.title}\n${rawItem.url}`);

  mDirtyRawItemIds.delete(rawItem.id);

  return rowElement;
}

function renderSeparatorRow(rawItem) {
  const id = getRowId(rawItem);
  let rowElement = document.getElementById(id);
  if (!rowElement) {
    rowElement = createRow(rawItem);
    rowElement.classList.add('separator');
  }

  rowElement.classList.toggle('active', mActiveRawItemId == rawItem.id);
  rowElement.classList.toggle('highlighted', mHighlightedRawItemIds.has(rawItem.id) || (mActiveRawItemId == rawItem.id));

  mDirtyRawItemIds.delete(rawItem.id);

  return rowElement;
}


// handling of messages sent from the background page
Connection.onMessage.addListener(async message => {
  switch (message.type) {
    case Constants.NOTIFY_BOOKMARK_CREATED: {
      mRawItemsById.set(message.id, message.bookmark);
      const parentRawItem = getById(message.bookmark.parentId);
      if (parentRawItem) {
        parentRawItem.children.splice(message.bookmark.index, 0, message.bookmark);
        let offset = 1;
        for (const rawItem of parentRawItem.children.slice(message.bookmark.index + 1)) {
          rawItem.index = message.bookmark.index + offset;
          mDirtyRawItemIds.add(rawItem.id);
          offset++;
        }
        mDirtyRawItemIds.add(message.id);
        reserveToRenderRows();
      }
    }; break

    case Constants.NOTIFY_BOOKMARK_REMOVED: {
      const rawItem = getById(message.id);
      if (!rawItem)
        return;

      if (rawItem.active) {
        const index = mRawItems.indexOf(rawItem);
        const nextIndex = (index < mRawItems.length && mRawItems[index + 1].parentId == rawItem.parentId) ?
          index + 1 : // next sibling
          (index > -1 && mRawItems[index - 1].parentId == rawItem.parentId) ?
            index - 1 : // previous sibling
            mRawItems.indexOf(getParent(rawItem)); // parent
        setActive(nextIndex);
      }
      untrackRawItem(rawItem);
      reserveToRenderRows();
    }; break

    case Constants.NOTIFY_BOOKMARK_MOVED: {
      const rawItem = getById(message.id);
      if (!rawItem)
        return;

      const wasActive = mActiveRawItemId == message.id;;

      const oldIndex = mRawItems.mRawItems.findIndex(item => item.id == message.id);
      mRawItems.splice(oldIndex, 1);

      const oldParent = getById(message.moveInfo.oldParentId);
      if (oldParent) {
        const oldIndex = oldParent.children.findIndex(item => item.id == message.id);
        oldParent.children.splice(oldIndex, 1);
        let offset = 0;
        for (const rawItem of oldParent.children.slice(oldIndex)) {
          rawItem.index = oldIndex + offset;
          mDirtyRawItemIds.add(rawItem.id);
          offset++;
        }
        mDirtyRawItemIds.add(oldParent.id);
      }

      const newParent = getById(message.moveInfo.parentId);
      if (newParent) {
        mRawItems.splice(
          newParent.children && newParent.children.length > 0 ?
            mRawItems.indexOf(newParent.children[message.moveInfo.index]) :
            mRawItems.indexOf(newParent + 1),
          0,
          rawItem
        );
        newParent.children.splice(message.moveInfo.index, 0, rawItem);
        let offset = 0;
        for (const rawItem of newParent.children.slice(message.moveInfo.index + 1)) {
          rawItem.index = message.bookmark.index + offset;
          mDirtyRawItemIds.add(rawItem.id);
          offset++;
        }
        mDirtyRawItemIds.add(newParent.id);
      }
      else {
        mRawItems.push(rawItem);
      }

      rawItem.parentId = message.moveInfo.parentId;
      rawItem.index    = message.moveInfo.index;
      mDirtyRawItemIds.add(message.id);

      if (wasActive)
        mOnRenderdCallbacks.add(() => {
          setActive(rawItem);
        });

      reserveToRenderRows();
    }; break

    case Constants.NOTIFY_BOOKMARK_CHANGED: {
      const rawItem = getById(message.id);
      if (!rawItem)
        return;

      for (const property of Object.keys(message.changeInfo)) {
        rawItem[property] = message.changeInfo[property];
      }
      mDirtyRawItemIds.add(message.id);
      reserveToRenderRows();
    }; break
  }
});
