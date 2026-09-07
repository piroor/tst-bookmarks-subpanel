/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import { SequenceMatcher } from '/extlib/diff.js';

import * as Constants from '/common/constants.js';

import * as Connection from './connection.js';

let debug = false;

const mItemsById = new Map();
let mItemsByFullId = new Map();
let mOpenedFolderIds;
const mKnownFolderHasChildren = new Map();
const mCheckingFolderIds = new Set();

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
let mLastSearchQuery = '';
let mReservedReloadTimer = null;

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
          'debug',
        ]
      });
      mOpenedFolderIds = new Set(configs.openedFolders);
      scrollPosition = configs.scrollPosition;
      debug = configs.debug;
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
  mKnownFolderHasChildren.clear();
  mItemsById.clear();
  mItemsByFullId.clear();
  mItems = [];
  await Promise.all(rawRoot.children.map(item => trackItem(item, {
    render: false
  })));
  reserveToRenderRows(mLastMode == MODE_LIST_ALL && scrollPosition);
}

async function trackItem(item, { render = true } = {}) {
  const parentItem = getParent(item);
  item.fullId = parentItem ? `${parentItem.fullId}_${item.id}` : item.id;
  item.parentFlatId = parentItem && parentItem.fullId;
  item.level = (parentItem && parentItem.level + 1) || 0;
  mItemsByFullId.set(item.fullId, item);

  const items = mItemsById.get(item.id) || new Set();
  items.add(item);
  mItemsById.set(item.id, items);

  if (item.parentId == 'root________') {
    mItems.push(item);
  }
  else {
    const prevItemIndex = mItems.findLastIndex(another => another.fullId == item.parentFlatId || another.parentFlatId == item.parentFlatId);
    mItems.splice(prevItemIndex + 1, 0, item);
  }

  if (!isFolderOpen(item)) {
    if (render)
      reserveToRenderRows();
    return;
  }

  return trackItemChildren(item, { render });
}

async function trackItemChildren(item, { render = true } = {}) {
  if (!isFolderOpen(item)) {
    untrackItemDescendants(item);
    if (render)
      reserveToRenderRows();
    return;
  }

  if (!item.children) {
    mInProgressTrackingCount++;
    item.children = await browser.runtime.sendMessage({
      type: Constants.COMMAND_GET_CHILDREN,
      id:   item.id
    }) || [];
    mKnownFolderHasChildren.set(item.id, item.children.length > 0);
    mInProgressTrackingCount--;
    mDirtyItemIds.add(item.fullId);
    if (render)
      reserveToRenderRows();
  }
  if (!item.children)
    return;
  await Promise.all(item.children.map(child => {
    child.fullParentId = item.fullId;
    return trackItem(child, { render: false });
  }));
  if (render)
    reserveToRenderRows();
}

function untrackItem(item) {
  untrackItemDescendants(item);

  const parentItem = getParent(item);
  if (parentItem) {
    parentItem.children.splice(parentItem.children.findIndex(another => another.fullId == item.fullId), 1);
    mDirtyItemIds.add(parentItem.fullId);
  }

  mItems.splice(mItems.indexOf(item), 1);
  mItemsByFullId.delete(item.fullId);

  const items = mItemsById.get(item.id);
  if (items) {
    items.delete(item);
    if (items.size == 0)
      mItemsById.delete(item.id);
  }
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
  mLastSearchQuery = query || '';
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
  mItemsByFullId.clear();

  mItems = (await browser.runtime.sendMessage({
    type: Constants.COMMAND_SEARCH_BOOKMARKS,
    query,
  })).filter(item => item.type == 'bookmark');
  mItemsByFullId = new Map(mItems.map(item => {
    item.fullId       = item.id;
    item.fullParentId = null;
    item.level        = 0;

    const items = mItemsById.get(item.id) || new Set();
    items.add(item);
    mItemsById.set(item.id, items);

    mDirtyItemIds.add(item.id);
    return [item.id, item];
  }));
  renderRows();
}


// Utilities to operate bookmark items

export function getById(id) {
  if (mItemsByFullId.has(id))
    return mItemsByFullId.get(id);

  const items = mItemsById.get(id);
  return items && items.size > 0 ? items.values().next().value : null;
}

