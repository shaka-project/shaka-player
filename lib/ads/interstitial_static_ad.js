/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.InterstitialStaticAd');

goog.require('shaka.ads.AbstractAd');

/**
 * @export
 */
shaka.ads.InterstitialStaticAd = class extends shaka.ads.AbstractAd {
  /**
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {number} sequenceLength
   * @param {number} adPosition
   */
  constructor(interstitial, sequenceLength, adPosition) {
    super();

    /** @private {shaka.extern.AdInterstitial} */
    this.interstitial_ = interstitial;

    /** @private {number} */
    this.sequenceLength_ = sequenceLength;

    /** @private {number} */
    this.adPosition_ = adPosition;

    /** @private {boolean} */
    this.isLinear_ = interstitial.overlay == null;
  }

  /**
   * @override
   */
  hasCustomClick() {
    return this.interstitial_.clickThroughUrl != null;
  }

  /**
   * @override
   */
  isLinear() {
    return this.isLinear_;
  }


  /**
   * @override
   */
  getSequenceLength() {
    return this.sequenceLength_;
  }

  /**
   * @override
   */
  getPositionInSequence() {
    return this.adPosition_;
  }

  /**
   * @override
   */
  getAdId() {
    return this.interstitial_.id || '';
  }

  /**
   * @override
   */
  getMediaUrl() {
    return this.interstitial_.uri;
  }

  /**
   * @override
   */
  getTimeOffset() {
    if (this.interstitial_.pre) {
      return 0;
    } else if (this.interstitial_.post) {
      return -1;
    }
    return this.interstitial_.startTime;
  }
};
