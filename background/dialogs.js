/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  configs,
} from '/common/common.js';

import * as Constants from '/common/constants.js';

import RichConfirm from '/extlib/RichConfirm.js';
import BookmarkProperty from '/resources/dialog/BookmarkProperty.js';

RichConfirm.init('/extlib/RichConfirmDialog.html');

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
    checked:      true
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

export async function showBookmarkDialog(params) {
  try {
    const result = await BookmarkProperty.showInPopup({
      bookmarkItemType: params.type,
      mode:             params.mode,
      values:           {
        title: params.title,
        url:   params.url,
      },
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
