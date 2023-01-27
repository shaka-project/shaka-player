/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.AdPosition');

goog.require('shaka.ads.AdManager');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.AdPosition = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLElement} */
    this.container_ = shaka.util.Dom.createHTMLElement('div');
    this.container_.classList.add('shaka-ad-position');
    shaka.ui.Utils.setDisplay(this.container_, false);
    this.parent.appendChild(this.container_);

    /** @private {!HTMLElement} */
    this.span_ = shaka.util.Dom.createHTMLElement('span');
    this.span_.classList.add('shaka-ad-position-span');
    this.container_.appendChild(this.span_);

    this.updateAriaLabel_();

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          if (!this.ad) {
            return;
          }

          this.updateAriaLabel_();
          this.setPosition_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          if (!this.ad) {
            return;
          }

          this.updateAriaLabel_();
          this.setPosition_();
        });

    this.eventManager.listen(
        this.adManager, shaka.ads.AdManager.AD_STARTED, () => {
          this.setPosition_();
        });

    this.eventManager.listen(
        this.adManager, shaka.ads.AdManager.AD_STOPPED, () => {
          this.span_.textContent = '';
          shaka.ui.Utils.setDisplay(this.container_, false);
        });

    if (this.ad) {
      // There was already an ad.
      this.setPosition_();
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
  setPosition_() {
    const adsInAdPod = this.ad.getSequenceLength();
    if (adsInAdPod > 1) {
      // If it's a single ad, showing 'Ad 1 of 1' isn't helpful.
      // Only show this element if there's more than 1 ad.
      const LocIds = shaka.ui.Locales.Ids;
      const adPosition = this.ad.getPositionInSequence();
      this.span_.textContent = this.localization.resolve(LocIds.AD_PROGRESS)
          .replace('[AD_ON]', String(adPosition))
          .replace('[NUM_ADS]', String(adsInAdPod));
      shaka.ui.Utils.setDisplay(this.container_, true);
    }
  }
};

