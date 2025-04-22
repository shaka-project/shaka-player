/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.AdInfo');

goog.require('goog.asserts');
goog.require('shaka.ads.Utils');
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
shaka.ui.AdInfo = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLElement} */
    this.adInfo_ = shaka.util.Dom.createButton();
    this.adInfo_.classList.add('shaka-ad-info');
    this.adInfo_.disabled = true;
    this.parent.appendChild(this.adInfo_);

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
        this.adManager, shaka.ads.Utils.AD_STARTED, () => {
          this.onAdStarted_();
        });

    this.eventManager.listen(
        this.adManager, shaka.ads.Utils.AD_STOPPED, () => {
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
    const LocIds = shaka.ui.Locales.Ids;

    goog.asserts.assert(this.ad != null,
        'this.ad should exist at this point');

    if (!this.ad.isLinear()) {
      // Do not show information for non-linear ads.
      return;
    }

    let text = '';

    const adsInAdPod = this.ad.getSequenceLength();
    if (adsInAdPod > 1) {
      // If it's a single ad, showing 'Ad 1 of 1' isn't helpful.
      // Only show this element if there's more than 1 ad and it's a linear ad.
      const adPosition = this.ad.getPositionInSequence();
      text = this.localization.resolve(LocIds.AD_PROGRESS)
          .replace('[AD_ON]', String(adPosition))
          .replace('[NUM_ADS]', String(adsInAdPod));
    }

    const secondsLeft = Math.round(this.ad.getRemainingTime());
    const adDuration = this.ad.getDuration();
    if (secondsLeft == -1 || adDuration == -1) {
      this.adInfo_.textContent = text;
      shaka.ui.Utils.setDisplay(this.adInfo_, text != '');
      return;
    }

    if (secondsLeft > 0) {
      const timePassed = adDuration - secondsLeft;
      const timePassedStr =
          shaka.ui.Utils.buildTimeString(timePassed, /* showHour= */ false);
      const adLength = shaka.ui.Utils.buildTimeString(
          adDuration, /* showHour= */ false);
      const timeString = timePassedStr + ' / ' + adLength;

      // If there's more than one ad in the sequence, show the time
      // without the word 'Ad' (it will be shown by another element).
      // Otherwise, the format is "Ad: 0:05 / 0:10."
      if (adsInAdPod > 1) {
        text += '\u00A0\u00A0' + timeString;
      } else {
        text = this.localization.resolve(LocIds.AD_TIME)
            .replace('[AD_TIME]', timeString);
      }
      this.adInfo_.textContent = text;
      shaka.ui.Utils.setDisplay(this.adInfo_, text != '');
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
    this.adInfo_.textContent = '';
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

