/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import EventListenerManager from '/extlib/EventListenerManager.js';

let mConnection = null;

export const onMessage = new EventListenerManager();

function init() {
  if (mConnection)
    return;

  try {
    // runtime.onMessage listener registerad at a restricted page (like this
    // subpanel page) won't receive messages from the background page, so
    // we need to use connection instead.
    mConnection = browser.runtime.connect({
      name: `panel:${Date.now()}`
    });
    mConnection.onMessage.addListener(onOneWayMessage);
  }
  catch(_error) {
  }
}
init();

function onOneWayMessage(message) {
  onMessage.dispatch(message);
}

export function sendMessage(message) {
  mConnection.postMessage(message);
}
