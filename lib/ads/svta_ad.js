/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.SvtaAd');

goog.require('shaka.ads.AbstractAd');

/**
 * @export
 */
shaka.ads.SvtaAd = class extends shaka.ads.AbstractAd {
  /**
   * @param {HTMLMediaElement} video
   * @param {shaka.extern.AdTrackingInfo} info
   */
  constructor(video, info) {
    super(video);

    /** @private {shaka.extern.AdTrackingInfo} */
    this.info_ = info;
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
    if (!this.info_.endTime) {
      return -1;
    }
    return this.info_.endTime - this.info_.startTime;
  }

  /**
   * @override
   */
  getRemainingTime() {
    if (!this.info_.endTime) {
      return -1;
    }
    return this.info_.endTime - this.video.currentTime;
  }

  /**
   * @override
   */
  getSequenceLength() {
    return this.info_.sequenceLength;
  }

  /**
   * @override
   */
  getPositionInSequence() {
    return this.info_.position;
  }

  /**
   * @override
   */
  getTimeOffset() {
    return this.info_.startTime;
  }
};
