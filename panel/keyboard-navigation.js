/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';
import * as Constants from '/common/constants.js';

import * as Connection from './connection.js';
import * as Bookmarks from './bookmarks.js';
import * as EventUtils from './event-utils.js';

const mSearchBox = document.getElementById('searchbox');
const mRoot = document.getElementById('root');

const configs = Connection.getConfigs([
  'openInTabAlways',
  'openAsActiveTab'
]);

document.addEventListener('keydown', onKeyDown);

let mFirstMultiselectId = null;
let mLastMultiselectId = null;

function onKeyDown(event) {
  if (event.isComposing)
    return;

  const target = EventUtils.getElementTarget(event);
  const onSearchBox = target.closest('#searchbar');
  const onTree = !target.closest('#searchbar');
  const hasItem = mRoot.hasChildNodes();
  const activeItem = Bookmarks.getActive();
  const accel = event.ctrlKey || event.metaKey || event.button == 1;

  const walker = createVisibleItemWalker();
  if (activeItem)
    walker.currentNode = activeItem;

  switch (event.key) {
    case 'ArrowUp':
      if (!onTree || !hasItem || accel)
        return;
      setActive(walker.previousNode() || activeItem, { multiselect: event.shiftKey });
      event.preventDefault();
      return;

    case 'ArrowDown':
      if (!onTree || !hasItem || accel)
        return;
      setActive(walker.nextNode() || activeItem, { multiselect: event.shiftKey });
      event.preventDefault();
      return;

    case 'ArrowRight':
      if (!onTree || !hasItem || !activeItem)
        return;
      if (activeItem.classList.contains('folder') &&
          activeItem.classList.contains('collapsed'))
        Bookmarks.toggleOpenState(activeItem);
      else
        setActive(activeItem.querySelector('li') || activeItem);
      event.preventDefault();
      return;

    case 'ArrowLeft':
      if (!onTree || !hasItem || !activeItem)
        return;
      if (activeItem.classList.contains('folder') &&
          !activeItem.classList.contains('collapsed'))
        Bookmarks.toggleOpenState(activeItem);
      else
        setActive(activeItem.parentNode.closest('li') || activeItem);
      event.preventDefault();
      return;

    case 'PageUp':
      if (!onTree || !hasItem || accel)
        return;
      for (let i = 0, maxi = getRowsCount(); i < maxi; i++) {
        walker.previousNode()
      }
      setActive(walker.currentNode || activeItem, {
        multiselect: event.shiftKey,
        jumped:      true
      });
      event.preventDefault();
      return;

    case 'PageDown':
      if (!onTree || !hasItem || accel)
        return;
      for (let i = 0, maxi = getRowsCount(); i < maxi; i++) {
        walker.nextNode()
      }
      setActive(walker.currentNode || activeItem, {
        multiselect: event.shiftKey,
        jumped:      true
      });
      event.preventDefault();
      return;

    case 'Home':
      if (!onTree || !hasItem || accel)
        return;
      while (walker.previousNode()) {
      }
      setActive(walker.currentNode || activeItem, {
        multiselect: event.shiftKey,
        jumped:      true
      });
      event.preventDefault();
      return;

    case 'End':
      if (!onTree || !hasItem || accel)
        return;
      while (walker.nextNode()) {
      }
      setActive(walker.currentNode || activeItem, {
        multiselect: event.shiftKey,
        jumped:      true
      });
      event.preventDefault();
      return;

    case 'Tab':
      if (event.shiftKey) {
        if (event.target == document.documentElement ||
            event.target == mRoot ||
            event.target == mSearchBox) {
          return;
        }
        else {
          mSearchBox.focus();
          event.preventDefault();
        }
      }
      if (onSearchBox) {
        Bookmarks.setActive(activeItem || mRoot.firstChild, { multiselect: true });
        event.preventDefault();
      }
      return;

    case 'Enter':
      if (!onTree ||
          onSearchBox ||
          !activeItem ||
          activeItem.raw.type == 'separator')
        return;
      if (activeItem.raw.type == 'folder') {
        Bookmarks.toggleOpenState(activeItem);
        event.preventDefault();
        return;
      }
      if (event.shiftKey)
        Connection.sendMessage({
          type:     Constants.COMMAND_OPEN_BOOKMARKS,
          urls:     [activeItem.raw.url],
          inWindow: true
        });
      else if (!configs.openInTabAlways)
        Connection.sendMessage({
          type: Constants.COMMAND_LOAD_BOOKMARK,
          url:  activeItem.raw.url
        });
      else
        Connection.sendMessage({
          type:       Constants.COMMAND_OPEN_BOOKMARKS,
          urls:       [activeItem.raw.url],
          background: !configs.openAsActiveTab
        });
      event.preventDefault();
      return;
  }
}

