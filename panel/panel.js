/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

function buildFolder(folder) {
  const item = document.createElement('li');
  const row = item.appendChild(document.createElement('span'));
  row.classList.add('row');
  row.setAttribute('title', folder.title);
  const twisty = row.appendChild(document.createElement('button'));
  twisty.classList.add('twisty');
  const label = row.appendChild(document.createElement('span'));
  label.classList.add('item-label');
  label.appendChild(document.createTextNode(folder.title));
  label.dataset.id    = folder.id;
  label.dataset.title = folder.title;
  item.classList.add('folder');
  item.appendChild(document.createElement('ul'));
  return item;
}

function buildBookmark(bookmark) {
  const item = document.createElement('li');
  const row = item.appendChild(document.createElement('span'));
  row.classList.add('row');
  const label = row.appendChild(document.createElement('span'));
  label.classList.add('item-label');
  //const icon = label.appendChild(document.createElement('img'));
  //icon.src = bookmark.favIconUrl;
  label.appendChild(document.createTextNode(bookmark.title));
  label.setAttribute('title', `${bookmark.title}\n${bookmark.url}`);
  label.dataset.id    = bookmark.id;
  label.dataset.title = bookmark.title;
  label.dataset.url   = bookmark.url;
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

window.addEventListener('mousedown', event => {
  let target = event.target;
  if (target.nodeType != Node.ELEMENT_NODE)
    target = target.parentNode;
  target = target && target.closest('.item-label');
  if (!target ||
      !target.dataset ||
      !target.dataset.id)
    return;

  if (event.button == 2 ||
      (event.button == 0 &&
       event.ctrlKey)) {
    browser.runtime.sendMessage('treestyletab@piro.sakura.ne.jp', {
      type:       'set-override-context',
      context:    'bookmark',
      bookmarkId: target.dataset.id
    });
    return;
  }
}, { capture: true });
