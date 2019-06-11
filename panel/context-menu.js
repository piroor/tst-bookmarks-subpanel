/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

import MenuUI from '/extlib/MenuUI.js';

import * as EventUtils from './event-utils.js';

const mRoot = document.getElementById('context-menu');
let mUI;

const mItemsById = {};


export async function init() {
  const items = await browser.runtime.sendMessage({
    type: Constants.COMMAND_GET_MENU_ITEMS
  });

  for (const item of items) {
    const node = document.createElement('li');
    if (item.title)
      node.textContent = item.title;
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

function onCommand() {
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

  event.stopPropagation();
  event.preventDefault();
  const updatedItems = await onShown(item && item.raw);
  for (const updatedItem of updatedItems) {
    const item = mItemsById[updatedItem.id];
    if ('visible' in updatedItem) {
      item.visible = updatedItem.visible;
      item.node.style.display = item.visible ? 'block' : 'none';
      console.log(item.id, item.node.style.display);
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
