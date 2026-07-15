/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import RichConfirm from '/extlib/RichConfirm.js';

class BookmarkProperty extends RichConfirm {
}
BookmarkProperty.Dialog = null;
BookmarkProperty.init('/resources/dialog/BookmarkPropertyDialog.html');

export default BookmarkProperty;
