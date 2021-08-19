/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.RewindButton');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.util.Dom');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.RewindButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add('material-icons-round');
    this.button_.classList.add('shaka-rewind-button');
    this.button_.textContent =
      shaka.ui.Enums.MaterialDesignIcons.REWIND;
    this.parent.appendChild(this.button_);
    this.updateAriaLabel_();

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateAriaLabel_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateAriaLabel_();
        });

    this.eventManager.listen(this.button_, 'click', () => {
      this.rewind_();
    });
  }

  /**
   * @private
   */
  updateAriaLabel_() {
    this.button_.ariaLabel =
        this.localization.resolve(shaka.ui.Locales.Ids.REWIND);
  }

  /**
   * Cycles trick play rate between -1, -2, -4, and -8.
   * @private
   */
  rewind_() {
    if (!this.video.duration) {
      return;
    }

    const trickPlayRate = this.player.getPlaybackRate();
    // Every time the button is clicked, the rate is multiplied by 2,
    // unless the rate is at it's slowest (-8), in which case it is
    // dropped back to 1.
    const newRate = (trickPlayRate > 0 || trickPlayRate < -4) ?
        -1 : trickPlayRate * 2;
    this.player.trickPlay(newRate);
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.RewindButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.RewindButton(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
    'rewind', new shaka.ui.RewindButton.Factory());

