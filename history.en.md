# History

 - master/HEAD
 - 2.0 (2024.2.4)
   * Improved performance on cases with large number of visible bookmarks. Now rows only in the viewport are rendered.
   * Fix unavailability of properties dialog for bookmark items.
 - 1.2.7 (2022.11.3)
   * Reduce memory allocation ([by nirvdrum, thanks!](https://github.com/piroor/webextensions-lib-event-listener-manager/pull/1))
 - 1.2.6 (2022.9.19)
   * Open ctrl/shift/middle-clicked bookmark folder as tabs correctly even if the folder is not expanded yet.
 - 1.2.5 (2022.9.12)
   * Fix incompatibility with Firefox 105 and newer versions.
   * Update `zh_CN` locale by [NightSharp](https://github.com/NightSharp). Thanks!
 - 1.2.4 (2022.2.13)
   * Fix incompatibility around drag and drop operations on Firefox 97 and later.
   * Accept dragged tabs from TST 3.8.20 and later.
 - 1.2.3 (2021.3.2)
   * Better appearance of the search box on the Dark color mode.
   * Add `zh_CN` locale by [NightSharp](https://github.com/NightSharp). Thanks!
   * Add `uk` locale by [perdolka](https://github.com/perdolka). Thanks!
   * Add `ru` locale by [wvxwxvw](https://github.com/wvxwxvw). Thanks!
   * Update `de` locale by [scorpie67](https://github.com/scorpie67). Thanks!
 - 1.2.2 (2020.12.25)
   * Allow to open bookmarks in tabs when "Open bookmarks in tabs always" is unchecked.
 - 1.2.1 (2020.7.29)
   * Better support for the Managed Storage.
   * Flexible width input field in the bookmark properties dialog.
 - 1.2.0 (2020.5.5)
   * Improve compatibility with other addons around bookmarks context menu. This depends on Tree Style Tab 3.5.4 and later.
   * Allow to drag and drop between TST's sidebar and bookmarks. This depends on Tree Style Tab 3.5.4 and later.
   * Remove "Open All as a Tree" context menu command, because TST's built-in feature is now available via the context menu on bookmarks.
 - 1.1.0 (2020.4.28)
   * Optimize for very large number of bookmarks.
 - 1.0.10 (2020.4.25)
   * Improve implementation of semi-modal dialogs. Now it is more similar to native dialogs and more friendly for dark color scheme.
 - 1.0.9 (2020.4.22)
   * Localize UI correctly. (regression on 1.0.8)
 - 1.0.8 (2020.4.22)
   * Set accesskey for input fields in a properties dialog of a bookmark.
 - 1.0.7 (2019.12.27)
   * Don't apply button-like appearance to twisties.
 - 1.0.6 (2019.12.27)
   * Support Dark mode of the platform.
 - 1.0.5 (2019.11.7)
   * Localize the name of the subpanel itself.
   * Add a new context menu command "Open All as a Tree" for TST 3.2.4 and later.
 - 1.0.4 (2019.11.5)
   * Add `de` locale translated by Frank. Thanks!
 - 1.0.3 (2019.8.8)
   * Remove obsolete codes deprecated at Firefox 70.
 - 1.0.2 (2019.6.21)
   * Unregister self from TST correctly, when this is unloaded, on Tree Style Tab 3.1.2 and later.
 - 1.0.1 (2019.6.13)
   * Activate "Open All in Tabs" command in the context menu on a folder certainly.
 - 1.0 (2019.6.13)
   * Initial release.
