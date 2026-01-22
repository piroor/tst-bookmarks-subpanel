/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import Configs from '/extlib/Configs.js';

const RTL_LANGUAGES = new Set([
  'ar',
  'he',
  'fa',
  'ur',
  'ps',
  'sd',
  'ckb',
  'prs',
  'rhg',
]);

export function isRTL() {
  const lang = (
    navigator.language ||
    navigator.userLanguage ||
    //(new Intl.DateTimeFormat()).resolvedOptions().locale ||
    ''
  ).split('-')[0];
  return RTL_LANGUAGES.has(lang);
}

export const configs = new Configs({
  openInTabAlways: false,
  openAsActiveTab: true,

  warnOnOpen:        true,
  maxOpenBeforeWarn: 15,

  showScrollbarLeft: false,

  autoExpandDelay: 1000,

  scrollPosition: 0,
  openedFolders:  [],
  rtl:            isRTL(),

  debug: false,
}, {
  localKeys: [
    'openedFolders',
    'rtl',
    'debug',
  ]
});
