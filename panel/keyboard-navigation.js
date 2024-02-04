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
const mContent = document.getElementById('content');
const mRowsContainer = document.getElementById('rows');

const configs = Connection.getConfigs([
  'openInTabAlways',
  'openAsActiveTab'
]);

document.addEventListener('keydown', onKeyDown);

function onKeyDown(event) {
  if (event.isComposing)
    return;

  const target = EventUtils.getElementTarget(event);
  const onSearchBox = target.closest('#searchbar');
  const onTree = !target.closest('#searchbar');
  const hasItem = mRowsContainer.hasChildNodes();
  const activeItem = Bookmarks.getActive();
  const accel = event.ctrlKey || event.metaKey || event.button == 1;

  switch (event.key) {
    case 'ArrowUp':
      if (!onTree || !hasItem || accel)
        return;
      setActive(Bookmarks.getPrevious(activeItem) || activeItem, { multiselect: event.shiftKey });
      event.preventDefault();
      return;

    case 'ArrowDown':
      if (!onTree || !hasItem || accel)
        return;
      setActive(Bookmarks.getNext(activeItem) || activeItem, { multiselect: event.shiftKey });
      event.preventDefault();
      return;

    case 'ArrowRight':
      if (!onTree || !hasItem || !activeItem)
        return;
      if (Bookmarks.isFolderCollapsed(activeItem))
        Bookmarks.toggleOpenState(activeItem);
      else
        setActive(activeItem.children && activeItem.children[0] || activeItem);
      event.preventDefault();
      return;

    case 'ArrowLeft':
      if (!onTree || !hasItem || !activeItem)
        return;
      if (Bookmarks.isFolderOpen(activeItem))
        Bookmarks.toggleOpenState(activeItem);
      else
        setActive(Bookmarks.getParent(activeItem) || activeItem);
      event.preventDefault();
      return;

    case 'PageUp': {
      if (!onTree || !hasItem || accel)
        return;
      let currentItem = activeItem;
      for (let i = 0, maxi = getRowsCount(); i < maxi; i++) {
        const previousItem = Bookmarks.getPrevious(currentItem);
        if (!previousItem)
          break;
        currentItem = previousItem;
      }
      setActive(currentItem || activeItem, {
        multiselect: event.shiftKey,
        jumped:      true
      });
      event.preventDefault();
    } return;

    case 'PageDown':
      if (!onTree || !hasItem || accel)
        return;
      let currentItem = activeItem;
      for (let i = 0, maxi = getRowsCount(); i < maxi; i++) {
        const nextItem = Bookmarks.getNext(currentItem);
        if (!nextItem)
          break;
        currentItem = nextItem;
      }
      setActive(currentItem || activeItem, {
        multiselect: event.shiftKey,
        jumped:      true
      });
      event.preventDefault();
      return;

    case 'Home':
      if (!onTree || !hasItem || accel)
        return;
      setActive(Bookmarks.getFirst() || activeItem, {
        multiselect: event.shiftKey,
        jumped:      true
      });
      event.preventDefault();
      return;

    case 'End':
      if (!onTree || !hasItem || accel)
        return;
      setActive(Bookmarks.getLast() || activeItem, {
        multiselect: event.shiftKey,
        jumped:      true
      });
      event.preventDefault();
      return;

    case 'Tab':
      if (event.shiftKey) {
        if (event.target == document.documentElement ||
            event.target == mRowsContainer ||
            event.target == mSearchBox) {
          return;
        }
        else {
          mSearchBox.focus();
          event.preventDefault();
        }
      }
      if (onSearchBox) {
        setActive(activeItem || Bookmarks.getFirst(), { multiselect: true });
        event.preventDefault();
      }
      return;

    case 'Enter':
      if (!onTree ||
          onSearchBox ||
          !activeItem ||
          activeItem.type == 'separator')
        return;
      if (activeItem.type == 'folder') {
        Bookmarks.toggleOpenState(activeItem);
        event.preventDefault();
        return;
      }
      if (event.shiftKey)
        Connection.sendMessage({
          type:     Constants.COMMAND_OPEN_BOOKMARKS,
          urls:     [activeItem.url],
          inWindow: true
        });
      else if (!configs.openInTabAlways)
        Connection.sendMessage({
          type: Constants.COMMAND_LOAD_BOOKMARK,
          url:  activeItem.url
        });
      else
        Connection.sendMessage({
          type:       Constants.COMMAND_OPEN_BOOKMARKS,
          urls:       [activeItem.url],
          background: !configs.openAsActiveTab
        });
      event.preventDefault();
      return;
  }
}

let mFirstMultiselectId = null;

function setActive(activeItem, options = {}) {
  if (!activeItem)
    return;

  const lastActiveItem = Bookmarks.getActive() || activeItem;

  Bookmarks.setActive(activeItem);
  /*
  activeItem.firstChild.scrollIntoView({
    behavior: 'smooth',
    block:    'nearest',
    inline:   'nearest'
  });
  */

  if (!options.multiselect) {
    Bookmarks.clearMultiselected();
    mFirstMultiselectId = null;
    return;
  }

  let firstItem = Bookmarks.getById(mFirstMultiselectId);
  const lastItem = activeItem;

  const firstItemIndex = Bookmarks.indexOf(firstItem || lastActiveItem);
  const lastItemIndex = Bookmarks.indexOf(lastItem);
  const isBottomToTop = (firstItem != lastItem) && (lastItemIndex < firstItemIndex);

  if (firstItem != lastItem) {
    // When there is any unhighlighted item between highlighted items (they may
    // be produced with expansion of a highlighted folder), we should restart
    // multiselection from most nearest highlighted item.
    let current = options.jumped ? lastActiveItem : lastItem;
    while (true) {
      current = isBottomToTop ? Bookmarks.getNext(current) : Bookmarks.getPrevious(current);
      if (!current ||
          current == lastItem ||
          !Bookmarks.isMultiselected(current))
        break;
    }
    const currentIndex = Bookmarks.indexOf(current);
    if (current != firstItem &&
        (!firstItem ||
         (isBottomToTop ?
           currentIndex > firstItemIndex :
           currentIndex < firstItemIndex))) {
      firstItem = current;
      mFirstMultiselectId = current.fullId;
    }
  }

  const toBeUnselected = new Set(Bookmarks.getMultiselected());
  toBeUnselected.delete(firstItem);
  Bookmarks.addMultiselected(firstItem);

  if (firstItem != lastItem) {
    toBeUnselected.delete(lastItem);
    Bookmarks.addMultiselected(lastItem);
    let current = firstItem;
    while (true) {
      current = isBottomToTop ? Bookmarks.getPrevious(current) : Bookmarks.getNext(current);
      if (!current ||
          current == lastItem)
        break;
      Bookmarks.addMultiselected(current);
      toBeUnselected.delete(current);
    }
  }

  for (const item of toBeUnselected) {
    Bookmarks.removeMultiselected(item);
  }
}

function getRowsCount() {
  return Math.floor(mContent.getBoundingClientRect().height / Bookmarks.getRowHeight()) - 1;
}
