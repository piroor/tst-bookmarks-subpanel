/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import { SequenceMatcher } from '/extlib/diff.js';

import * as Constants from '/common/constants.js';

import * as Connection from './connection.js';

let mItemsById = new Map();
let mOpenedFolderIds;

const mScrollBox = document.getElementById('content');
const mRowsContainer      = document.getElementById('rows');
let mInProgressTrackingCount = 0;
let mItems = [];
let mActiveItemId;
const mHighlightedItemIds = new Set();
const mDirtyItemIds = new Set();

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
    mItems = [];
    mScrollBox.scrollTop = 0;
    renderRows();
    mLastMode = MODE_LIST_ALL;
  }
  mHighlightedItemIds.clear();
  mDirtyItemIds.clear();
  mItemsById.clear();
  mItems = [];
  await Promise.all(rawRoot.children.map(trackItem));
  reserveToRenderRows(mLastMode == MODE_LIST_ALL && scrollPosition);
}

async function trackItem(item) {
  const parentItem = getParent(item);
  item.level = (parentItem && parentItem.level + 1) || 0;
  mItemsById.set(item.id, item);

  if (item.parentId == 'root________') {
    mItems.push(item);
  }
  else {
    const prevItemIndex = mItems.findLastIndex(another => another.id == item.parentId || another.parentId == item.parentId);
    mItems.splice(prevItemIndex + 1, 0, item);
  }

  if (!isFolderOpen(item))
    return;

  return trackItemChildren(item);
}

async function trackItemChildren(item) {
  if (!isFolderOpen(item)) {
    untrackItemDescendants(item);
    reserveToRenderRows();
    return;
  }

  if (!item.children) {
    mInProgressTrackingCount++;
    item.children = await browser.runtime.sendMessage({
      type: Constants.COMMAND_GET_CHILDREN,
      id:   item.id
    }) || null;
    mInProgressTrackingCount--;
    mDirtyItemIds.add(item.id);
    reserveToRenderRows();
  }
  if (!item.children)
    return;
  for (const child of item.children) {
    trackItem(child);
  }
  reserveToRenderRows();
}

function untrackItem(item) {
  untrackItemDescendants(item);

  const parentItem = getParent(item);
  if (parentItem) {
    parentItem.children.splice(parentItem.children.findIndex(another => another.id == item.id), 1);
    mDirtyItemIds.add(parentItem.id);
  }

  mItems.splice(mItems.indexOf(item), 1);
  mItemsById.delete(item.id);
}

function untrackItemDescendants(item) {
  if (!item.children)
    return;

  for (const child of item.children.slice(0)) {
    untrackItem(child);
  }
  item.children = null;
}


export async function search(query) {
  if (!query)
    return listAll();

  if (mLastMode != MODE_SEARCH) {
    mItems = [];
    mScrollBox.scrollTop = 0;
    renderRows();
    mLastMode = MODE_SEARCH;
  }

  mHighlightedItemIds.clear();
  mDirtyItemIds.clear();
  mItemsById.clear();

  mItems = (await browser.runtime.sendMessage({
    type: Constants.COMMAND_SEARCH_BOOKMARKS,
    query,
  })).filter(item => item.type == 'bookmark');
  mItemsById = new Map(mItems.map(item => {
    mDirtyItemIds.add(item.id);
    return [item.id, item];
  }));
  renderRows();
}


// Utilities to operate bookmark items

export function getById(id) {
  return mItemsById.get(id);
}

export function indexOf(item) {
  return mItems.indexOf(item);
}

export function getRowById(id) {
  return getRow(getById(id));
}

export function getRow(item) {
  return item && document.getElementById(getRowId(item)) || null;
}

export function getFocusableById(id) {
  return getFocusable(getById(id));
}

export function getFocusable(item) {
  return item && document.querySelector(`#${getRowId(item)} .focusable`) || null;
}

export function getParent(item) {
  return item && getById(item.parentId);
}

export function getPrevious(item) {
  if (!item)
    return null;
  const index = mItems.indexOf(item);
  if (index <= 0)
    return null;
  return mItems[index - 1];
}

export function getNext(item) {
  if (!item)
    return null;
  const index = mItems.indexOf(item);
  if (index < 0 ||
      index > mItems.length - 1)
    return null;
  return mItems[index + 1];
}

export function getFirst() {
  return mItems.length == 0 ? null : mItems[0];
}

export function getLast() {
  return mItems.length == 0 ? null : mItems[mItems.length - 1];
}

