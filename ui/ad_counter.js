/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.AdCounter');

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
shaka.ui.AdCounter = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLElement} */
    this.container_ = shaka.util.Dom.createHTMLElement('div');
    this.container_.classList.add('shaka-ad-counter');
    this.parent.appendChild(this.container_);

    /** @private {!HTMLElement} */
    this.span_ = shaka.util.Dom.createHTMLElement('span');
    this.span_.classList.add('shaka-ad-counter-span');
    this.container_.appendChild(this.span_);

    /**
     * The timer that tracks down the ad progress.
     *
     * @private {shaka.util.Timer}
     */
    this.timer_ = new shaka.util.Timer(() => {
      this.onTimerTick_();
    });

    this.updateAriaLabel_();

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateAriaLabel_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateAriaLabel_();
        });

    this.eventManager.listen(
        this.adManager, shaka.ads.AdManager.AD_STARTED, () => {
          this.onAdStarted_();
        });

    this.eventManager.listen(
        this.adManager, shaka.ads.AdManager.AD_STOPPED, () => {
          this.reset_();
        });

    if (this.ad) {
      // There was already an ad.
      this.onAdStarted_();
    }
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
    this.timer_.tickNow();
    this.timer_.tickEvery(0.5);
  }

  /**
   * @private
   */
  onTimerTick_() {
    goog.asserts.assert(this.ad != null,
        'this.ad should exist at this point');

    const secondsLeft = Math.round(this.ad.getRemainingTime());
    const adDuration = this.ad.getDuration();
    if (secondsLeft == -1 || adDuration == -1) {
      // Not enough information about the ad. Don't show the
      // counter just yet.
      return;
    }

    if (secondsLeft > 0) {
      const timePassed = adDuration - secondsLeft;
      const timePassedStr =
          shaka.ui.Utils.buildTimeString(timePassed, /* showHour= */ false);
      const adLength = shaka.ui.Utils.buildTimeString(
          adDuration, /* showHour= */ false);
      const timeString = timePassedStr + ' / ' + adLength;

      const adsInAdPod = this.ad.getSequenceLength();
      // If there's more than one ad in the sequence, show the time
      // without the word 'Ad' (it will be shown by another element).
      // Otherwise, the format is "Ad: 0:05 / 0:10."
      if (adsInAdPod > 1) {
        this.span_.textContent = timeString;
      } else {
        const LocIds = shaka.ui.Locales.Ids;
        const raw = this.localization.resolve(LocIds.AD_TIME);
        this.span_.textContent = raw.replace('[AD_TIME]', timeString);
      }
    } else {
      this.reset_();
    }
  }

  /**
   * @private
   */
  reset_() {
    this.timer_.stop();
    // Controls are going to hide the whole ad panel once the ad is over,
    // this is just a safeguard.
    this.span_.textContent = '';
  }

  /**
   * @override
   */
  release() {
    this.timer_.stop();
    this.timer_ = null;
    super.release();
  }
};

