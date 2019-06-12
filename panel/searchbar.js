/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Bookmarks from './bookmarks.js';

const mSearchBar = document.getElementById('searchbar');
const mSearchBox = document.getElementById('searchbox');
const mClearButton = document.getElementById('searchbox-clear');
const mRoot = document.getElementById('root');

mSearchBox.addEventListener('focus', () => {
  mSearchBar.classList.add('active');
  mRoot.classList.remove('active');
});

mSearchBox.addEventListener('blur', () => {
  mSearchBar.classList.remove('active');
});

let mThrottlingTimer;

function onSearchInput() {
  if (!mSearchBox.value)
    mSearchBar.classList.add('blank');
  else
    mSearchBar.classList.remove('blank');

  if (mThrottlingTimer)
    clearTimeout(mThrottlingTimer);
  mThrottlingTimer = setTimeout(() => {
    mThrottlingTimer = null;
    Bookmarks.search(mSearchBox.value);
  }, 250);
}

mSearchBox.addEventListener('change', onSearchInput);
mSearchBox.addEventListener('input', onSearchInput);

mSearchBox.addEventListener('keydown', event => {
  if (event.key == 'Escape') {
    mSearchBox.value = '';
    onSearchInput();
  }
});


mClearButton.addEventListener('click', () => {
  mSearchBox.value = '';
  onSearchInput();
});