function clearActive() {
  if (mActiveItemId)
    mDirtyItemIds.add(mActiveItemId);
  for (const id of mHighlightedItemIds) {
    mDirtyItemIds.add(id);
  }
  mActiveItemId = null;
  mHighlightedItemIds.clear();
  reserveToRenderRows();
}

export function setActive(item) {
  if (!item)
    return;

  clearActive();

  mActiveItemId = item.id;
  mHighlightedItemIds.add(item.id);
  mDirtyItemIds.add(item.id);

  reserveToRenderRows();

  mOnRenderdCallbacks.add(() => {
    const focusable = getFocusableById(mActiveItemId);
    if (focusable)
      focusable.focus();
  });
  mRowsContainer.classList.add('active');
}

export function getActive() {
  return getById(mActiveItemId);
}

export function clearMultiselected() {
  mHighlightedItemIds.clear();
  if (mActiveItemId)
    mHighlightedItemIds.add(mActiveItemId);
  reserveToRenderRows();
}

export function getMultiselected() {
  return Array.from(mHighlightedItemIds, getById);
}

export function isMultiselected(item) {
  return item && mHighlightedItemIds.has(item.id);
}

export function isReallyMultiselected(item) {
  return mHighlightedItemIds.size > 1 && isMultiselected(item);
}

export function addMultiselected(...items) {
  for (const item of items) {
    mHighlightedItemIds.add(item.id);
  }
  reserveToRenderRows();
}

export function removeMultiselected(...items) {
  for (const item of items) {
    mHighlightedItemIds.delete(item.id);
  }
  reserveToRenderRows();
}

export function isFolderOpen(item) {
  return item.type == 'folder' && mOpenedFolderIds.has(item.id);
}

export function isFolderCollapsed(item) {
  return item.type == 'folder' && !mOpenedFolderIds.has(item.id);
}

export async function toggleOpenState(item) {
  if (isFolderOpen(item))
    mOpenedFolderIds.delete(item.id);
  else
    mOpenedFolderIds.add(item.id);
  Connection.sendMessage({
    type:   Constants.COMMAND_SET_CONFIGS,
    values: {
      openedFolders: Array.from(mOpenedFolderIds)
    }
  });
  await trackItemChildren(item);
  mDirtyItemIds.add(item.id);
  renderRows();
}

let mLastDropPositionHolderId = null;
let mLastDropPosition         = null;

export function setDropPosition(item, position) {
  clearDropPosition();
  if (!item)
    return;

  mLastDropPositionHolderId = item.id;
  mLastDropPosition = position;
  mDirtyItemIds.add(mLastDropPositionHolderId);
  reserveToRenderRows();
}

export function clearDropPosition() {
  if (mLastDropPositionHolderId)
    mDirtyItemIds.add(mLastDropPositionHolderId);
  mLastDropPositionHolderId = mLastDropPosition = null;
  reserveToRenderRows();
}


/* rendering */

