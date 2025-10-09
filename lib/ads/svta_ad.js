/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.SvtaAd');

goog.require('goog.asserts');

/**
 * @implements {shaka.extern.IAd}
 * @export
 */
shaka.ads.SvtaAd = class {
  /**
   * @param {HTMLMediaElement} video
   * @param {shaka.extern.AdTrackingInfo} info
   */
  constructor(video, info) {
    /** @private {HTMLMediaElement} */
    this.video_ = video;
    /** @private {shaka.extern.AdTrackingInfo} */
    this.info_ = info;
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
    return false;
  }

  /**
   * @override
   * @export
   */
  hasCustomClick() {
    return false;
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
    goog.asserts.assert(this.info_.endTime, 'endTime must not be null!');
    return this.info_.endTime - this.info_.startTime;
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
    goog.asserts.assert(this.info_.endTime, 'endTime must not be null!');
    return this.info_.endTime - this.video_.currentTime;
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
    return true;
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
    return this.info_.sequenceLength;
  }

  /**
   * @override
   * @export
   */
  getPositionInSequence() {
    return this.info_.position;
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
    return '';
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
    return '';
  }

  /**
   * @override
   * @export
   */
  getTimeOffset() {
    return this.info_.startTime;
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
