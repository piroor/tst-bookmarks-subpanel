/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

import RichConfirm from '/extlib/RichConfirm.js';
import l10n from '/extlib/l10n.js';

import * as Connection from './connection.js';

const configs = Connection.getConfigs([
  'warnOnOpen',
  'maxOpenBeforeWarn'
]);

export async function warnOnOpenTabs(count) {
  if (!configs.warnOnOpen ||
      count < configs.maxOpenBeforeWarn)
    return true;

  const brandName = await browser.runtime.sendMessage({
    type: Constants.COMMAND_GET_BROWSER_NAME
  });
  const result = await RichConfirm.show({
    message: browser.i18n.getMessage('tabs_openWarningMultipleBrande', [count, brandName]),
    buttons: [
      browser.i18n.getMessage('tabs_openButtonMultiple'),
      browser.i18n.getMessage('tabs_openWarningMultiple_cancel')
    ],
    checkMessage: browser.i18n.getMessage('tabs_openWarningPromptMeBranded', [brandName]),
    checked: true
  });
  switch (result.buttonIndex) {
    case 0:
      if (!result.checked) {
        Connection.sendMessage({
          type:   Constants.COMMAND_SET_CONFIGS,
          values: {
            warnOnOpen: false
          }
        });
      }
      return true;
    default:
      return false;
  }
}

export async function showBookmarkDialog(params) {
  const urlField = `
        <div><label accesskey="__MSG_bookmarkDialog_url_accessKey__"
                   >__MSG_bookmarkDialog_url__
                    <input type="text"
                           name="url"
                           value=${JSON.stringify(params.url)}></label></div>
  `;
  try {
    const result = await RichConfirm.show({
      content: `
        <div><label accesskey="__MSG_bookmarkDialog_title_accessKey__"
                   >__MSG_bookmarkDialog_title__
                    <input type="text"
                           name="title"
                           value=${JSON.stringify(params.title)}></label></div>
        ${params.type == 'bookmark' ? urlField: ''}
      `,
      onShown(container) {
        l10n.updateDocument();
        container.classList.add('bookmark-dialog');
        container.querySelector('[name="title"]').select();
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
