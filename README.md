# tst-bookmarks-subpanel

[![Build Status](https://travis-ci.org/piroor/tst-bookmarks-subpanel.svg?branch=master)](https://travis-ci.org/piroor/tst-bookmarks-subpanel)

This is a Firefox addon providing the "Bookmarks" subpanel for Tree Style Tab.

## Known restrictions

* Impossible to drag anything from elsewhere to the bookmarks subpanel.
* Impossible to drag bookmarks from the bookmarks subpanel to TST's sidebar.
* Impossible to open native context menu directly on macOS directly. You always need to do Control-click twice. This is due to a restriction of WebExtensions API.
* All bookmarks are shown with same icon. This is due to a restriction of WebExtensions API.
