/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Bookmarks from './bookmarks.js';
import * as EventUtils from './event-utils.js';

const mRoot = document.getElementById('root');

document.addEventListener('keydown', onKeyDown);

function onKeyDown(event) {
  if (event.isComposing)
    return;

  const onTree = !EventUtils.getElementTarget(event).closest('#searchbar');
  const hasItem = mRoot.hasChildNodes();
  const activeItem = Bookmarks.getActive();

  const walker = createVisibleItemWalker();
  if (activeItem)
    walker.currentNode = activeItem;

  switch (event.key) {
    case 'ArrowUp':
      if (!onTree || !hasItem)
        return;
      setActive(walker.previousNode() || activeItem);
      event.preventDefault();
      return;

    case 'ArrowDown':
      if (!onTree || !hasItem)
        return;
      setActive(walker.nextNode() || activeItem);
      event.preventDefault();
      return;

    case 'ArrowRight':
      if (!onTree || !hasItem)
        return;
      return;

    case 'ArrowLeft':
      if (!onTree || !hasItem)
        return;
      return;

    case 'PageUp':
      if (!onTree || !hasItem)
        return;
      for (let i = 0, maxi = getRowsCount(); i < maxi; i++) {
        walker.previousNode()
      }
      setActive(walker.currentNode || activeItem);
      event.preventDefault();
      return;

    case 'PageDown':
      if (!onTree || !hasItem)
        return;
      for (let i = 0, maxi = getRowsCount(); i < maxi; i++) {
        walker.nextNode()
      }
      setActive(walker.currentNode || activeItem);
      event.preventDefault();
      return;

    case 'Home':
      if (!onTree || !hasItem)
        return;
      while (walker.previousNode()) {
      }
      setActive(walker.currentNode || activeItem);
      event.preventDefault();
      return;

    case 'End':
      if (!onTree || !hasItem)
        return;
      while (walker.nextNode()) {
      }
      setActive(walker.currentNode || activeItem);
      event.preventDefault();
      return;

    case 'Tab':
      if (!onTree)
        Bookmarks.setActive(mRoot.firstChild);
      return;

    case 'Enter':
      if (!onTree || !hasItem)
        return;
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
        const collapsed = node.closest('li.collapsed');
        if (!collapsed || collapsed == node)
          return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    },
    false
  );
}

function getRowsCount() {
  return Math.floor(mRoot.getBoundingClientRect().height / mRoot.firstChild.firstChild.getBoundingClientRect().height) - 1;
}
