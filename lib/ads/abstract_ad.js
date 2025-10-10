/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.AbstractAd');

/**
 * @abstract
 * @implements {shaka.extern.IAd}
 * @export
 */
shaka.ads.AbstractAd = class {
  /**
   * @param {HTMLMediaElement=} video
   */
  constructor(video = null) {
    /** @protected {HTMLMediaElement} */
    this.video = video;
  }

  /**
   * @override
   */
  needsSkipUI() {
    return true;
  }

  /**
   * @override
   */
  isClientRendering() {
    return true;
  }

  /**
   * @override
   */
  hasCustomClick() {
    return false;
  }

  /**
   * @override
   */
  isUsingAnotherMediaElement() {
    return false;
  }

  /**
   * @override
   */
  getDuration() {
    return -1;
  }

  /**
   * @override
   */
  getMinSuggestedDuration() {
    return this.getDuration();
  }

  /**
   * @override
   */
  getRemainingTime() {
    return -1;
  }

  /**
   * @override
   */
  isPaused() {
    return this.video ? this.video.paused : false;
  }

  /**
   * @override
   */
  isSkippable() {
    return false;
  }

  /**
   * @override
   */
  getTimeUntilSkippable() {
    return 0;
  }

  /**
   * @override
   */
  canSkipNow() {
    return false;
  }

  /**
   * @override
   */
  skip() {
    // Nothing
  }

  /**
   * @override
   */
  pause() {
    if (this.video) {
      this.video.pause();
    }
  }

  /**
   * @override
   */
  play() {
    if (this.video) {
      this.video.play();
    }
  }

  /**
   * @override
   */
  getVolume() {
    return this.video ? this.video.volume : 1;
  }

  /**
   * @override
   */
  setVolume(volume) {
    if (this.video) {
      this.video.volume = volume;
    }
  }

  /**
   * @override
   */
  isMuted() {
    return this.video ? this.video.muted : false;
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
    // Nothing
  }

  /**
   * @override
   */
  setMuted(muted) {
    if (this.video) {
      this.video.muted = muted;
    }
  }


  /**
   * @override
   */
  getSequenceLength() {
    return 1;
  }

  /**
   * @override
   */
  getPositionInSequence() {
    return 1;
  }

  /**
   * @override
   */
  getTitle() {
    return '';
  }

  /**
   * @override
   */
  getDescription() {
    return '';
  }

  /**
   * @override
   */
  getVastMediaBitrate() {
    return 0;
  }

  /**
   * @override
   */
  getVastMediaHeight() {
    return 0;
  }

  /**
   * @override
   */
  getVastMediaWidth() {
    return 0;
  }

  /**
   * @override
   */
  getVastAdId() {
    return '';
  }

  /**
   * @override
   */
  getAdId() {
    return '';
  }

  /**
   * @override
   */
  getCreativeAdId() {
    return '';
  }

  /**
   * @override
   */
  getAdvertiserName() {
    return '';
  }

  /**
   * @override
   */
  getMediaUrl() {
    return null;
  }

  /**
   * @override
   */
  getTimeOffset() {
    return 0;
  }

  /**
   * @override
   */
  getPodIndex() {
    return 0;
  }

  /**
   * @override
   */
  release() {
    this.video = null;
  }
};
