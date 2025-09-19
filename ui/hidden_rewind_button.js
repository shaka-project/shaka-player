/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.HiddenRewindButton');

goog.require('shaka.ui.Enums');
goog.require('shaka.ui.HiddenSeekButton');

goog.requireType('shaka.ui.Controls');

/**
 * @extends {shaka.ui.HiddenSeekButton}
 * @final
 * @export
 */
shaka.ui.HiddenRewindButton = class extends shaka.ui.HiddenSeekButton {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    this.seekContainer.classList.add('shaka-rewind-container');
    this.seekIcon.use(shaka.ui.Enums.MaterialDesignSVGIcons.REWIND);
    this.isRewind = true;
  }
};
