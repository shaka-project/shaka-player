/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextBackgroundOpacity');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.TextOpacityMenu');
goog.requireType('shaka.ui.Controls');


/**
 * Selects the background opacity of the subtitles.
 *
 * @extends {shaka.ui.TextOpacityMenu}
 * @final
 * @export
 */
shaka.ui.TextBackgroundOpacity = class extends shaka.ui.TextOpacityMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    const Icons = shaka.ui.Enums.MaterialDesignSVGIcons;
    super(parent, controls,
        Icons['CLOSED_CAPTIONS_BACKGROUND_OPACITY'],
        'backgroundOpacity',
        [0, 0.25, 0.5, 0.75, 1],
        shaka.ui.Locales.Ids.BACKGROUND_OPACITY,
        shaka.ui.Locales.Ids.SUBTITLE_BACKGROUND_OPACITY);

    this.button.classList.add('shaka-caption-background-opacity-button');
    this.button.classList.add('shaka-tooltip');
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.TextBackgroundOpacity.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.TextBackgroundOpacity(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'captions-background-opacity',
    new shaka.ui.TextBackgroundOpacity.Factory());

shaka.ui.Controls.registerElement(
    'captions-background-opacity',
    new shaka.ui.TextBackgroundOpacity.Factory());
