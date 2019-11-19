/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.BigPlayButton');

goog.require('shaka.ui.PlayButton');


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
    this.button.classList.add('shaka-fade-out-on-mouse-out');

    this.updateIcon();
    this.updateAriaLabel();
  }


  /** @override */
  updateIcon() {
    if (this.isPaused()) {
      this.button.setAttribute('icon', 'play');
    } else {
      this.button.setAttribute('icon', 'pause');
    }
  }
};
