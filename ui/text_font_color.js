/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextFontColor');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.TextColorMenu');
goog.requireType('shaka.ui.Controls');


/**
 * Selects the font color of the subtitles.
 *
 * @extends {shaka.ui.TextColorMenu}
 * @final
 * @export
 */
shaka.ui.TextFontColor = class extends shaka.ui.TextColorMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        shaka.ui.Enums.MaterialDesignSVGIcons['CLOSED_CAPTIONS_FONT_COLOR'],
        'fontColor',
        shaka.ui.Locales.Ids.FONT_COLOR,
        shaka.ui.Locales.Ids.SUBTITLE_FONT_COLOR);

    this.button.classList.add('shaka-caption-font-color-button');
    this.button.classList.add('shaka-tooltip');
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.TextFontColor.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.TextFontColor(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'captions-font-color', new shaka.ui.TextFontColor.Factory());

shaka.ui.Controls.registerElement(
    'captions-font-color', new shaka.ui.TextFontColor.Factory());
