/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.InterstitialAd');

/**
 * @implements {shaka.extern.IAd}
 * @export
 */
shaka.ads.InterstitialAd = class {
  /**
   * @param {HTMLMediaElement} video
   * @param {boolean} isSkippable
   * @param {?number} skipOffset
   * @param {function()} onSkip
   * @param {number} sequenceLength
   * @param {number} adPosition
   */
  constructor(video, isSkippable, skipOffset, onSkip,
      sequenceLength, adPosition) {
    /** @private {HTMLMediaElement} */
    this.video_ = video;

    /** @private {boolean} */
    this.isSkippable_ = isSkippable;

    /** @private {?number} */
    this.skipOffset_ = skipOffset;

    /** @private {function()} */
    this.onSkip_ = onSkip;

    /** @private {number} */
    this.sequenceLength_ = sequenceLength;

    /** @private {number} */
    this.adPosition_ = adPosition;
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
  getDuration() {
    const duration = this.video_.duration;
    if (isNaN(duration)) {
      return -1;
    }
    return duration;
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
    const duration = this.video_.duration;
    if (isNaN(duration)) {
      return -1;
    }
    return duration - this.video_.currentTime;
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
    return this.isSkippable_;
  }

  /**
   * @override
   * @export
   */
  getTimeUntilSkippable() {
    if (this.isSkippable_) {
      const canSkipIn =
          this.getRemainingTime() + this.skipOffset_ - this.getDuration();
      return Math.max(canSkipIn, 0);
    }
    return Math.max(this.getRemainingTime(), 0);
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
    this.onSkip_();
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
    this.video_ = null;
  }
};