function setActive(activeItem, options = {}) {
  if (!activeItem)
    return;

  const lastActiveItem = Bookmarks.getActive() || activeItem;

  if (!options.multiselect)
    mFirstMultiselectId = mLastMultiselectId = null;
  else if (!mFirstMultiselectId && lastActiveItem)
    mFirstMultiselectId = lastActiveItem.raw.id;

  Bookmarks.setActive(activeItem, options);
  activeItem.firstChild.scrollIntoView({
    behavior: 'smooth',
    block:    'nearest',
    inline:   'nearest'
  });

  if (!options.multiselect)
    return;

  mLastMultiselectId = activeItem.raw.id;
  let firstItem = Bookmarks.get(mFirstMultiselectId);
  const lastItem = Bookmarks.get(mLastMultiselectId);

  const isBottomToTop = firstItem != lastItem && lastItem.compareDocumentPosition(firstItem) & Node.DOCUMENT_POSITION_FOLLOWING;

  if (firstItem != lastItem) {
    // When there is any unhighlighted item between highlighted items (they may
    // be produced with expansion of a highlighted folder), we should restart
    // multiselection from most nearest highlighted item.
    let lastHighlighted = options.jumped ? lastActiveItem : lastItem;
    const nearestHighlightedWalker = createVisibleItemWalker();
    nearestHighlightedWalker.currentNode = lastHighlighted;
    while (isBottomToTop ? nearestHighlightedWalker.nextNode() : nearestHighlightedWalker.previousNode()) {
      const current = nearestHighlightedWalker.currentNode;
      if (!current ||
          current == lastItem ||
          !current.classList.contains('highlighted'))
        break;
      lastHighlighted = current;
    }
    if (lastHighlighted != firstItem &&
        (isBottomToTop ?
          (lastHighlighted.compareDocumentPosition(firstItem) & Node.DOCUMENT_POSITION_FOLLOWING) :
          (firstItem.compareDocumentPosition(lastHighlighted) & Node.DOCUMENT_POSITION_FOLLOWING))) {
      firstItem = lastHighlighted;
      mFirstMultiselectId = lastHighlighted.raw.id;
    }
  }

  const toBeUnhighlighted = new Set(mRoot.querySelectorAll('li.highlighted'));
  toBeUnhighlighted.delete(firstItem);
  firstItem.classList.add('highlighted');

  if (firstItem != lastItem) {
    toBeUnhighlighted.delete(lastItem);
    lastItem.classList.add('highlighted');
    const highlightableItemWalker = createVisibleItemWalker();
    highlightableItemWalker.currentNode = firstItem;
    while (isBottomToTop ? highlightableItemWalker.previousNode() : highlightableItemWalker.nextNode()) {
      const current = highlightableItemWalker.currentNode;
      if (!current ||
          current == lastItem)
        break;
      current.classList.add('highlighted');
      toBeUnhighlighted.delete(current);
    }
  }

  for (const item of toBeUnhighlighted) {
    item.classList.remove('highlighted');
  }
}

function createVisibleItemWalker() {
  return document.createTreeWalker(
    mRoot,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (!node.matches('#root li'))
          return NodeFilter.FILTER_SKIP;
        const collapsed = node.parentNode.closest('li.collapsed');
        if (collapsed)
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );
}

function getRowsCount() {
  return Math.floor(mRoot.getBoundingClientRect().height / mRoot.firstChild.firstChild.getBoundingClientRect().height) - 1;
}
