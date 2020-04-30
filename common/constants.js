/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

export const TST_ID = 'treestyletab@piro.sakura.ne.jp';

export const COMMAND_GET_CONFIGS = 'get-configs';
export const COMMAND_SET_CONFIGS = 'set-configs';
export const NOTIFY_UPDATED_CONFIGS = 'configs-updated';
export const COMMAND_GET_BROWSER_NAME = 'get-browser-name';
export const COMMAND_GET_CURRENT_WINDOW_ID = 'get-current-window-id';
export const COMMAND_UPDATE_DRAG_DATA = 'update-drag-data';

export const COMMAND_GET_ALL_BOOKMARKS = 'get-all-bookmarks';
export const COMMAND_GET_ROOT          = 'get-root';
export const COMMAND_GET_CHILDREN      = 'get-children';
export const COMMAND_SEARCH_BOOKMARKS  = 'search-bookmarks';
export const COMMAND_OPEN_BOOKMARKS    = 'open-bookmarks';
export const COMMAND_LOAD_BOOKMARK     = 'load-bookmark';
export const COMMAND_CREATE_BOOKMARK   = 'create-bookmark';
export const COMMAND_MOVE_BOOKMARK     = 'move-bookmark';
export const COMMAND_COPY_BOOKMARK     = 'copy-bookmark';

export const COMMAND_CONFIRM_TO_OPEN_TABS = 'confirm-to-open-tabs';

export const NOTIFY_BOOKMARK_CREATED = 'bookmark-created';
export const NOTIFY_BOOKMARK_REMOVED = 'bookmark-removed';
export const NOTIFY_BOOKMARK_MOVED   = 'bookmark-moved';
export const NOTIFY_BOOKMARK_CHANGED = 'bookmark-changed';

export const LOADABLE_URL_MATCHER = /^(https?|ftp|moz-extension):/;

export const ROOT_ID = 'root________';
export const ROOT_ITEMS = [
  'toolbar_____',
  'menu________',
  'unfiled_____',
  'mobile______'
];

export const UNMODIFIABLE_ITEMS = new Set([
  ROOT_ID,
  ...ROOT_ITEMS
]);
