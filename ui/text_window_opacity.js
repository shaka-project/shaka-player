/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextWindowOpacity');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.TextOpacityMenu');
goog.requireType('shaka.ui.Controls');


/**
 * Selects the opacity of the window behind the subtitles.
 *
 * @extends {shaka.ui.TextOpacityMenu}
 * @final
 * @export
 */
shaka.ui.TextWindowOpacity = class extends shaka.ui.TextOpacityMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    const Icons = shaka.ui.Enums.MaterialDesignSVGIcons;
    super(parent, controls,
        Icons['CLOSED_CAPTIONS_WINDOW_OPACITY'],
        'windowOpacity',
        [0, 0.25, 0.5, 0.75, 1],
        shaka.ui.Locales.Ids.WINDOW_OPACITY,
        shaka.ui.Locales.Ids.SUBTITLE_WINDOW_OPACITY);

    this.button.classList.add('shaka-caption-window-opacity-button');
    this.button.classList.add('shaka-tooltip');
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.TextWindowOpacity.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.TextWindowOpacity(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'captions-window-opacity',
    new shaka.ui.TextWindowOpacity.Factory());

shaka.ui.Controls.registerElement(
    'captions-window-opacity',
    new shaka.ui.TextWindowOpacity.Factory());
