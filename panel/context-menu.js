/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

import MenuUI from '/extlib/MenuUI.js';

const mRoot = document.getElementById('context-menu');
let mUI;

export async function init() {
  const items = await browser.runtime.sendMessage({
    type: Constants.COMMAND_GET_MENU_ITEMS
  });

  for (const item of items) {
    const node = document.createElement('li');
    if (item.title)
      node.textContent = item.title;
    mRoot.appendChild(node);
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

function onShown() {
}

window.addEventListener('contextmenu', async event => {
  let target = event.target;
  if (!(target instanceof Element))
    target = target.parentNode;
  if (target.closest('input, textarea'))
    return;

  event.stopPropagation();
  event.preventDefault();
  await onShown();
  await new Promise(resolve => setTimeout(resolve, 25));
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
