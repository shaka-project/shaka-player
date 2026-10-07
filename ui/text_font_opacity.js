/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextFontOpacity');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.TextOpacityMenu');
goog.requireType('shaka.ui.Controls');


/**
 * Selects the font opacity of the subtitles.
 *
 * @extends {shaka.ui.TextOpacityMenu}
 * @final
 * @export
 */
shaka.ui.TextFontOpacity = class extends shaka.ui.TextOpacityMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        shaka.ui.Enums.MaterialDesignSVGIcons['CLOSED_CAPTIONS_FONT_OPACITY'],
        'fontOpacity',
        [0.25, 0.5, 0.75, 1],
        shaka.ui.Locales.Ids.FONT_OPACITY,
        shaka.ui.Locales.Ids.SUBTITLE_FONT_OPACITY);

    this.button.classList.add('shaka-caption-font-opacity-button');
    this.button.classList.add('shaka-tooltip');
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.TextFontOpacity.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.TextFontOpacity(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'captions-font-opacity', new shaka.ui.TextFontOpacity.Factory());

shaka.ui.Controls.registerElement(
    'captions-font-opacity', new shaka.ui.TextFontOpacity.Factory());
