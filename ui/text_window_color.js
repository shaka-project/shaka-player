/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextWindowColor');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.TextColorMenu');
goog.requireType('shaka.ui.Controls');


/**
 * Selects the color of the window behind the subtitles.
 *
 * @extends {shaka.ui.TextColorMenu}
 * @final
 * @export
 */
shaka.ui.TextWindowColor = class extends shaka.ui.TextColorMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    const Icons = shaka.ui.Enums.MaterialDesignSVGIcons;
    super(parent, controls,
        Icons['CLOSED_CAPTIONS_WINDOW_COLOR'],
        'windowColor',
        shaka.ui.Locales.Ids.WINDOW_COLOR,
        shaka.ui.Locales.Ids.SUBTITLE_WINDOW_COLOR);

    this.button.classList.add('shaka-caption-window-color-button');
    this.button.classList.add('shaka-tooltip');
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.TextWindowColor.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.TextWindowColor(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'captions-window-color', new shaka.ui.TextWindowColor.Factory());

shaka.ui.Controls.registerElement(
    'captions-window-color', new shaka.ui.TextWindowColor.Factory());
