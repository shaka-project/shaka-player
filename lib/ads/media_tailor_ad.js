/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.MediaTailorAd');

goog.require('shaka.util.TextParser');

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

    /** @private {?number} */
    this.skipOffset_ = this.parseTime_(this.ad_.skipOffset);

    /** @private {HTMLMediaElement} */
    this.video_ = video;

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
    if (typeof this.skipOffset_ == 'number') {
      return true;
    }
    return false;
  }

  /**
   * @override
   * @export
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
    this.isSkipped_ = true;
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

  /**
   * @return {boolean}
   */
  isSkipped() {
    return this.isSkipped_;
  }

  /**
   * Parses a time from string.
   *
   * @param {?string} time
   * @return {?number}
   * @private
   */
  parseTime_(time) {
    if (!time) {
      return null;
    }
    const parser = new shaka.util.TextParser(time);
    const results = parser.readRegex(shaka.ads.MediaTailorAd.timeFormat_);
    if (results == null) {
      return null;
    }
    // This capture is optional, but will still be in the array as undefined,
    // in which case it is 0.
    const hours = Number(results[1]) || 0;
    const minutes = Number(results[2]);
    const seconds = Number(results[3]);
    const milliseconds = Number(results[4]) || 0;
    if (minutes > 59 || seconds > 59) {
      return null;
    }

    return (milliseconds / 1000) + seconds + (minutes * 60) + (hours * 3600);
  }
};

/**
 * @const
 * @private {!RegExp}
 * @example 00:00.000 or 00:00:00.000 or 0:00:00.000 or
 * 00:00.00 or 00:00:00.00 or 0:00:00.00 or 00:00:00
 */
shaka.ads.MediaTailorAd.timeFormat_ =
    /(?:(\d{1,}):)?(\d{2}):(\d{2})((\.(\d{1,3})))?/g;
