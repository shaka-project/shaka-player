/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.BasicAd');

goog.require('shaka.ads.AbstractAd');

shaka.ui.BasicAd = class extends shaka.ads.AbstractAd {
  /**
   * @param {HTMLMediaElement} video
   * @param {?number} startTime
   * @param {?number} endTime
   */
  constructor(video, startTime, endTime) {
    super(video);

    /** @private {?number} */
    this.startTime_ = startTime;

    /** @private {?number} */
    this.endTime_ = endTime;

    /** @private {boolean} */
    this.isLinear_ = this.startTime_ != null;
  }

  /**
   * @override
   */
  getDuration() {
    if (this.endTime_ == null || this.startTime_ == null) {
      return -1;
    }
    return this.endTime_ - this.startTime_;
  }

  /**
   * @override
   */
  getRemainingTime() {
    if (this.endTime_ == null) {
      return -1;
    }
    return this.endTime_ - this.video.currentTime;
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
  getTimeOffset() {
    if (this.startTime_ == null) {
      return 0;
    }
    return this.startTime_;
  }
};
