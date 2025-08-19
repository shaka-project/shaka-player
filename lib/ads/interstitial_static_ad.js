/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.InterstitialStaticAd');

/**
 * @implements {shaka.extern.IAd}
 * @export
 */
shaka.ads.InterstitialStaticAd = class {
  /**
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {number} sequenceLength
   * @param {number} adPosition
   */
  constructor(interstitial, sequenceLength, adPosition) {
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
   * @export
   */
  needsSkipUI() {
    return true;
  }

  /**
   * @override
   * @export
   */
  isClientRendering() {
    return true;
  }

  /**
   * @override
   * @export
   */
  hasCustomClick() {
    return this.interstitial_.clickThroughUrl != null;
  }

  /**
   * @override
   * @export
   */
  isUsingAnotherMediaElement() {
    return false;
  }

  /**
   * @override
   * @export
   */
  getDuration() {
    return -1;
  }

  /**
   * @override
   * @export
   */
  getMinSuggestedDuration() {
    return this.getDuration();
  }

  /**
   * @override
   * @export
   */
  getRemainingTime() {
    return -1;
  }

  /**
   * @override
   * @export
   */
  isPaused() {
    return false;
  }

  /**
   * @override
   * @export
   */
  isSkippable() {
    return false;
  }

  /**
   * @override
   * @export
   */
  getTimeUntilSkippable() {
    return 0;
  }

  /**
   * @override
   * @export
   */
  canSkipNow() {
    return false;
  }

  /**
   * @override
   * @export
   */
  skip() {
    // Nothing
  }

  /**
   * @override
   * @export
   */
  pause() {
    // Nothing
  }

  /**
   * @override
   * @export
   */
  play() {
    // Nothing
  }


  /**
   * @override
   * @export
   */
  getVolume() {
    return 1;
  }

  /**
   * @override
   * @export
   */
  setVolume(volume) {
    // Nothing
  }

  /**
   * @override
   * @export
   */
  isMuted() {
    return false;
  }

  /**
   * @override
   * @export
   */
  isLinear() {
    return this.isLinear_;
  }

  /**
   * @override
   * @export
   */
  resize(width, height) {
    // Nothing
  }

  /**
   * @override
   * @export
   */
  setMuted(muted) {
    // Nothing
  }


  /**
   * @override
   * @export
   */
  getSequenceLength() {
    return this.sequenceLength_;
  }

  /**
   * @override
   * @export
   */
  getPositionInSequence() {
    return this.adPosition_;
  }

  /**
   * @override
   * @export
   */
  getTitle() {
    return '';
  }

  /**
   * @override
   * @export
   */
  getDescription() {
    return '';
  }

  /**
   * @override
   * @export
   */
  getVastMediaBitrate() {
    return 0;
  }

  /**
   * @override
   * @export
   */
  getVastMediaHeight() {
    return 0;
  }

  /**
   * @override
   * @export
   */
  getVastMediaWidth() {
    return 0;
  }

  /**
   * @override
   * @export
   */
  getVastAdId() {
    return '';
  }

  /**
   * @override
   * @export
   */
  getAdId() {
    return this.interstitial_.id || '';
  }

  /**
   * @override
   * @export
   */
  getCreativeAdId() {
    return '';
  }

  /**
   * @override
   * @export
   */
  getAdvertiserName() {
    return '';
  }

  /**
   * @override
   * @export
   */
  getMediaUrl() {
    return this.interstitial_.uri;
  }

  /**
   * @override
   * @export
   */
  getTimeOffset() {
    return 0;
  }

  /**
   * @override
   * @export
   */
  getPodIndex() {
    return 0;
  }

  /**
   * @override
   * @export
   */
  release() {
    // Nothing
  }
};
