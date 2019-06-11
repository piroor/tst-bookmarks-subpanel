/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

export async function load(url) {
  const window    = await browser.windows.getCurrent({ populate: true });
  const activeTab = window.tabs.find(tab => tab.active);
  browser.tabs.update(activeTab.id, {
    url
  });
}

export async function openInTabs(urls, options = {}) {
  const window = await browser.windows.getCurrent({ populate: true });
  let index   = window.tabs.length;
  let isFirst = true;
  for (const url of urls) {
    browser.tabs.create({
      active: !options.background && isFirst,
      url,
      index
    });
    isFirst = false;
    index++;
  }
}

export function openInWindow(url, options = {}) {
  browser.windows.create({
    url,
    incognito: !!options.incognito
  });
}

export async function create(params = {}) {
  const details = {
    title:    params.title,
    type:     params.type || 'bookmark',
    parentId: params.parentId
  };
  if (params.url)
    details.url = params.url;
  if (params.index >= 0)
    details.index = params.index;
  // We cannot create bookmark without URL.
  // See: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/bookmarks/CreateDetails
  if (details.type == 'bookmark' && !details.url)
    details.url = 'about:blank';
  return browser.bookmarks.create(details);
}

export async function copy(original, destination) {
  if (typeof original == 'string') {
    original = await browser.bookmarks.get(original);
    if (Array.isArray(original))
      original = original[0];
    if (original.type == 'folder')
      original = await browser.bookmarks.getSubTree(original.id);
  }
  if (Array.isArray(original))
    original = original[0];
  const details = Object.assign({
    type: original.type
  }, destination)
  if (original.title)
    details.title = original.title;
  if (original.url)
    details.url = original.url;
  const created = await browser.bookmarks.create(details);
  if (original.children && original.children.length > 0) {
    let index = 0;
    for (const child of original.children) {
      copy(child, {
        parentId: created.id,
        index
      });
      index++;
    }
  }
}
