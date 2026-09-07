/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from '/common/constants.js';

export async function load(url) {
  if (!Constants.LOADABLE_URL_MATCHER.test(url))
    return null;
  const window    = await browser.windows.getCurrent({ populate: true });
  const activeTab = window.tabs.find(tab => tab.active);
  return browser.tabs.update(activeTab.id, {
    url
  });
}

export async function openInTabs(urls, options = {}) {
  urls = urls.filter(url => Constants.LOADABLE_URL_MATCHER.test(url));
  if (urls.length == 0)
    return [];
  const window = await browser.windows.getCurrent({ populate: true });
  let index   = window.tabs.length;
  let isFirst = true;
  const tabs = [];
  for (const url of urls) {
    tabs.push(await browser.tabs.create({
      active: !options.background && isFirst,
      url,
      index
    }));
    isFirst = false;
    index++;
  }
  return tabs;
}

export async function openInWindow(urls, options = {}) {
  if (!Array.isArray(urls))
    urls = [urls];
  urls = urls.filter(url => Constants.LOADABLE_URL_MATCHER.test(url));
  if (urls.length == 0)
    return null;
  const window = await browser.windows.create({
    url:       urls[0],
    incognito: !!options.incognito
  });
  if (urls.length > 1)
    for (let i = 1, maxi = urls.length; i < maxi; i++) {
      await browser.tabs.create({
        windowId: window.id,
        url:      urls[i],
        index:    i,
        active:   false
      });
    }
  return window;
}

export async function getBookmarkUrls(id, { recursively = true } = {}) {
  const item = await getOne(id);
  if (!item)
    return [];
  return collectBookmarkUrls(item, { recursively });
}

async function collectBookmarkUrls(item, { recursively } = {}) {
  if (item.type == 'bookmark')
    return Constants.LOADABLE_URL_MATCHER.test(item.url) ? [item.url] : [];
  if (item.type != 'folder')
    return [];

  const children = await browser.bookmarks.getChildren(item.id);
  const urls = [];
  for (const child of children) {
    if (child.type == 'bookmark') {
      if (Constants.LOADABLE_URL_MATCHER.test(child.url))
        urls.push(child.url);
    }
    else if (recursively && child.type == 'folder') {
      urls.push(...await collectBookmarkUrls(child, { recursively }));
    }
  }
  return urls;
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

export async function createMany(items = []) {
  const created = [];
  for (const params of items) {
    created.push(await create(params));
  }
  return created;
}

export async function update(id, params = {}) {
  const bookmark = await getOne(id);
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
    await copyOne(original, destination);
    if (typeof destination.index == 'number')
      destination.index++;
  }
}
async function copyOne(original, destination) {
  if (typeof original == 'string') {
    original = await getOne(original);
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
      await copy(child, {
        parentId: created.id,
        index
      });
      index++;
    }
  }
}

async function getOne(id) {
  const items = await browser.bookmarks.get(id);
  return Array.isArray(items) ? items[0] : items;
}
