/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

import MenuUI from '/extlib/MenuUI.js';
import RichConfirm from '/extlib/RichConfirm.js';
import l10n from '/extlib/l10n.js';

import * as EventUtils from './event-utils.js';
import * as Connection from './connection.js';

const mRoot = document.getElementById('context-menu');
let mUI;

const mItemsById = {};
let mContextItem;

export async function init() {
  const items = await browser.runtime.sendMessage({
    type: Constants.COMMAND_GET_MENU_ITEMS
  });

  for (const item of items) {
    const node = document.createElement('li');
    if (item.title)
      node.textContent = item.title;
    node.dataset.command = item.id;
    node.classList.add(item.type);
    mRoot.appendChild(node);
    item.node = node;
    mItemsById[item.id] = item;
  }

  mUI = new MenuUI({
    root: mRoot,
    onCommand,
    //onShown,
    //onHidden,
    appearance:        'menu',
    animationDuration: 150, // configs.collapseDuration,
    subMenuOpenDelay:  300, // configs.subMenuOpenDelay,
    subMenuCloseDelay: 300  // configs.subMenuCloseDelay
  });
}

function onCommand(target, _event) {
  const menuItemId = target && target.dataset.command;
  const bookmarkId = mContextItem && mContextItem.id;

  const destination = {};
  if (mContextItem) {
    destination.parentId = mContextItem.type == 'folder' ? mContextItem.id : mContextItem.parentId;
    if (mContextItem.type != 'folder')
      destination.index = mContextItem.index;
  }

  switch (menuItemId) {
    case 'createBookmark':
      showBookmarkDialog({
        mode:  'add',
        type:  'bookmark',
        title: browser.i18n.getMessage('defaultBookmarkTitle'),
        url:   ''
      }).then(details => {
        if (!details)
          return;
        Connection.sendMessage({
          type:    Constants.COMMAND_CREATE_BOOKMARK,
          details: Object.assign({
            type:  'bookmark'
          }, details, destination)
        });
      });
      break;

    case 'createFolder':
      showBookmarkDialog({
        mode:  'add',
        type:  'folder',
        title: browser.i18n.getMessage('defaultFolderTitle')
      }).then(details => {
        if (!details)
          return;
        Connection.sendMessage({
          type:    Constants.COMMAND_CREATE_BOOKMARK,
          details: Object.assign({
            type:  'folder'
          }, details, destination)
        });
      });
      break;

    case 'properties':
      showBookmarkDialog({
        mode:  'save',
        type:  mContextItem.type,
        title: mContextItem.title,
        url:   mContextItem.url
      }).then(details => {
        if (!details)
          return;
        Connection.sendMessage({
          type:    Constants.COMMAND_UPDATE_BOOKMARK,
          id:      bookmarkId,
          changes: details
        });
      });
      break;

    default:
      Connection.sendMessage({
        type: Constants.NOTIFY_MENU_CLICKED,
        menuItemId,
        bookmarkId
      });
      break;
  }
  close();
}

async function onShown(contextItem) {
  return browser.runtime.sendMessage({
    type: Constants.NOTIFY_MENU_SHOWN,
    contextItem
  });
}

window.addEventListener('contextmenu', async event => {
  const target = EventUtils.getElementTarget(event);
  if (target && target.closest('input, textarea'))
    return;

  const item = EventUtils.getItemFromEvent(event);
  mContextItem = item && item.raw;

  event.stopPropagation();
  event.preventDefault();
  const updatedItems = await onShown(item && item.raw);
  for (const updatedItem of updatedItems) {
    const item = mItemsById[updatedItem.id];
    if ('visible' in updatedItem) {
      item.visible = updatedItem.visible;
      item.node.style.display = item.visible ? 'block' : 'none';
    }
    if ('enabled' in updatedItem) {
      item.enabled = updatedItem.enabled;
      if (item.node.classList.contains('disabled') == item.enabled)
        item.node.classList.toggle('disabled');
    }
  }
  await open({
    left: event.clientX,
    top:  event.clientY
  });
}, { useCapture: true });

async function open(options = {}) {
  await close();
  await mUI.open(options);
}

async function close() {
  await mUI.close();
}


async function showBookmarkDialog(params) {
  const urlField = `
        <div><label>__MSG_bookmarkDialog_url__
                    <input type="text"
                           name="url"
                           value=${JSON.stringify(params.url)}></label></div>
  `;
  try {
    const result = await RichConfirm.show({
      content: `
        <div><label>__MSG_bookmarkDialog_title__
                    <input type="text"
                           name="title"
                           value=${JSON.stringify(params.title)}></label></div>
        ${params.type == 'bookmark' ? urlField: ''}
      `,
      onShown(container) {
        l10n.updateDocument();
        container.classList.add('bookmark-dialog');
      },
      buttons: [
        browser.i18n.getMessage(`bookmarkDialog_${params.mode}`),
        browser.i18n.getMessage('bookmarkDialog_cancel')
      ]
    });
    if (result.buttonIndex != 0)
      return null;
    return {
      title: result.values.title,
      url:   result.values.url
    };
  }
  catch(_error) {
    return null;
  }
}