export function getAllById(id) {
  if (mItemsByFullId.has(id))
    return [mItemsByFullId.get(id)];

  const items = mItemsById.get(id);
  return items ? [...items] : [];
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
  return item && getById(item.fullParentId) || getById(item.parentId);
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

function clearActive({ keepMultiselected } = {}) {
  if (mActiveItemId)
    mDirtyItemIds.add(mActiveItemId);
  mActiveItemId = null;
  if (!keepMultiselected) {
    for (const id of mHighlightedItemIds) {
      mDirtyItemIds.add(id);
    }
    mHighlightedItemIds.clear();
  }
  reserveToRenderRows();
}

export function setActive(item, { multiselect } = {}) {
  if (!item)
    return;

  clearActive({ keepMultiselected: !!multiselect });

  mActiveItemId = item.fullId;
  mHighlightedItemIds.add(item.fullId);
  mDirtyItemIds.add(item.fullId);

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
  pushMultiselectedItems();
  reserveToRenderRows();
}

export function getMultiselected() {
  return Array.from(mHighlightedItemIds, getById);
}

export function isMultiselected(item) {
  return item && mHighlightedItemIds.has(item.fullId);
}

export function isReallyMultiselected(item) {
  return mHighlightedItemIds.size > 1 && isMultiselected(item);
}

export function addMultiselected(...items) {
  for (const item of items) {
    mHighlightedItemIds.add(item.fullId);
  }
  pushMultiselectedItems();
  reserveToRenderRows();
}

function pushMultiselectedItems() {
  const startAt = `${Date.now()}-${parseInt(Math.random() * 65000)}`;
  pushMultiselectedItems.lastStartedAt = startAt;
  window.requestAnimationFrame(() => {
    if (pushMultiselectedItems.lastStartedAt != startAt)
      return;
    browser.runtime.sendMessage({
      type:  Constants.COMMAND_PUSH_MULTISELECTED_ITEMS,
      items: mItems.filter(item => mHighlightedItemIds.has(item.fullId)),
    });
  });
}

export function removeMultiselected(...items) {
  for (const item of items) {
    mHighlightedItemIds.delete(item.fullId);
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

  const items = mItemsById.get(item.id);
  await Promise.all(Array.from(items, async item => {
    await trackItemChildren(item);
    mDirtyItemIds.add(item.fullId);
  }));
  Connection.sendMessage({
    type:   Constants.COMMAND_SET_CONFIGS,
    values: {
      openedFolders: Array.from(mOpenedFolderIds)
    }
  });
  renderRows();
}

let mLastDropPositionHolderId = null;
let mLastDropPosition         = null;

export function setDropPosition(item, position) {
  if (!item)
    return clearDropPosition();

  if (mLastDropPositionHolderId == item.fullId &&
      mLastDropPosition == position)
    return;

  clearDropPosition();

  mLastDropPositionHolderId = item.fullId;
  mLastDropPosition = position;
  mDirtyItemIds.add(mLastDropPositionHolderId);
  reserveToRenderRows();
}

export function clearDropPosition() {
  if (!mLastDropPositionHolderId &&
      !mLastDropPosition)
    return;

  if (mLastDropPositionHolderId)
    mDirtyItemIds.add(mLastDropPositionHolderId);
  mLastDropPositionHolderId = mLastDropPosition = null;
  reserveToRenderRows();
}

function reserveToReloadAll() {
  if (mReservedReloadTimer)
    clearTimeout(mReservedReloadTimer);
  mReservedReloadTimer = setTimeout(() => {
    mReservedReloadTimer = null;
    if (mLastMode == MODE_SEARCH)
      search(mLastSearchQuery);
    else
      listAll();
  }, 100);
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
let mLastRenderedItemIdsForDebug = [];
let mInternalScrollCount = 0;
let mReservedScrollPosition = null;
let mScrollPositionSaveTimer = null;

mScrollBox.addEventListener('scroll', () => {
  if (mInternalScrollCount > 0)
    return;
  reserveToSaveScrollPosition(mScrollBox.scrollTop);
  renderRows();
});

function reserveToSaveScrollPosition(position) {
  mReservedScrollPosition = position;
  if (mScrollPositionSaveTimer)
    clearTimeout(mScrollPositionSaveTimer);
  mScrollPositionSaveTimer = setTimeout(() => {
    mScrollPositionSaveTimer = null;
    Connection.sendMessage({
      type:   Constants.COMMAND_SET_CONFIGS,
      values: {
        scrollPosition: mReservedScrollPosition,
      }
    });
  }, 250);
}

function renderRows(scrollPosition) {
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
      allRenderableItemsSize - viewPortSize,
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
  mInternalScrollCount++;
  mScrollBox.scrollPosition = scrollPosition;
  window.requestAnimationFrame(() => {
    mInternalScrollCount--;
  });

  const toBeRenderedItemIds = mItems.slice(firstRenderableIndex, lastRenderableIndex + 1).map(item => getRowId(item));
  const toBeRenderedItemIdsForDebug = mItems.slice(firstRenderableIndex, lastRenderableIndex + 1).map(item => `${getRowId(item)} / ${item.title}`);
  const renderOperations = (new SequenceMatcher(mLastRenderedItemIds, toBeRenderedItemIds)).operations();
  if (debug) {
    console.log('renderRows ', {
      firstRenderableIndex,
      lastRenderableIndex,
      scrollPosition,
      viewPortSize,
      allRenderableItemsSize,
      all: mItems,
      old: mLastRenderedItemIdsForDebug,
      new: toBeRenderedItemIdsForDebug,
      renderOperations,
    });
  }

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
        const referenceItem = fromEnd < mLastRenderedItemIds.length ?
          getById(mLastRenderedItemIds[fromEnd].replace(/^[^_]+_/, '')) :
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
  mLastRenderedItemIdsForDebug = toBeRenderedItemIdsForDebug;

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
  return `${item.type}_${item.fullId}`;
}

function createRow(item) {
  const row = document.createElement('li');
  row.id         = getRowId(item);
  row.raw        = item;
  row.dataset.id = item.id;
  row.setAttribute('role', 'treeitem');
  const focusable = row.appendChild(document.createElement('a'));
  focusable.classList.add('focusable');
  focusable.setAttribute('draggable', true);
  focusable.setAttribute('tabindex', -1);
  return row;
}

function setRowStatus(item, row) {
  row.classList.toggle('active', mActiveItemId == item.fullId);
  row.classList.toggle('highlighted', mHighlightedItemIds.has(item.fullId) || (mActiveItemId == item.fullId));
  row.setAttribute('aria-selected', mHighlightedItemIds.has(item.fullId) || (mActiveItemId == item.fullId));

  if (mLastDropPositionHolderId == item.fullId)
    row.dataset.dropPosition = mLastDropPosition;
  else
    delete row.dataset.dropPosition;

  row.level = item.level || 0;
  row.setAttribute('aria-level', row.level + 1);
  row.style.setProperty('--row-indent', `calc((var(--indent-size) * ${item.level + 1}) - var(--indent-offset-size))`);
  row.firstChild.style.paddingInlineStart = 'var(--row-indent)';
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
  if (mKnownFolderHasChildren.has(item.id))
    item.hasChildren = mKnownFolderHasChildren.get(item.id);
  else
    requestFolderHasChildren(item);
  row.classList.toggle('blank', item.hasChildren === false || !!(item.children && item.children.length == 0));
  row.classList.toggle('collapsed', !isFolderOpen(item));
  row.setAttribute('aria-expanded', isFolderOpen(item));
  row.labelElement.textContent = item.title || browser.i18n.getMessage('blankTitle');

  mDirtyItemIds.delete(item.fullId);

  return row;
}

async function requestFolderHasChildren(item) {
  if (mCheckingFolderIds.has(item.id))
    return;

  mCheckingFolderIds.add(item.id);
  let children = [];
  try {
    children = await browser.runtime.sendMessage({
      type: Constants.COMMAND_GET_CHILDREN,
      id:   item.id
    }) || [];
  }
  finally {
    mCheckingFolderIds.delete(item.id);
  }
  mKnownFolderHasChildren.set(item.id, children.length > 0);

  for (const trackedItem of getAllById(item.id)) {
    trackedItem.hasChildren = children.length > 0;
    mDirtyItemIds.add(trackedItem.fullId);
  }
  reserveToRenderRows();
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
  row.removeAttribute('aria-expanded');
  row.labelElement.textContent = item.title || browser.i18n.getMessage('blankTitle');
  row.labelElement.setAttribute('title', `${item.title}\n${item.url}`);

  mDirtyItemIds.delete(item.fullId);

  return row;
}

function renderSeparatorRow(item) {
  let row = document.getElementById(getRowId(item));
  if (!row) {
    row = createRow(item);
    row.classList.add('separator');
  }

  setRowStatus(item, row);
  row.removeAttribute('aria-expanded');

  mDirtyItemIds.delete(item.fullId);

  return row;
}


// handling of messages sent from the background page
Connection.onMessage.addListener(message => {
  switch (message.type) {
    case Constants.NOTIFY_BOOKMARK_CREATED:
    case Constants.NOTIFY_BOOKMARK_REMOVED:
    case Constants.NOTIFY_BOOKMARK_MOVED:
    case Constants.NOTIFY_BOOKMARK_CHANGED:
      // Batch Places notifications. A drag/drop or bookmark-tree save can emit
      // many events, and rebuilding once is cheaper and more reliable than
      // patching the flattened tree for every single item.
      reserveToReloadAll();
      break;
  }
});
