/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import { SequenceMatcher } from '/extlib/diff.js';

import * as Constants from '/common/constants.js';

import * as Connection from './connection.js';

let mRawItemsById = new Map();
let mOpenedFolderIds;

const mScrollBox = document.getElementById('content');
const mRoot      = document.getElementById('root');
let mRawItems = [];
let mActiveRawItemId;
const mHighlightedRawItemIds = new Set();
const mDirtyRawItemIds = new Set();

const mOnRenderdCallbacks = new Set();

export async function init() {
  listAll();
}


// Listing raw bookmark items

const MODE_LIST_ALL = 0;
const MODE_SEARCH   = 1;
let mLastMode = MODE_LIST_ALL;

async function listAll() {
  let scrollPosition = 0;
  const [rawRoot] = await Promise.all([
    browser.runtime.sendMessage({
      type: Constants.COMMAND_GET_ROOT
    }),
    (async () => {
      const configs = await browser.runtime.sendMessage({
        type: Constants.COMMAND_GET_CONFIGS,
        keys: [
          'openedFolders',
          'scrollPosition',
        ]
      });
      mOpenedFolderIds = new Set(configs.openedFolders);
      scrollPosition = configs.scrollPosition;
    })(),
  ]);

  if (mLastMode != MODE_LIST_ALL) {
    mRawItems = [];
    mScrollBox.scrollTop = 0;
    renderRows();
    mLastMode = MODE_LIST_ALL;
  }
  mHighlightedRawItemIds.clear();
  mDirtyRawItemIds.clear();
  mRawItemsById.clear();
  mRawItems = [];
  await Promise.all(rawRoot.children.map(trackRawItem));
  reserveToRenderRows(scrollPosition);
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
    untrackRawItemDescendants(rawItem);
    reserveToRenderRows();
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
  reserveToRenderRows();
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
    return;

  for (const child of rawItem.children.slice(0)) {
    untrackRawItem(child);
  }
  rawItem.children = null;
}


export async function search(query) {
  if (!query)
    return listAll();

  if (mLastMode != MODE_SEARCH) {
    mRawItems = [];
    mScrollBox.scrollTop = 0;
    renderRows();
    mLastMode = MODE_SEARCH;
  }

  mHighlightedRawItemIds.clear();
  mDirtyRawItemIds.clear();
  mRawItemsById.clear();

  mRawItems = (await browser.runtime.sendMessage({
    type: Constants.COMMAND_SEARCH_BOOKMARKS,
    query,
  })).filter(item => item.type == 'bookmark');
  mRawItemsById = new Map(mRawItems.map(item => {
    mDirtyRawItemIds.add(item.id);
    return [item.id, item];
  }));
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
  return getRow(getById(id));
}

