/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SmallPlayButton');

goog.require('shaka.ui.PlayButton');


/**
 * @extends {shaka.ui.PlayButton}
 * @final
 * @export
 */
shaka.ui.SmallPlayButton = class extends shaka.ui.PlayButton {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    this.button.classList.add('shaka-small-play-button');
    this.button.classList.add('material-icons');

    this.updateIcon();
    this.updateAriaLabel();
  }


  /** @override */
  updateIcon() {
    const Icons = shaka.ui.Enums.MaterialDesignIcons;
    this.button.textContent = this.isPaused() ? Icons.PLAY : Icons.PAUSE;
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.SmallPlayButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.SmallPlayButton(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
    'play_pause', new shaka.ui.SmallPlayButton.Factory());
