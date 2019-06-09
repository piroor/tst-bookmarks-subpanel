/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  configs
} from '/common/common.js';

import * as Constants from '/common/constants.js';

async function registerToTST() {
  try {
    let result = await browser.runtime.sendMessage(Constants.TST_ID, {
      type: 'register-self',
      name: browser.i18n.getMessage('extensionName'),
      icons: browser.runtime.getManifest().icons,
      subPanel: {
        title: 'Bookmarks',
        url:   `moz-extension://${location.host}/panel/panel.html`
      }
    });
  }
  catch(_error) {
    // TST is not available
  }
}

browser.runtime.onMessageExternal.addListener((message, sender) => {
  switch (sender.id) {
    case Constants.TST_ID:
      switch (message.type) {
        case 'ready':
          registerToTST();
          break;
      }
      break;
  }
});

registerToTST();


function onMessage(message, _sender) {
  switch (message.type) {
    case Constants.COMMAND_SET_CONFIG:
      configs[message.key] = message.value;
    case Constants.COMMAND_GET_CONFIG:
      return Promise.resolve(configs[message.key]);

    case Constants.COMMAND_GET_ALL:
      return browser.bookmarks.getTree();

    case Constants.COMMAND_OPEN:
      (async () => {
        const window = await browser.windows.getCurrent({ populate: true });
        let index   = window.tabs.length;
        let isFirst = true;
        for (const url of message.urls) {
          browser.tabs.create({
            active: !message.background && isFirst,
            url,
            index
          });
          isFirst = false;
          index++;
        }
      })();
      break;
  }
}

configs.$loaded.then(() => {
  browser.runtime.onMessage.addListener(onMessage);
  browser.runtime.sendMessage({
    type: Constants.NOTIFY_READY
  });
});
