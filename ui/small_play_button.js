/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SmallPlayButton');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
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
    this.button.classList.add('material-icons-round');

    this.updateIcon();
    this.updateAriaLabel();
  }


  /** @override */
  updateIcon() {
    const Icons = shaka.ui.Enums.MaterialDesignIcons;
    if (this.video.ended) {
      this.button.textContent = Icons.REPLAY;
    } else {
      this.button.textContent = this.isPaused() ? Icons.PLAY : Icons.PAUSE;
    }
  }

  /** @override */
  updateAriaLabel() {
    const LocIds = shaka.ui.Locales.Ids;
    if (this.video.ended) {
      this.button.ariaLabel = this.localization.resolve(LocIds.REPLAY);
    } else {
      const label = this.isPaused() ? LocIds.PLAY : LocIds.PAUSE;
      this.button.ariaLabel = this.localization.resolve(label);
    }
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
