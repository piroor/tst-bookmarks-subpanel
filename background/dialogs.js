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

import RichConfirm from '/extlib/RichConfirm.js';

export async function warnOnOpenTabs(count) {
  if (!configs.warnOnOpen ||
      count < configs.maxOpenBeforeWarn)
    return true;

  const brandName = await browser.runtime.sendMessage({
    type: Constants.COMMAND_GET_BROWSER_NAME
  });
  const result = await RichConfirm.showInPopup({
    modal:   true,
    type:    'common-dialog',
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
      if (!result.checked)
        configs.warnOnOpen = false;
      return true;
    default:
      return false;
  }
}

function sanitizeForHTMLText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function showBookmarkDialog(params) {
  // Don't use "__MSG_XXX__" way because they can be modified by RichConfirm.js itself automatically.
  const urlField = `
        <div style="display: flex;
                    flex-direction: column;"
            ><label accesskey=${JSON.stringify(browser.i18n.getMessage('bookmarkDialog_url_accessKey'))}
                    style="display: flex;
                           flex-direction: row;"
                   ><span>${sanitizeForHTMLText(browser.i18n.getMessage('bookmarkDialog_url'))}</span
                   ><input type="text"
                           name="url"
                           value=${JSON.stringify(params.url)}
                           style="display: flex;
                                  flex-grow: 1;
                                  flex-shrink: 1;
                                  min-width: 20em;"></label></div>
  `.trim();
  try {
    const result = await RichConfirm.showInPopup({
      type: 'dialog',
      content: `
        <div style="display: flex;
                    flex-direction: column;"
            ><label accesskey=${JSON.stringify(browser.i18n.getMessage('bookmarkDialog_title_accessKey'))}
                    style="display: flex;
                           flex-direction: row;"
                   ><span>${sanitizeForHTMLText(browser.i18n.getMessage('bookmarkDialog_title'))}</span
                   ><input type="text"
                           name="title"
                           value=${JSON.stringify(params.title)}
                           style="display: flex;
                                  flex-grow: 1;
                                  flex-shrink: 1;"></label></div
       >${params.type == 'bookmark' ? urlField: ''}
      `.trim(),
      onShown(container) {
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
