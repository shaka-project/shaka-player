/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TrickPlayButton');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.Controls');


/**
 * Trick-play button that cycles through configurable playback rates.
 * Pass isForward=true for fast-forward behaviour, false for rewind.
 *
 * @extends {shaka.ui.Element}
 * @export
 */
shaka.ui.TrickPlayButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   * @param {boolean} isForward  true → fast-forward; false → rewind
   */
  constructor(parent, controls, isForward) {
    super(parent, controls);

    /** @private {boolean} */
    this.isForward_ = isForward;

    const config = this.controls.getConfig();

    /** @private {!Array<number>} */
    this.rates_ = isForward ? config.fastForwardRates : config.rewindRates;

    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add(
        isForward ? 'shaka-fast-forward-button' : 'shaka-rewind-button');
    this.button_.classList.add('shaka-tooltip-status');
    this.button_.classList.add('shaka-no-propagation');

    const initialStatus = isForward ? '1x' :
        this.localization.resolve(shaka.ui.Locales.Ids.OFF);
    this.button_.setAttribute('shaka-status', initialStatus);

    new shaka.ui.Icon(this.button_).use(
        shaka.ui.Enums.MaterialDesignSVGIcons[isForward ?
          'FAST_FORWARD' : 'REWIND']);

    this.parent.appendChild(this.button_);

    this.updateLocalizedStrings();

    this.eventManager.listen(this.button_, 'click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      this.cycleRate_();
    });

    this.eventManager.listen(this.player, 'ratechange', () => {
      this.button_.setAttribute(
          'shaka-status', this.player.getPlaybackRate() + 'x');
    });
  }

  /** @override */
  updateLocalizedStrings() {
    this.button_.ariaLabel = this.localization.resolve(
        this.isForward_ ? shaka.ui.Locales.Ids.FAST_FORWARD :
          shaka.ui.Locales.Ids.REWIND);
  }

  /**
   * Cycles trick play rate through the configured rates array.
   * @private
   */
  cycleRate_() {
    if (!this.video.duration) {
      return;
    }

    const trickPlayRate = this.player.getPlaybackRate();
    const newRateIndex = this.rates_.indexOf(trickPlayRate) + 1;

    // Wrap around to the first rate when the end of the array is reached.
    const newRate = (newRateIndex != this.rates_.length) ?
        this.rates_[newRateIndex] : this.rates_[0];

    if (this.video.paused) {
      // trickPlay needs the video playing to take effect immediately.
      this.video.play();
    }
    this.player.trickPlay(newRate);

    this.button_.setAttribute('shaka-status', newRate + 'x');
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.TrickPlayButton.FastForwardFactory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.TrickPlayButton(
        rootElement, controls, /* isForward= */ true);
  }
};

shaka.ui.Controls.registerElement(
    'fast_forward', new shaka.ui.TrickPlayButton.FastForwardFactory());

shaka.ui.Controls.registerBigElement(
    'fast_forward', new shaka.ui.TrickPlayButton.FastForwardFactory());


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.TrickPlayButton.RewindFactory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.TrickPlayButton(
        rootElement, controls, /* isForward= */ false);
  }
};

shaka.ui.Controls.registerElement(
    'rewind', new shaka.ui.TrickPlayButton.RewindFactory());

shaka.ui.Controls.registerBigElement(
    'rewind', new shaka.ui.TrickPlayButton.RewindFactory());
