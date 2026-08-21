/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.InterstitialAd');

goog.require('shaka.ads.AbstractAd');

/**
 * @export
 */
shaka.ads.InterstitialAd = class extends shaka.ads.AbstractAd {
  /**
   * @param {HTMLMediaElement} video
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {function()} onSkip
   * @param {number} sequenceLength
   * @param {number} adPosition
   * @param {boolean} isUsingAnotherMediaElement
   */
  constructor(video, interstitial, onSkip, sequenceLength, adPosition,
      isUsingAnotherMediaElement) {
    super(video);

    /** @private {shaka.extern.AdInterstitial} */
    this.interstitial_ = interstitial;

    /** @private {boolean} */
    this.isSkippable_ = interstitial.isSkippable;

    /** @private {?number} */
    this.skipOffset_ = interstitial.isSkippable ?
        interstitial.skipOffset || 0 : interstitial.skipOffset;

    /** @private {?number} */
    this.skipFor_ = interstitial.skipFor;

    /** @private {function()} */
    this.onSkip_ = onSkip;

    /** @private {number} */
    this.sequenceLength_ = sequenceLength;

    /** @private {number} */
    this.adPosition_ = adPosition;

    /** @private {boolean} */
    this.isUsingAnotherMediaElement_ = isUsingAnotherMediaElement;

    /** @private {?shaka.extern.AdPositionInfo} */
    this.overlay_ = interstitial.overlay;

    /**
     * The media element is shared by every ad of a pod and is not unloaded
     * between them, so until this ad's own media has loaded the element may
     * still hold the previous ad. While that is the case the time based
     * getters must not report the element's values.
     *
     * @private {boolean}
     */
    this.mediaReady_ = false;
  }

  /**
   * Called by the ad manager once the media element has loaded this ad's own
   * media, after which the element's timings can be trusted.
   */
  markMediaReady() {
    this.mediaReady_ = true;
  }

  /**
   * @override
   */
  hasCustomClick() {
    return this.interstitial_.clickThroughUrl != null;
  }

  /**
   * @override
   */
  isUsingAnotherMediaElement() {
    return this.isUsingAnotherMediaElement_;
  }

  /**
   * @override
   */
  getDuration() {
    if (!this.mediaReady_) {
      return -1;
    }
    const duration = this.video.duration;
    if (isNaN(duration)) {
      return -1;
    }
    return duration;
  }

  /**
   * @override
   */
  getRemainingTime() {
    if (!this.mediaReady_) {
      return -1;
    }
    const duration = this.video.duration;
    if (isNaN(duration)) {
      return -1;
    }
    return duration - this.video.currentTime;
  }

  /**
   * @override
   */
  isSkippable() {
    if (this.isSkippable_ && this.skipFor_ != null) {
      // Before this ad's media loads its playhead is at 0 by definition.
      const position = this.mediaReady_ ?
          this.getDuration() - this.getRemainingTime() : 0;
      const maxTime = this.skipOffset_ + this.skipFor_;
      return position < maxTime;
    }
    return this.isSkippable_;
  }

  /**
   * @override
   */
  getTimeUntilSkippable() {
    if (this.isSkippable()) {
      if (!this.mediaReady_) {
        // The playhead is still at 0, so the whole offset is ahead of us.
        return Math.max(this.skipOffset_, 0);
      }
      const canSkipIn =
          this.getRemainingTime() + this.skipOffset_ - this.getDuration();
      return Math.max(canSkipIn, 0);
    }
    return Math.max(this.getRemainingTime(), 0);
  }

  /**
   * @override
   */
  canSkipNow() {
    return this.isSkippable_ && this.getTimeUntilSkippable() == 0;
  }

  /**
   * @override
   */
  skip() {
    if (this.canSkipNow()) {
      this.onSkip_();
    }
  }

  /**
   * @override
   */
  isLinear() {
    return this.overlay_ == null;
  }


  /**
   * @override
   */
  getSequenceLength() {
    return this.sequenceLength_;
  }

  /**
   * @override
   */
  getPositionInSequence() {
    return this.adPosition_;
  }

  /**
   * @override
   */
  getAdId() {
    return this.interstitial_.id || '';
  }

  /**
   * @override
   */
  getMediaUrl() {
    return this.interstitial_.uri;
  }

  /**
   * @override
   */
  getTimeOffset() {
    if (this.interstitial_.pre) {
      return 0;
    } else if (this.interstitial_.post) {
      return -1;
    }
    return this.interstitial_.startTime;
  }
};
