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

export async function openInWindow(urls, options = {}) {
  if (!Array.isArray(urls))
    urls = [urls];
  const window = await browser.windows.create({
    url:       urls[0],
    incognito: !!options.incognito
  });
  if (urls.length > 1)
    for (let i = 1, maxi = urls.length; i < maxi; i++) {
      browser.tabs.create({
        windowId: window.id,
        url:      urls[i],
        index:    i,
        active:   false
      });
    }
}

export async function create(params = {}) {
  const details = {
    title:    params.title,
    type:     params.type || 'bookmark',
    parentId: params.parentId
  };
  if (params.type == 'bookmark' && params.url)
    details.url = params.url;
  if (typeof params.index == 'number')
    details.index = params.index;
  // We cannot create bookmark without URL.
  // See: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/bookmarks/CreateDetails
  if (details.type == 'bookmark' && !details.url)
    details.url = 'about:blank';
  return browser.bookmarks.create(details);
}

export async function update(id, params = {}) {
  const bookmark = await browser.bookmarks.get(id);
  const changes = {
    title: params.title
  };
  if (bookmark.type == 'bookmark' && params.url)
    changes.url = params.url;
  return browser.bookmarks.update(id, changes);
}

export async function copy(originals, destination) {
  if (!Array.isArray(originals))
    originals = [originals];
  for (const original of originals) {
    copyOne(original, destination);
    if (typeof destination.index == 'number')
      destination.index++;
  }
}
async function copyOne(original, destination) {
  if (typeof original == 'string') {
    original = await browser.bookmarks.get(original);
    if (Array.isArray(original))
      original = original[0];
    if (original.type == 'folder')
      original = await browser.bookmarks.getSubTree(original.id);
  }
  if (Array.isArray(original))
    original = original[0];
  const details = {
    type: original.type,
    ...destination
  };
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
