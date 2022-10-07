# TST Bookmarks Subpanel

![Build Status](https://github.com/piroor/tst-bookmarks-subpanel/actions/workflows/main.yml/badge.svg?branch=trunk)

A Firefox addon providing the "Bookmarks" subpanel for Tree Style Tab.
This has started mainly for demonstration of [TST's SubPanel API](https://github.com/piroor/treestyletab/wiki/SubPanel-API).

* [Signed package on AMO](https://addons.mozilla.org/firefox/addon/tst-bookmarks-subpanel/)
* [Development builds for each commit are available at "Artifacts" of the CI/CD action](https://github.com/piroor/tst-bookmarks-subpanel/actions?query=workflow%3ACI%2FCD)

## Known restrictions

* Impossible to open non-regular URLs like `about:config`. This is due to a restriction of WebExtensions API.
* Impossible to drag anything from elsewhere to the bookmarks subpanel.
* Impossible to drag bookmarks from the bookmarks subpanel to TST's sidebar.
* Impossible to open native context menu on bookmarks, and extra context menu items added by bookmark related addons are unavailable. This is due to a restriction of WebExtensions API.
* All bookmarks are shown with same icon. [This is due to a restriction of WebExtensions API.](https://bugzilla.mozilla.org/show_bug.cgi?id=1315616 "Bug 1315616 - Give extensions access to cached favicon URLs")

## Privacy Policy

This software does not collect any privacy data automatically, but this includes ability to synchronize options across multiple devices automatically via Firefox Sync.
Any data you input to options may be sent to Mozilla's Sync server, if you configure Firefox to activate Firefox Sync.

このソフトウェアはいかなるプライバシー情報も自動的に収集しませんが、Firefox Syncを介して自動的に設定情報をデバイス間で同期する機能を含みます。
Firefox Syncを有効化している場合、設定画面に入力されたデータは、Mozillaが運用するSyncサーバーに送信される場合があります。

