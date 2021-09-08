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
    this.button_.classList.add('shaka-tooltip-status');
    this.button_.setAttribute('shaka-status',
        this.localization.resolve(shaka.ui.Locales.Ids.OFF));
    this.button_.textContent =
      shaka.ui.Enums.MaterialDesignIcons.REWIND;
    this.parent.appendChild(this.button_);
    this.updateAriaLabel_();

    /** @private {!Array.<number>} */
    this.rewindRates_ = this.controls.getConfig().rewindRates;

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
   * Cycles trick play rate between the selected rewind rates.
   * @private
   */
  rewind_() {
    if (!this.video.duration) {
      return;
    }

    const trickPlayRate = this.player.getPlaybackRate();
    const newRateIndex = this.rewindRates_.indexOf(trickPlayRate) + 1;

    // When the button is clicked, the next rate in this.rewindRates_ is
    // selected. If no more rates are available, the first one is set.
    const newRate = (newRateIndex != this.rewindRates_.length) ?
        this.rewindRates_[newRateIndex] : this.rewindRates_[0];
    this.player.trickPlay(newRate);

    this.button_.setAttribute('shaka-status', newRate + 'x');
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

