/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.BigPlayButton');

goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.PlayButton');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.PlayButton}
 * @final
 * @export
 */
shaka.ui.BigPlayButton = class extends shaka.ui.PlayButton {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    this.button.classList.add('shaka-play-button');
    this.button.classList.add('shaka-no-propagation');
  }


  /** @override */
  updateIcon() {
    const Icons = shaka.ui.Enums.MaterialDesignSVGIcons;
    const icon = new shaka.ui.Icon(/* parent= */ null);
    if (this.isEnded() && this.video.duration) {
      icon.use(Icons.REPLAY);
    } else {
      icon.use(this.isPaused() ? Icons['PLAY'] : Icons['PAUSE']);
    }
    this.button.style.backgroundImage = icon.getDataUrl();
  }
};
