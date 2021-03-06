# [TST Bookmarks Subpanel](https://addons.mozilla.org/firefox/addon/tst-bookmarks-subpanel/)

![Build Status](https://github.com/piroor/tst-bookmarks-subpanel/actions/workflows/main.yml/badge.svg?branch=trunk)

A Firefox addon providing the "Bookmarks" subpanel for Tree Style Tab.
This has started mainly for demonstration of [TST's SubPanel API](https://github.com/piroor/treestyletab/wiki/SubPanel-API).

Development builds for each commit are available at "Artifacts" of the CI/CD action:
https://github.com/piroor/tst-bookmarks-subpanel/actions?query=workflow%3ACI%2FCD

## Known restrictions

* Impossible to open non-regular URLs like `about:config`. This is due to a restriction of WebExtensions API.
* Impossible to drag anything from elsewhere to the bookmarks subpanel.
* Impossible to drag bookmarks from the bookmarks subpanel to TST's sidebar.
* Impossible to open native context menu on bookmarks, and extra context menu items added by bookmark related addons are unavailable. This is due to a restriction of WebExtensions API.
* All bookmarks are shown with same icon. [This is due to a restriction of WebExtensions API.](https://bugzilla.mozilla.org/show_bug.cgi?id=1315616 "Bug 1315616 - Give extensions access to cached favicon URLs")
