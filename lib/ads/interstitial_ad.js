/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.InterstitialAd');

goog.require('shaka.ads.AbstractAd');
goog.require('shaka.ads.Utils');

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
   * @param {?shaka.ads.InterstitialAd.Range_=} range The part of the media
   *   that is this ad, when the ad is not the whole media. Embedded ads are
   *   the range of the content they describe.
   */
  constructor(video, interstitial, onSkip, sequenceLength, adPosition,
      isUsingAnotherMediaElement, range = null) {
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

    /** @private {boolean} */
    this.isLinear_ = shaka.ads.Utils.isLinear(interstitial);

    const embedded = interstitial.playbackMode == shaka.ads.Utils.EMBEDDED;

    /** @private {?shaka.ads.InterstitialAd.Range_} */
    this.range_ = range || (embedded ?
        {start: interstitial.startTime, end: interstitial.endTime} : null);

    /**
     * The media element is shared by every ad of a pod and is not unloaded
     * between them, so until this ad's own media has loaded the element may
     * still hold the previous ad. While that is the case the time based
     * getters must not report the element's values.
     *
     * @private {boolean}
     */
    this.mediaReady_ = embedded;
  }

  /**
   * Called by the ad manager once the media element has loaded this ad's own
   * media, after which the element's timings can be trusted.
   */
  markMediaReady() {
    this.mediaReady_ = true;
  }

  /** @override */
  isClientRendering() {
    return this.interstitial_.playbackMode != shaka.ads.Utils.EMBEDDED;
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
    const range = this.range_;
    if (range && range.end != null) {
      return range.end - range.start;
    }
    // Without an end, the ad runs to the end of the media.
    const duration = this.video.duration;
    if (isNaN(duration) || (range && this.interstitial_.playbackMode ==
        shaka.ads.Utils.EMBEDDED)) {
      return -1;
    }
    return duration - (range ? range.start : 0);
  }

  /**
   * The playhead position within this ad.
   *
   * @return {number}
   */
  getPosition() {
    return this.video.currentTime - (this.range_ ? this.range_.start : 0);
  }

  /**
   * @override
   */
  getRemainingTime() {
    if (!this.mediaReady_) {
      return -1;
    }
    const duration = this.getDuration();
    if (duration < 0) {
      return -1;
    }
    return Math.max(0, duration - this.getPosition());
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
    return this.isLinear_;
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
    const slot = this.interstitial_.adCreativeSignaling;
    return slot && slot.identifiers.length ?
        slot.identifiers[0].value : this.interstitial_.id || '';
  }

  /**
   * @override
   */
  getMediaUrl() {
    return this.interstitial_.uri || '';
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


/**
 * @typedef {{
 *   start: number,
 *   end: ?number,
 * }}
 *
 * @description
 * A part of the media of an ad.
 *
 * @property {number} start
 *   The start of the ad in the media, in seconds.
 * @property {?number} end
 *   The end of the ad in the media, in seconds, or null if the ad runs to the
 *   end of the media.
 * @private
 */
shaka.ads.InterstitialAd.Range_;
