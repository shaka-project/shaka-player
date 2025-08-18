/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.HiddenFastForwardButton');

goog.require('shaka.ui.Enums');
goog.require('shaka.ui.HiddenSeekButton');

goog.requireType('shaka.ui.Controls');

/**
 * @extends {shaka.ui.HiddenSeekButton}
 * @final
 * @export
 */
shaka.ui.HiddenFastForwardButton = class extends shaka.ui.HiddenSeekButton {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    this.seekContainer.classList.add('shaka-fast-forward-container');
    this.seekIcon.use(shaka.ui.Enums.MaterialDesignSVGIcons.FAST_FORWARD);
    this.isRewind = false;
  }
};
