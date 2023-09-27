/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.MediaTailorAd');

/**
 * @implements {shaka.extern.IAd}
 * @export
 */
shaka.ads.MediaTailorAd = class {
  /**
   * @param {mediaTailor.Ad} mediaTailorAd
   * @param {number} adPosition
   * @param {number} totalAds
   * @param {HTMLMediaElement} video
   */
  constructor(mediaTailorAd, adPosition, totalAds, isLinear, video) {
    /** @private {?mediaTailor.Ad} */
    this.ad_ = mediaTailorAd;

    /** @private {HTMLMediaElement} */
    this.video_ = video;

    /** @private {?number} */
    this.adPosition_ = adPosition;

    /** @private {?number} */
    this.totalAds_ = totalAds;

    /** @private {boolean} */
    this.isLinear_ = isLinear;
  }


  /**
   * @override
   * @export
   */
  getDuration() {
    return this.ad_.durationInSeconds;
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
    const endTime = this.ad_.startTimeInSeconds + this.ad_.durationInSeconds;
    return endTime - this.video_.currentTime;
  }

  /**
   * @override
   * @export
   */
  isPaused() {
    return this.video_.paused;
  }

  /**
   * @override
   * @export
   */
  isSkippable() {
    if (this.ad_.skipOffset) {
      return true;
    }
    return false;
  }

  /**
   * @override
   * @export
   */
  getTimeUntilSkippable() {
    if (!this.ad_.skipOffset) {
      return this.getRemainingTime();
    }
    const canSkipIn = this.getRemainingTime() - this.ad_.skipOffset;
    return Math.max(canSkipIn, 0);
  }

  /**
   * @override
   * @export
   */
  canSkipNow() {
    return this.getTimeUntilSkippable() == 0;
  }

  /**
   * @override
   * @export
   */
  skip() {
    this.video_.currentTime += this.getRemainingTime();
  }

  /**
   * @override
   * @export
   */
  pause() {
    return this.video_.pause();
  }

  /**
   * @override
   * @export
   */
  play() {
    return this.video_.play();
  }


  /**
   * @override
   * @export
   */
  getVolume() {
    return this.video_.volume;
  }

  /**
   * @override
   * @export
   */
  setVolume(volume) {
    this.video_.volume = volume;
  }

  /**
   * @override
   * @export
   */
  isMuted() {
    return this.video_.muted;
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
    this.video_.muted = muted;
  }


  /**
   * @override
   * @export
   */
  getSequenceLength() {
    if (!this.totalAds_) {
      return 1;
    }
    return this.totalAds_;
  }

  /**
   * @override
   * @export
   */
  getPositionInSequence() {
    if (!this.adPosition_) {
      return 1;
    }
    return this.adPosition_;
  }

  /**
   * @override
   * @export
   */
  getTitle() {
    return this.ad_.adTitle;
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
  getAdId() {
    return this.ad_.adId;
  }

  /**
   * @override
   * @export
   */
  getCreativeAdId() {
    return this.ad_.creativeId;
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
    return null;
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
    this.ad_ = null;
    this.video_ = null;
    this.adPosition_ = null;
    this.totalAds_ = null;
  }
};
