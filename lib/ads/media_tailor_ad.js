/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.MediaTailorAd');

goog.require('shaka.ads.AbstractAd');
goog.require('shaka.util.TextParser');

/**
 * @export
 */
shaka.ads.MediaTailorAd = class extends shaka.ads.AbstractAd {
  /**
   * @param {mediaTailor.Ad} mediaTailorAd
   * @param {number} adPosition
   * @param {number} totalAds
   * @param {boolean} isLinear
   * @param {HTMLMediaElement} video
   */
  constructor(mediaTailorAd, adPosition, totalAds, isLinear, video) {
    super(video);

    /** @private {?mediaTailor.Ad} */
    this.ad_ = mediaTailorAd;

    /** @private {?number} */
    this.skipOffset_ = shaka.util.TextParser.parseTime(this.ad_.skipOffset);

    /** @private {?number} */
    this.adPosition_ = adPosition;

    /** @private {?number} */
    this.totalAds_ = totalAds;

    /** @private {boolean} */
    this.isLinear_ = isLinear;

    /** @private {boolean} */
    this.isSkipped_ = false;
  }

  /**
   * @override
   */
  isClientRendering() {
    return false;
  }

  /**
   * @override
   */
  getDuration() {
    return this.ad_.durationInSeconds;
  }

  /**
   * @override
   */
  getRemainingTime() {
    const endTime = this.ad_.startTimeInSeconds + this.ad_.durationInSeconds;
    return endTime - this.video.currentTime;
  }

  /**
   * @override
   */
  isSkippable() {
    if (typeof this.skipOffset_ == 'number') {
      return true;
    }
    return false;
  }

  /**
   * @override
   */
  getTimeUntilSkippable() {
    if (typeof this.skipOffset_ != 'number') {
      return this.getRemainingTime();
    }
    const canSkipIn =
        this.getRemainingTime() + this.skipOffset_ - this.getDuration();
    return Math.max(canSkipIn, 0);
  }

  /**
   * @override
   */
  canSkipNow() {
    return this.getTimeUntilSkippable() == 0;
  }

  /**
   * @override
   */
  skip() {
    this.isSkipped_ = true;
    this.video.currentTime += this.getRemainingTime();
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
    if (!this.totalAds_) {
      return 1;
    }
    return this.totalAds_;
  }

  /**
   * @override
   */
  getPositionInSequence() {
    if (!this.adPosition_) {
      return 1;
    }
    return this.adPosition_;
  }

  /**
   * @override
   */
  getTitle() {
    return this.ad_.adTitle;
  }

  /**
   * @override
   */
  getVastAdId() {
    return this.ad_.vastAdId || '';
  }

  /**
   * @override
   */
  getAdId() {
    return this.ad_.adId;
  }

  /**
   * @override
   */
  getCreativeAdId() {
    return this.ad_.creativeId;
  }

  /**
   * @override
   */
  getTimeOffset() {
    return this.ad_.startTimeInSeconds;
  }

  /**
   * @override
   */
  release() {
    this.ad_ = null;
    this.adPosition_ = null;
    this.totalAds_ = null;
  }

  /**
   * @return {boolean}
   */
  isSkipped() {
    return this.isSkipped_;
  }
};
