/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextBackgroundColor');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.TextColorMenu');
goog.requireType('shaka.ui.Controls');


/**
 * Selects the background color of the subtitles.
 *
 * @extends {shaka.ui.TextColorMenu}
 * @final
 * @export
 */
shaka.ui.TextBackgroundColor = class extends shaka.ui.TextColorMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    const Icons = shaka.ui.Enums.MaterialDesignSVGIcons;
    super(parent, controls,
        Icons['CLOSED_CAPTIONS_BACKGROUND_COLOR'],
        'backgroundColor',
        shaka.ui.Locales.Ids.BACKGROUND_COLOR,
        shaka.ui.Locales.Ids.SUBTITLE_BACKGROUND_COLOR);

    this.button.classList.add('shaka-caption-background-color-button');
    this.button.classList.add('shaka-tooltip');
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.TextBackgroundColor.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.TextBackgroundColor(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'captions-background-color', new shaka.ui.TextBackgroundColor.Factory());

shaka.ui.Controls.registerElement(
    'captions-background-color', new shaka.ui.TextBackgroundColor.Factory());
