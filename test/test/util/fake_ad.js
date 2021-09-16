/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.test.FakeAd');


/**
 * @implements {shaka.extern.IAd}
 */
shaka.test.FakeAd = class {
  /**
   * @param {?number} skipIn
   * @param {number} position
   * @param {number} totalAdsInPod
   */
  constructor(skipIn, position, totalAdsInPod) {
    /** @private {?number} */
    this.skipIn_ = skipIn;

    /** @private {number} */
    this.position_ = position;

    /** @private {number} */
    this.totalAdsInPod_ = totalAdsInPod;

    /** @private {number} */
    this.duration_ = 10; // a 10 second ad by default

    /** @private {number} */
    this.remainingTime_ = 10;

    /** @private {boolean} */
    this.isPaused_ = false;

    /** @private {number} */
    this.volume_ = 1;
  }

  /**
   * @override
   */
  getDuration() {
    return this.duration_;
  }

  /**
   * @override
   */
  getMinSuggestedDuration() {
    return this.duration_;
  }

  /**
   * @param {number} duration
   */
  setDuration(duration) {
    this.duration_ = duration;
  }

  /**
   * @override
   */
  getRemainingTime() {
    return this.remainingTime_;
  }

  /**
   * @param {number} time
   */
  setRemainingTime(time) {
    this.remainingTime_ = time;
  }

  /**
   * @override
   */
  isPaused() {
    return this.isPaused_;
  }

  /**
   * @override
   */
  isSkippable() {
    return this.skipIn_ != null;
  }

  /**
   * @param {number} time
   */
  setTimeUntilSkippable(time) {
    this.skipIn_ = time;
  }

  /**
   * @override
   */
  getTimeUntilSkippable() {
    return this.skipIn_ || -1;
  }

  /**
   * @override
   */
  canSkipNow() {
    return this.skipIn_ == 0;
  }

  /**
   * @override
   * @export
   */
  skip() {
    // No op
  }

  /**
   * @override
   */
  pause() {
    this.isPaused_ = true;
  }

  /**
   * @override
   */
  play() {
    this.isPaused_ = false;
  }


  /**
   * @override
   */
  getVolume() {
    return this.volume_;
  }

  /**
   * @override
   */
  setVolume(volume) {
    this.volume_ = volume;
  }

  /**
   * @override
   */
  isMuted() {
    return this.volume_ == 0;
  }


  /**
   * @override
   */
  isLinear() {
    return true;
  }

  /**
   * @override
   */
  resize(width, height) {
    // No op
  }

  /**
   * @override
   * @export
   */
  setMuted(muted) {
    this.setVolume(0);
  }


  /**
   * @override
   * @export
   */
  getSequenceLength() {
    return this.totalAdsInPod_;
  }

  /**
   * @override
   * @export
   */
  getPositionInSequence() {
    return this.position_;
  }


  /**
   * @override
   * @export
   */
  release() {
    // No op
  }
};
