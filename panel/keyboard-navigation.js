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
  'openInTabDefault',
  'openAsActiveTab'
]);

document.addEventListener('keydown', onKeyDown);

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
      setActive(walker.previousNode() || activeItem);
      event.preventDefault();
      return;

    case 'ArrowDown':
      if (!onTree || !hasItem || accel)
        return;
      setActive(walker.nextNode() || activeItem);
      event.preventDefault();
      return;

    case 'ArrowRight':
      if (!onTree || !hasItem || accel)
        return;
      return;

    case 'ArrowLeft':
      if (!onTree || !hasItem || accel)
        return;
      return;

    case 'PageUp':
      if (!onTree || !hasItem || accel)
        return;
      for (let i = 0, maxi = getRowsCount(); i < maxi; i++) {
        walker.previousNode()
      }
      setActive(walker.currentNode || activeItem);
      event.preventDefault();
      return;

    case 'PageDown':
      if (!onTree || !hasItem || accel)
        return;
      for (let i = 0, maxi = getRowsCount(); i < maxi; i++) {
        walker.nextNode()
      }
      setActive(walker.currentNode || activeItem);
      event.preventDefault();
      return;

    case 'Home':
      if (!onTree || !hasItem || accel)
        return;
      while (walker.previousNode()) {
      }
      setActive(walker.currentNode || activeItem);
      event.preventDefault();
      return;

    case 'End':
      if (!onTree || !hasItem || accel)
        return;
      while (walker.nextNode()) {
      }
      setActive(walker.currentNode || activeItem);
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
        Bookmarks.setActive(activeItem || mRoot.firstChild);
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
      else if (!configs.openInTabAlways &&
               configs.openInTabDefault == accel)
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

function setActive(activeItem) {
  if (!activeItem)
    return;
  Bookmarks.setActive(activeItem);
  activeItem.scrollIntoView({
    behavior: 'smooth',
    block:    'nearest',
    inline:   'nearest'
  });
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
