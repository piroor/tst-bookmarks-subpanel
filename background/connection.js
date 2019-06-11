/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import EventListenerManager from '/extlib/EventListenerManager.js';

// runtime.onMessage listeners registered at subpanels won't receive
// any message from this background page, so we need to use connections
// instead, to send messages from this background page to subpanel pages.

const mConnections = new Set();

export const onMessage = new EventListenerManager();

browser.runtime.onConnect.addListener(port => {
  mConnections.add(port);
  port.onMessage.addListener(onOneWayMessage);
  port.onDisconnect.addListener(_message => {
    mConnections.delete(port);
    port.onMessage.removeListener(onOneWayMessage);
  });
});

async function onOneWayMessage(message) {
  onMessage.dispatch(message);
}

export function broadcastMessage(message) {
  for (const connection of mConnections) {
    connection.postMessage(message);
  }
}