export function reserveToRenderRows(scrollPosition) {
  const startAt = `${Date.now()}-${parseInt(Math.random() * 65000)}`;
  renderRows.lastStartedAt = startAt;
  if (typeof scrollPosition == 'number')
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
  }

  const rowSize                = getRowHeight();
  const allRenderableItemsSize = rowSize * mItems.length;
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
      mItems.length - 1,
      Math.ceil((scrollPosition + viewPortSize + renderablePaddingSize) / rowSize)
    )
  );

  const toBeRenderedItemIds = mItems.slice(firstRenderableIndex, lastRenderableIndex + 1).map(item => getRowId(item));
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
        for (const rowId of toBeRenderedItemIds.slice(toStart, toEnd)) {
          const row = document.getElementById(rowId);
          const id = rowId.replace(/^[^_]+_/, '');
          if (row &&
              mDirtyItemIds.has(id))
            renderRow(getById(id));
        }
        break;

      case 'delete': {
        const ids = mLastRenderedItemIds.slice(fromStart, fromEnd);
        for (const rowId of ids) {
          const row = document.getElementById(rowId);
          // We don't need to remove already rendered item,
          // because it is automatically moved by insertBefore().
          if (toBeRenderedItemIdSet.has(rowId) ||
              !row ||
              !mScrollBox.contains(row))
            continue;
          row.parentNode.removeChild(row);
        }
      }; break;

      case 'insert':
      case 'replace': {
        const deleteIds = mLastRenderedItemIds.slice(fromStart, fromEnd);
        const insertIds = toBeRenderedItemIds.slice(toStart, toEnd);
        for (const rowId of deleteIds) {
          const row = document.getElementById(rowId);
          // We don't need to remove already rendered tab,
          // because it is automatically moved by insertBefore().
          if (toBeRenderedItemIdSet.has(rowId) ||
              !row ||
              !mScrollBox.contains(row))
            continue;
          row.parentNode.removeChild(row);
        }
        const referenceItem = fromStart < mLastRenderedItemIds.length ?
          getById(mLastRenderedItemIds[fromStart].replace(/^[^_]+_/, '')) :
          null;
        for (const rowId of insertIds) {
          const row = renderRow(getById(rowId.replace(/^[^_]+_/, '')));
          if (!row)
            continue;
          const nextRow = getRow(referenceItem);
          mRowsContainer.insertBefore(row, nextRow);
        }
      }; break;
    }
  }

  const renderedOffset = rowSize * firstRenderableIndex;
  const transform      = `translateY(${renderedOffset}px)`;
  const containerStyle = mRowsContainer.style;
  if (containerStyle.transform != transform)
    containerStyle.transform = transform;

  mLastRenderedItemIds = toBeRenderedItemIds;

  window.requestAnimationFrame(async () => {
    if (renderRows.lastStartedAt) // someone requested while rendering!
      return;

    if (mInProgressTrackingCount == 0 &&
        typeof renderRows.expectedScrollPosition == 'number') {
      const scrollPosition = renderRows.expectedScrollPosition;
      renderRows.expectedScrollPosition = null;
      mScrollBox.scrollTop = scrollPosition;
    }

    const callbacks = [...mOnRenderdCallbacks];
    mOnRenderdCallbacks.clear();
    for (const callback of callbacks) {
      await callback();
    }
  });
}

export function getRowHeight() {
  return document.getElementById('dummy-row').getBoundingClientRect().height;
}

function renderRow(item) {
  switch (item && item.type) {
    case 'folder':
      return renderFolderRow(item);
      break;

    case 'bookmark':
      return renderBookmarkRow(item);
      break;

    case 'separator':
      return renderSeparatorRow(item);
      break;
  }
  return null;
}

function getRowId(item) {
  return `${item.type}_${item.id}`;
}

function createRow(item) {
  const row = document.createElement('li');
  row.id         = getRowId(item);
  row.raw        = item;
  row.dataset.id = item.id;
  const focusable = row.appendChild(document.createElement('a'));
  focusable.classList.add('focusable');
  focusable.setAttribute('draggable', true);
  focusable.setAttribute('tabindex', -1);
  return row;
}

function setRowStatus(item, row) {
  row.classList.toggle('active', mActiveItemId == item.id);
  row.classList.toggle('highlighted', mHighlightedItemIds.has(item.id) || (mActiveItemId == item.id));

  if (mLastDropPositionHolderId == item.id)
    row.dataset.dropPosition = mLastDropPosition;
  else
    delete row.dataset.dropPosition;

  row.level = item.level || 0;
  row.firstChild.style.paddingLeft = `calc((var(--indent-size) * ${item.level + 1}) - var(--indent-offset-size))`;
}

function renderFolderRow(item) {
  let row = document.getElementById(getRowId(item));
  if (!row) {
    row = createRow(item);
    const focusable = row.firstChild;
    focusable.setAttribute('title', item.title);
    const twisty = focusable.appendChild(document.createElement('button'));
    twisty.classList.add('twisty');
    twisty.setAttribute('tabindex', -1);
    const label = focusable.appendChild(document.createElement('span'));
    label.classList.add('label');
    row.labelElement = label;
    row.classList.add('folder');
  }

  setRowStatus(item, row);
  row.classList.toggle('blank', !!(item.children && item.children.length == 0));
  row.classList.toggle('collapsed', !isFolderOpen(item));
  row.labelElement.textContent = item.title || browser.i18n.getMessage('blankTitle');

  mDirtyItemIds.delete(item.id);

  return row;
}

function renderBookmarkRow(item) {
  let row = document.getElementById(getRowId(item));
  if (!row) {
    row = createRow(item);
    const focusable = row.firstChild;
    const label = focusable.appendChild(document.createElement('span'));
    label.classList.add('label');
    row.labelElement = label;
    //const icon = label.appendChild(document.createElement('img'));
    //icon.src = bookmark.favIconUrl;
    row.classList.add('bookmark');
  }

  setRowStatus(item, row);
  row.classList.toggle('unavailable', !Constants.LOADABLE_URL_MATCHER.test(item.url));
  row.labelElement.textContent = item.title || browser.i18n.getMessage('blankTitle');
  row.labelElement.setAttribute('title', `${item.title}\n${item.url}`);

  mDirtyItemIds.delete(item.id);

  return row;
}

