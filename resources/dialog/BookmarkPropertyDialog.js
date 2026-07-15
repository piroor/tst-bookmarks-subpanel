/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import RichConfirmDialog from '/extlib/RichConfirmDialog.js';

import {
  isRTL,
} from '/common/common.js';

function sanitizeForHTMLText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

class BookmarkPropertyDialog extends RichConfirmDialog {
  constructor(params) {
    super(params);

    this.params.buttons = [
      browser.i18n.getMessage(`bookmarkDialog_${params.mode}`),
      browser.i18n.getMessage('bookmarkDialog_cancel')
    ];
    this.params.type  = 'dialog'; // for popup
  }

  async onShown(container) {
    if (this.params.simulation)
      return;

    container.classList.add('bookmark-dialog');
    container.querySelector('[name="title"]').select();
  }

  async updateContent() {
    // Don't use "__MSG_XXX__" way because they can be modified by RichConfirm.js itself automatically.
    const direction = isRTL() ? 'direction: rtl;' : '';
    const urlField = `
          <div style="display: flex;
                      flex-direction: column;
                      ${direction}"
              ><label accesskey=${JSON.stringify(browser.i18n.getMessage('bookmarkDialog_url_accessKey'))}
                      style="display: flex;
                             flex-direction: row;"
                     ><span>${sanitizeForHTMLText(browser.i18n.getMessage('bookmarkDialog_url'))}</span
                     ><input type="text"
                             name="url"
                             style="display: flex;
                                    flex-grow: 1;
                                    flex-shrink: 1;
                                    min-width: 20em;"></label></div>
    `.trim();
    this.content.insertAdjacentHTML('beforeend', `
        <div style="display: flex;
                    flex-direction: column;
                    ${direction}"
            ><label accesskey=${JSON.stringify(browser.i18n.getMessage('bookmarkDialog_title_accessKey'))}
                    style="display: flex;
                           flex-direction: row;"
                   ><span>${sanitizeForHTMLText(browser.i18n.getMessage('bookmarkDialog_title'))}</span
                   ><input type="text"
                           name="title"
                           style="display: flex;
                                  flex-grow: 1;
                                  flex-shrink: 1;"></label></div
       >${this.params.bookmarkItemType == 'bookmark' ? urlField : ''}
    `.trim());
    for (const element of this.content.querySelectorAll('[accesskey]')) {
      this.updateAccessKey(element);
    }
  }
};

window.BookmarkPropertyDialog = BookmarkPropertyDialog;
window.RICH_CONFIRM_DIALOG_CLASS_NAME = 'BookmarkPropertyDialog';

export default BookmarkPropertyDialog;
