/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

function sanitizeCSSValue(value) {
  if (!value)
    return null;

  value = String(value).trim();
  if (!value || /[;{}<>]/.test(value))
    return null;

  return value;
}

function getColor(colors, ...keys) {
  for (const key of keys) {
    const color = sanitizeCSSValue(colors[key]);
    if (color)
      return color;
  }
  return null;
}

function generateThemeRules(theme) {
  const colors = theme && theme.colors || {};
  const rules = [];
  for (const [key, value] of Object.entries(colors)) {
    const color = sanitizeCSSValue(value);
    if (color)
      rules.push(`--theme-colors-${key}: ${color};`);
  }
  return rules.join('\n');
}

export function generateThemeDeclarations(theme) {
  const colors = theme && theme.colors || null;
  if (!colors) {
    return {
      hasTheme:     false,
      declarations: `
        :root {
          --browser-tab-highlighter: AccentColor;
          --browser-selected-tab-bg: AccentColor;
          --browser-selected-tab-text: AccentColorText;
        }
      `,
    };
  }

  const sidebarBackground = getColor(colors, 'sidebar', 'toolbar');
  const sidebarText       = getColor(colors, 'sidebar_text', 'toolbar_text', 'tab_text', 'bookmark_text', 'tab_background_text', 'textcolor');
  const selectedBackground = getColor(colors, 'sidebar_highlight', 'tab_selected', 'tab_line');
  const selectedText = getColor(colors, 'sidebar_highlight_text', 'tab_text', 'toolbar_text', 'bookmark_text');
  const highlighter = getColor(colors, 'tab_line', 'sidebar_highlight', 'tab_selected', 'accentcolor', 'frame');
  const accent = getColor(colors, 'accentcolor', 'frame');

  const declarations = [
    sidebarBackground && `--browser-sidebar-background-color: ${sidebarBackground};`,
    sidebarText && `--browser-sidebar-text-color: ${sidebarText};`,
    selectedBackground && `--browser-selected-tab-bg: ${selectedBackground};`,
    selectedText && `--browser-selected-tab-text: ${selectedText};`,
    highlighter && `--browser-tab-highlighter: ${highlighter};`,
    accent && `--lwt-accent-color: ${accent};`,
    sidebarText && `--lwt-text-color: ${sidebarText};`,
    generateThemeRules(theme),
  ].filter(Boolean).join('\n');

  return {
    hasTheme:     true,
    declarations: `
      :root {
        ${declarations}
      }
    `,
  };
}