export function getRow(rawItem) {
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
  if (mActiveRawItemId)
    mDirtyRawItemIds.add(mActiveRawItemId);
  for (const id of mHighlightedRawItemIds) {
    mDirtyRawItemIds.add(id);
  }
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
  mDirtyRawItemIds.add(rawItem.id);

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

export function isReallyMultiselected(rawItem) {
  return mHighlightedRawItemIds.size > 1 && isMultiselected(rawItem);
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

let mLastDropPositionHolderId = null;
let mLastDropPosition         = null;

export function setDropPosition(rawItem, position) {
  clearDropPosition();
  if (!rawItem)
    return;

  mLastDropPositionHolderId = rawItem.id;
  mLastDropPosition = position;
  mDirtyRawItemIds.add(mLastDropPositionHolderId);
  reserveToRenderRows();
}

export function clearDropPosition() {
  if (mLastDropPositionHolderId)
    mDirtyRawItemIds.add(mLastDropPositionHolderId);
  mLastDropPositionHolderId = mLastDropPosition = null;
  reserveToRenderRows();
}


/* rendering */

export function reserveToRenderRows(scrollPosition) {
  const startAt = `${Date.now()}-${parseInt(Math.random() * 65000)}`;
  renderRows.lastStartedAt = startAt;
  renderRows.expectedScrollPosition = scrollPosition;
  window.requestAnimationFrame(() => {
    if (renderRows.lastStartedAt != startAt)
      return;
    renderRows();
  });
}

const mVirtualScrollContainer = document.querySelector('.virtual-scroll-container');
let mLastRenderedItemIds = [];

mScrollBox.addEventListener('scroll', () => {
  mOnRenderdCallbacks.add(() => {
    Connection.sendMessage({
      type:   Constants.COMMAND_SET_CONFIGS,
      values: {
        scrollPosition: mScrollBox.scrollTop,
      }
    });
  });
  renderRows();
});

async function renderRows(scrollPosition) {
  renderRows.lastStartedAt = null;
  if (typeof scrollPosition != 'number' &&
      typeof renderRows.expectedScrollPosition == 'number') {
    scrollPosition = renderRows.expectedScrollPosition;
    renderRows.expectedScrollPosition = null;
  }

  const rowSize                = getRowHeight();
  const allRenderableItemsSize = rowSize * mRawItems.length;
  const viewPortSize           = mScrollBox.getBoundingClientRect().height;
  const renderablePaddingSize  = viewPortSize;

  // We need to use min-height instead of height for a flexbox.
  const minHeight                   = `${allRenderableItemsSize}px`;
  const virtualScrollContainerStyle = mVirtualScrollContainer.style;
  const resized = virtualScrollContainerStyle.minHeight != minHeight;
  if (resized)
    virtualScrollContainerStyle.minHeight = minHeight;

  scrollPosition = Math.max(
    0,
    Math.min(
      allRenderableItemsSize - rowSize,
      typeof scrollPosition == 'number' ?
        scrollPosition :
        mScrollBox.scrollTop
    )
  );
  if (scrollPosition != mScrollBox.scrollTop)
    mScrollBox.scrollTop = scrollPosition;

  const firstRenderableIndex = Math.max(
    0,
    Math.floor((scrollPosition - renderablePaddingSize) / rowSize)
  );
  const lastRenderableIndex = Math.max(
    0,
    Math.min(
      mRawItems.length - 1,
      Math.ceil((scrollPosition + viewPortSize + renderablePaddingSize) / rowSize)
    )
  );

  const toBeRenderedItemIds = mRawItems.slice(firstRenderableIndex, lastRenderableIndex + 1).map(item => getRowId(item));
  const renderOperations = (new SequenceMatcher(mLastRenderedItemIds, toBeRenderedItemIds)).operations();
  /*
  console.log('renderRows ', {
    firstRenderableIndex,
    lastRenderableIndex,
    old: mLastRenderedItemIds,
    new: toBeRenderedItemIds,
    renderOperations,
  });
  */

  const toBeRenderedItemIdSet = new Set(toBeRenderedItemIds);
  for (const operation of renderOperations) {
    const [tag, fromStart, fromEnd, toStart, toEnd] = operation;
    switch (tag) {
      case 'equal':
        for (const id of toBeRenderedItemIds.slice(toStart, toEnd)) {
          const rawId = id.replace(/^[^:]+:/, '');
          const rowElement = document.getElementById(id);
          if (rowElement &&
              mDirtyRawItemIds.has(rawId))
            renderRow(getById(rawId));
        }
        break;

      case 'delete': {
        const ids = mLastRenderedItemIds.slice(fromStart, fromEnd);
        for (const id of ids) {
          const rowElement = document.getElementById(id);
          // We don't need to remove already rendered item,
          // because it is automatically moved by insertBefore().
          if (toBeRenderedItemIdSet.has(id) ||
              !rowElement ||
              !mScrollBox.contains(rowElement))
            continue;
          rowElement.parentNode.removeChild(rowElement);
        }
      }; break;

      case 'insert':
      case 'replace': {
        const deleteIds = mLastRenderedItemIds.slice(fromStart, fromEnd);
        const insertIds = toBeRenderedItemIds.slice(toStart, toEnd);
        for (const id of deleteIds) {
          const rowElement = document.getElementById(id);
          // We don't need to remove already rendered tab,
          // because it is automatically moved by insertBefore().
          if (toBeRenderedItemIdSet.has(id) ||
              !rowElement ||
              !mScrollBox.contains(rowElement))
            continue;
          rowElement.parentNode.removeChild(rowElement);
        }
        const referenceItem = fromStart < mLastRenderedItemIds.length ?
          getById(mLastRenderedItemIds[fromStart].replace(/^[^:]+:/, '')) :
          null;
        for (const id of insertIds) {
          const rowElement = renderRow(getById(id.replace(/^[^:]+:/, '')));
          if (!rowElement)
            continue;
          const nextElement = getRow(referenceItem);
          mRoot.insertBefore(rowElement, nextElement);
        }
      }; break;
    }
  }

  const renderedOffset = rowSize * firstRenderableIndex;
  const transform      = `translateY(${renderedOffset}px)`;
  const containerStyle = mRoot.style;
  if (containerStyle.transform != transform)
    containerStyle.transform = transform;

  mLastRenderedItemIds = toBeRenderedItemIds;

  const callbacks = [...mOnRenderdCallbacks];
  mOnRenderdCallbacks.clear();
  for (const callback of callbacks) {
    await callback();
  }
}

export function getRowHeight() {
  return document.getElementById('dummy-row').getBoundingClientRect().height;
}

function renderRow(rawItem) {
  switch (rawItem && rawItem.type) {
    case 'folder':
      return renderFolderRow(rawItem);
      break;

    case 'bookmark':
      return renderBookmarkRow(rawItem);
      break;

    case 'separator':
      return renderSeparatorRow(rawItem);
      break;
  }
  return null;
}

function getRowId(rawItem) {
  return `${rawItem.type}:${rawItem.id}`;
}

function createRow(rawItem) {
  const itemElement = document.createElement('li');
  itemElement.id         = getRowId(rawItem);
  itemElement.raw        = rawItem;
  itemElement.dataset.id = rawItem.id;
  const row = itemElement.appendChild(document.createElement('a'));
  row.classList.add('row');
  row.setAttribute('draggable', true);
  row.setAttribute('tabindex', -1);
  return itemElement;
}

function setRowStatus(rawItem, rowElement) {
  rowElement.classList.toggle('active', mActiveRawItemId == rawItem.id);
  rowElement.classList.toggle('highlighted', mHighlightedRawItemIds.has(rawItem.id) || (mActiveRawItemId == rawItem.id));

  if (mLastDropPositionHolderId == rawItem.id)
    rowElement.dataset.dropPosition = mLastDropPosition;
  else
    delete rowElement.dataset.dropPosition;

  rowElement.level = rawItem.level || 0;
  rowElement.firstChild.style.paddingLeft = `calc((var(--indent-size) * ${rawItem.level + 1}) - var(--indent-offset-size))`;
}

function renderFolderRow(rawItem) {
  let rowElement = document.getElementById(getRowId(rawItem));
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

  setRowStatus(rawItem, rowElement);
  rowElement.classList.toggle('blank', !!(rawItem.children && rawItem.children.length == 0));
  rowElement.classList.toggle('collapsed', !isFolderOpen(rawItem));
  rowElement.labelElement.textContent = rawItem.title || browser.i18n.getMessage('blankTitle');

  mDirtyRawItemIds.delete(rawItem.id);

  return rowElement;
}

function renderBookmarkRow(rawItem) {
  let rowElement = document.getElementById(getRowId(rawItem));
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

  setRowStatus(rawItem, rowElement);
  rowElement.classList.toggle('unavailable', !Constants.LOADABLE_URL_MATCHER.test(rawItem.url));
  rowElement.labelElement.textContent = rawItem.title || browser.i18n.getMessage('blankTitle');
  rowElement.labelElement.setAttribute('title', `${rawItem.title}\n${rawItem.url}`);

  mDirtyRawItemIds.delete(rawItem.id);

  return rowElement;
}

function renderSeparatorRow(rawItem) {
  let rowElement = document.getElementById(getRowId(rawItem));
  if (!rowElement) {
    rowElement = createRow(rawItem);
    rowElement.classList.add('separator');
  }

  setRowStatus(rawItem, rowElement);

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
        setActive(mRawItems[nextIndex]);
      }
      untrackRawItem(rawItem);
      reserveToRenderRows();
    }; break

    case Constants.NOTIFY_BOOKMARK_MOVED: {
      const rawItem = getById(message.id);
      if (!rawItem)
        return;

      const wasActive = mActiveRawItemId == message.id;;

      const oldIndex = mRawItems.findIndex(item => item.id == message.id);
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
          rawItem.index = message.moveInfo.index + offset;
          mDirtyRawItemIds.add(rawItem.id);
          offset++;
        }
        rawItem.level = newParent.level + 1;
        mDirtyRawItemIds.add(newParent.id);
      }
      else {
        mRawItems.push(rawItem);
      }

      rawItem.parentId = message.moveInfo.parentId;
      rawItem.index    = message.moveInfo.index;
      mDirtyRawItemIds.add(message.id);

      if (isFolderOpen(rawItem)) {
        untrackRawItemDescendants(rawItem);
        trackRawItemChildren(rawItem)
      }

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