function renderSeparatorRow(item) {
  let row = document.getElementById(getRowId(item));
  if (!row) {
    row = createRow(item);
    row.classList.add('separator');
  }

  setRowStatus(item, row);

  mDirtyItemIds.delete(item.id);

  return row;
}


// handling of messages sent from the background page
Connection.onMessage.addListener(async message => {
  switch (message.type) {
    case Constants.NOTIFY_BOOKMARK_CREATED: {
      const parentItem = getById(message.bookmark.parentId);
      if (!parentItem)
        break;

      if (isFolderOpen(parentItem)) {
        const item = {
          ...message.bookmark,
          level: parentItem.level + 1,
        };
        mItemsById.set(message.id, item);
        parentItem.children.splice(item.index, 0, item);
        const indexInAll = mItems.indexOf(item.index == 0 ? parentItem : parentItem.children[item.index - 1]) + 1;
        mItems.splice(indexInAll, 0, item);
        let offset = 1;
        for (const child of parentItem.children.slice(item.index + 1)) {
          child.index = item.index + offset;
          mDirtyItemIds.add(child.id);
          offset++;
        }
        mDirtyItemIds.add(item.id);
        reserveToRenderRows();
      }
      else {
        parentItem.children = null;
        mDirtyItemIds.add(parentItem.id);
        reserveToRenderRows();
      }
    }; break

    case Constants.NOTIFY_BOOKMARK_REMOVED: {
      const item = getById(message.id);
      if (!item)
        return;

      if (item.active) {
        const index = mItems.indexOf(item);
        const nextIndex = (index < mItems.length && mItems[index + 1].parentId == item.parentId) ?
          index + 1 : // next sibling
          (index > -1 && mItems[index - 1].parentId == item.parentId) ?
            index - 1 : // previous sibling
            mItems.indexOf(getParent(item)); // parent
        setActive(mItems[nextIndex]);
      }
      untrackItem(item);
      reserveToRenderRows();
    }; break

    case Constants.NOTIFY_BOOKMARK_MOVED: {
      const item = getById(message.id);
      if (!item)
        return;

      const wasActive = mActiveItemId == message.id;;

      const oldIndex = mItems.findIndex(item => item.id == message.id);
      mItems.splice(oldIndex, 1);

      const oldParent = getById(message.moveInfo.oldParentId);
      if (oldParent) {
        const oldIndex = oldParent.children.findIndex(item => item.id == message.id);
        oldParent.children.splice(oldIndex, 1);
        let offset = 0;
        for (const item of oldParent.children.slice(oldIndex)) {
          item.index = oldIndex + offset;
          mDirtyItemIds.add(item.id);
          offset++;
        }
        mDirtyItemIds.add(oldParent.id);
      }

      const newParent = getById(message.moveInfo.parentId);
      if (newParent) {
        mItems.splice(
          newParent.children && newParent.children.length > 0 ?
            mItems.indexOf(newParent.children[message.moveInfo.index]) :
            mItems.indexOf(newParent + 1),
          0,
          item
        );
        newParent.children.splice(message.moveInfo.index, 0, item);
        let offset = 0;
        for (const item of newParent.children.slice(message.moveInfo.index + 1)) {
          item.index = message.moveInfo.index + offset;
          mDirtyItemIds.add(item.id);
          offset++;
        }
        item.level = newParent.level + 1;
        mDirtyItemIds.add(newParent.id);
      }
      else {
        mItems.push(item);
      }

      item.parentId = message.moveInfo.parentId;
      item.index    = message.moveInfo.index;
      mDirtyItemIds.add(message.id);

      if (isFolderOpen(item)) {
        untrackItemDescendants(item);
        trackItemChildren(item)
      }

      if (wasActive)
        mOnRenderdCallbacks.add(() => {
          setActive(item);
        });

      reserveToRenderRows();
    }; break

    case Constants.NOTIFY_BOOKMARK_CHANGED: {
      const item = getById(message.id);
      if (!item)
        return;

      for (const property of Object.keys(message.changeInfo)) {
        item[property] = message.changeInfo[property];
      }
      mDirtyItemIds.add(message.id);
      reserveToRenderRows();
    }; break
  }
});
