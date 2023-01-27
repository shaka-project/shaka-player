/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SkipAdButton');

goog.require('goog.asserts');
goog.require('shaka.ads.AdManager');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.Timer');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.SkipAdButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLElement} */
    this.container_ = shaka.util.Dom.createHTMLElement('div');
    this.container_.classList.add('shaka-skip-ad-container');
    this.parent.appendChild(this.container_);

    /** @private {!HTMLElement} */
    this.counter_ = shaka.util.Dom.createHTMLElement('div');
    this.counter_.classList.add('shaka-skip-ad-counter');
    shaka.ui.Utils.setDisplay(this.counter_, false);
    this.container_.appendChild(this.counter_);

    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add('shaka-skip-ad-button');
    this.button_.disabled = true;
    shaka.ui.Utils.setDisplay(this.button_, false);
    this.button_.classList.add('shaka-no-propagation');
    this.container_.appendChild(this.button_);
    this.updateAriaLabel_();
    this.updateLocalizedStrings_();

    /**
     * The timer that tracks down the ad progress until it can be skipped.
     *
     * @private {shaka.util.Timer}
     */
    this.timer_ = new shaka.util.Timer(() => {
      this.onTimerTick_();
    });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateAriaLabel_();
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateAriaLabel_();
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(
        this.adManager, shaka.ads.AdManager.AD_STARTED, () => {
          this.onAdStarted_();
        });

    this.eventManager.listen(
        this.adManager, shaka.ads.AdManager.AD_SKIP_STATE_CHANGED, () => {
          this.onSkipStateChanged_();
        });

    this.eventManager.listen(
        this.adManager, shaka.ads.AdManager.AD_STOPPED, () => {
          this.reset_();
        });

    this.eventManager.listen(
        this.button_, 'click', () => {
          this.ad.skip();
        });

    if (this.ad) {
      // There was already an ad.
      this.onAdStarted_();
    }
  }

  /**
   * @override
   */
  release() {
    this.timer_.stop();
    this.timer_ = null;
    super.release();
  }

  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;
    this.button_.textContent = this.localization.resolve(LocIds.SKIP_AD);
  }

  /**
   * @private
   */
  updateAriaLabel_() {
    // TODO
  }

  /**
   * @private
   */
  onAdStarted_() {
    if (this.ad.isSkippable()) {
      shaka.ui.Utils.setDisplay(this.button_, true);
      shaka.ui.Utils.setDisplay(this.counter_, true);
      this.counter_.textContent = '';
      this.timer_.tickNow();
      this.timer_.tickEvery(0.5);
    }
  }

  /**
   * @private
   */
  onTimerTick_() {
    goog.asserts.assert(this.ad != null,
        'this.ad should exist at this point');

    const secondsLeft = Math.round(this.ad.getTimeUntilSkippable());
    if (secondsLeft > 0) {
      this.counter_.textContent = secondsLeft;
    } else {
      // The ad should now be skippable. OnSkipStateChanged() is
      // listening for a SKIP_STATE_CHANGED event and will take care
      // of the button. Here we just stop the timer and hide the counter.
      // NOTE: onSkipStateChanged_() also hides the counter.
      this.timer_.stop();
      shaka.ui.Utils.setDisplay(this.counter_, false);
    }
  }

  /**
   * @private
   */
  onSkipStateChanged_() {
    // Double-check that the ad is now skippable
    if (this.ad.canSkipNow()) {
      this.button_.disabled = false;
      this.timer_.stop();
      shaka.ui.Utils.setDisplay(this.counter_, false);
    }
  }

  /**
   * @private
   */
  reset_() {
    this.timer_.stop();
    this.button_.disabled = true;
    shaka.ui.Utils.setDisplay(this.button_, false);
    shaka.ui.Utils.setDisplay(this.counter_, false);
  }
};

