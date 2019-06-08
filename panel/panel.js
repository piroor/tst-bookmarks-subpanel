/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

function buildFolder(folder) {
  const item = document.createElement('li');
  item.appendChild(document.createTextNode(folder.title));
  item.setAttribute('title', folder.title);
  item.dataset.id    = folder.id;
  item.dataset.title = folder.title;
  item.classList.add('folder');
  item.appendChild(document.createElement('ul'));
  return item;
}

function buildBookmark(bookmark) {
  const item = document.createElement('li');
  //const link = item.appendChild(document.createElement('a'));
  item.appendChild(document.createTextNode(bookmark.title));
  //link.setAttribute('href', bookmark.url);
  //link.setAttribute('target', '_blank');
  item.setAttribute('title', bookmark.title);
  item.dataset.id    = bookmark.id;
  item.dataset.title = bookmark.title;
  item.dataset.url   = bookmark.url;
  item.classList.add('bookmark');
  return item;
}

function buildSeparator(separator) {
  const item = document.createElement('li');
  item.classList.add('separator');
  return item;
}

function buildItems(items, container) {
  for (const item of items) {
    switch (item.type) {
      case 'folder':
        const folderItem = buildFolder(item);
        container.appendChild(folderItem);
        if (item.children.length > 0)
          buildItems(item.children, folderItem.lastChild);
        break;

      case 'bookmark':
        container.appendChild(buildBookmark(item));
        break;

      case 'separator':
        container.appendChild(buildSeparator(item));
        break;
    }
  }
  const firstFolderItem = container.querySelector('.folder');
  if (firstFolderItem && firstFolderItem.previousSibling) {
    const separator = container.insertBefore(document.createElement('li'), firstFolderItem);
    separator.classList.add('separator');
  }
}

browser.runtime.sendMessage({ type: 'get-all' }).then(rootItems => {
  buildItems(rootItems[0].children, document.getElementById('root'));
});

document.addEventListener('mousedown', event => {
  if (!event.target.dataset ||
      !event.target.dataset.id)
    return;

  if (event.button == 2 ||
      (event.button == 0 &&
       event.ctrlKey)) {
    browser.runtime.sendMessage('treestyletab@piro.sakura.ne.jp', {
      type:       'try-override-context',
      context:    'bookmark',
      bookmarkId: event.target.dataset.id
    });
    event.stopPropagation();
    event.preventDefault();
    return;
  }
}, { capture: true });
