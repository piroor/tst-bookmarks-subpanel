/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

const LOADABLE_URL_MATCHER = /^(https?|ftp|moz-extension):/;

let configs = {};


/* buiding bookmarks tree UI */

let mOpenedFolders = new Set();

function buildFolder(folder, options = {}) {
  const item = document.createElement('li');
  item.raw = folder;
  item.level = options.level || 0;
  const row = buildRow(item);
  row.setAttribute('title', folder.title);
  const twisty = row.appendChild(document.createElement('button'));
  twisty.classList.add('twisty');
  const label = row.appendChild(document.createElement('span'));
  label.classList.add('label');
  label.appendChild(document.createTextNode(folder.title));
  label.dataset.id    = folder.id;
  label.dataset.title = folder.title;
  item.classList.add('folder');

  if (mOpenedFolders.has(folder.id)) {
    buildChildren(item);
  }
  else {
    item.classList.add('collapsed');
  }

  return item;
}

function buildRow(item) {
  const row = item.appendChild(document.createElement('a'));
  row.classList.add('row');
  row.style.paddingLeft = `calc(1em * ${item.level + 1})`;
  return row;
}

function buildChildren(folderItem, options = {}) {
  if (folderItem.lastChild.localName == 'ul') {
    if (!options.force)
      return;
    folderItem.removeChild(folderItem.lastChild);
  }
  folderItem.appendChild(document.createElement('ul'));
  buildItems(folderItem.raw.children, folderItem.lastChild, { level: folderItem.level + 1 });
}

function buildBookmark(bookmark, options = {}) {
  const item = document.createElement('li');
  item.raw = bookmark;
  item.level = options.level || 0;
  const row = buildRow(item);
  const label = row.appendChild(document.createElement('span'));
  label.classList.add('label');
  //const icon = label.appendChild(document.createElement('img'));
  //icon.src = bookmark.favIconUrl;
  label.appendChild(document.createTextNode(bookmark.title));
  label.setAttribute('title', `${bookmark.title}\n${bookmark.url}`);
  label.dataset.id    = bookmark.id;
  label.dataset.title = bookmark.title;
  label.dataset.url   = bookmark.url;
  item.classList.add('bookmark');

  if (!LOADABLE_URL_MATCHER.test(bookmark.url))
    item.classList.add('unavailable');

  return item;
}

function buildSeparator(separator, options = {}) {
  const item = document.createElement('li');
  item.raw = separator;
  item.level = options.level || 0;
  const row = buildRow(item);
  row.classList.add('separator');
  return item;
}

function buildItems(items, container, options = {}) {
  const level = options.level || 0;
  for (const item of items) {
    switch (item.type) {
      case 'folder':
        container.appendChild(buildFolder(item, { level }));
        break;

      case 'bookmark':
        container.appendChild(buildBookmark(item, { level }));
        break;

      case 'separator':
        container.appendChild(buildSeparator(item, { level }));
        break;
    }
  }
}

function updateFolderOpenState(item) {
  if (item.classList.contains('collapsed'))
    mOpenedFolders.delete(item.raw.id);
  else
    mOpenedFolders.add(item.raw.id);
  browser.runtime.sendMessage({
    type:   Constants.COMMAND_SET_CONFIGS,
    values: {
      openedFolders: Array.from(mOpenedFolders)
    }
  });
  if (!item.classList.contains('collapsed') &&
      item.lastChild.localName != 'ul') {
    buildChildren(item);
  }
}


/* initializing */

let mInitiaized = false;

async function init() {
  if (mInitiaized)
    return;
  try {
    const [rootItems] = await Promise.all([
      browser.runtime.sendMessage({
        type: Constants.COMMAND_GET_ALL
      }),
      (async () => {
        configs = await browser.runtime.sendMessage({
          type: Constants.COMMAND_GET_CONFIGS,
          keys: [
            'openedFolders',
            'openInTabAlways',
            'scrollPosition',
            'openAsActiveTab'
          ]
        });
      })()
    ]);
    mOpenedFolders = new Set(configs.openedFolders);
    buildItems(rootItems[0].children, document.getElementById('root'));
    window.scrollTo(0, configs.scrollPosition);
    mInitiaized = true;
  }
  catch(_error) {
  }
}

init();


/* event handling */

function clearActive() {
  for (const node of document.querySelectorAll('.active')) {
    node.classList.remove('active');
  }
}

function getItemFromEvent(event) {
  let target = event.target;
  if (target.nodeType != Node.ELEMENT_NODE)
    target = target.parentNode;
  const row = target && target.closest('.row');
  return row && row.parentNode;
}

let mLastMouseDownTarget = null;

window.addEventListener('mousedown', event => {
  const item = getItemFromEvent(event);
  if (!item)
    return;

  mLastMouseDownTarget = item.raw.id;

  clearActive();
  item.firstChild.classList.add('active');
  item.firstChild.focus();

  // We need to cancel mousedown to block the "auto scroll" behavior
  // of Firefox itself.
  event.stopPropagation();
  event.preventDefault();

  if (event.button == 2 ||
      (event.button == 0 &&
       event.ctrlKey)) {
    browser.runtime.sendMessage(Constants.TST_ID, {
      type:       'set-override-context',
      context:    'bookmark',
      bookmarkId: item.raw.id
    });
    return;
  }
}, { capture: true });

// We need to handle mouseup instead of click to bypass the "auto scroll"
// behavior of Firefox itself.
window.addEventListener('mouseup', event => {
  const item = getItemFromEvent(event);
  if (!item)
    return;

  if (mLastMouseDownTarget != item.raw.id) {
    mLastMouseDownTarget = null;
    return;
  }

  mLastMouseDownTarget = null;

  const accel = event.ctrlKey || event.metaKey || event.button == 1;

  if (item.classList.contains('folder')) {
    if (accel) {
      const urls = item.raw.children.map(item => item.url).filter(url => url && LOADABLE_URL_MATCHER.test(url));
      browser.runtime.sendMessage({
        type: Constants.COMMAND_OPEN,
        urls
      });
    }
    else {
      item.classList.toggle('collapsed');
      updateFolderOpenState(item);
    }
    return;
  }

  if (item.classList.contains('bookmark') &&
      !item.classList.contains('unavailable')) {
    if (configs.openInTabAlways == accel)
      browser.runtime.sendMessage({
        type: Constants.COMMAND_LOAD,
        url:  item.raw.url
      });
    else
      browser.runtime.sendMessage({
        type:       Constants.COMMAND_OPEN,
        urls:       [item.raw.url],
        background: configs.openAsActiveTab ? event.shiftKey : !event.shiftKey
      });
    return;
  }
});

window.addEventListener('scroll', () => {
  browser.runtime.sendMessage({
    type:   Constants.COMMAND_SET_CONFIGS,
    values: {
      scrollPosition: window.scrollY
    }
  });
});

browser.runtime.onMessage.addListener((message, _sender) => {
  switch (message.type) {
    case Constants.NOTIFY_READY:
      init();
      break
  }
});
