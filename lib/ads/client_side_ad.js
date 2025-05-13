/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.ClientSideAd');

goog.require('shaka.util.EventManager');


/**
 * @implements {shaka.extern.IAd}
 * @export
 */
shaka.ads.ClientSideAd = class {
  /**
   * @param {!google.ima.Ad} imaAd
   * @param {!google.ima.AdsManager} imaAdManager
   * @param {HTMLMediaElement} video
   */
  constructor(imaAd, imaAdManager, video) {
    /** @private {google.ima.Ad} */
    this.ad_ = imaAd;

    /** @private {google.ima.AdsManager} */
    this.manager_ = imaAdManager;

    /** @private {HTMLMediaElement} */
    this.video_ = video;

    /** @private {boolean} */
    this.isPaused_ = false;

    /** @private {number} */
    this.volume_ = this.manager_.getVolume();

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    this.eventManager_.listen(this.manager_,
        google.ima.AdEvent.Type.PAUSED, () => {
          this.isPaused_ = true;
        });

    this.eventManager_.listen(this.manager_,
        google.ima.AdEvent.Type.RESUMED, () => {
          this.isPaused_ = false;
        });
  }

  /**
   * @override
   * @export
   */
  needsSkipUI() {
    return false;
  }

  /**
   * @override
   * @export
   */
  isClientRendering() {
    return true;
  }

  /**
   * @override
   * @export
   */
  hasCustomClick() {
    return true;
  }

  /**
   * @override
   * @export
   */
  isUsingAnotherMediaElement() {
    return true;
  }

  /**
   * @override
   * @export
   */
  getDuration() {
    return this.ad_.getDuration();
  }

  /**
   * @override
   * @export
   */
  getMinSuggestedDuration() {
    return this.ad_.getMinSuggestedDuration();
  }

  /**
   * @override
   * @export
   */
  getRemainingTime() {
    return this.manager_.getRemainingTime();
  }

  /**
   * @override
   * @export
   */
  isPaused() {
    return this.isPaused_;
  }

  /**
   * @override
   * @export
   */
  isSkippable() {
    // IMA returns -1 for non-skippable ads. Any positive number is a genuine
    // skip offset, meaning the ad is skippable.
    return this.ad_.getSkipTimeOffset() >= 0;
  }

  /**
   * @override
   * @export
   */
  getTimeUntilSkippable() {
    const skipOffset = this.ad_.getSkipTimeOffset();
    const canSkipIn = this.getRemainingTime() - skipOffset;
    return Math.max(canSkipIn, 0);
  }

  /**
   * @override
   * @export
   */
  canSkipNow() {
    return this.manager_.getAdSkippableState();
  }

  /**
   * @override
   * @export
   */
  skip() {
    return this.manager_.skip();
  }

  /**
   * @param {boolean} paused
   */
  setPaused(paused) {
    this.isPaused_ = paused;
  }

  /**
   * @override
   * @export
   */
  pause() {
    return this.manager_.pause();
  }

  /**
   * @override
   * @export
   */
  play() {
    return this.manager_.resume();
  }


  /**
   * @override
   * @export
   */
  getVolume() {
    return this.manager_.getVolume();
  }

  /**
   * @override
   * @export
   */
  setVolume(volume) {
    this.video_.volume = volume;
    return this.manager_.setVolume(volume);
  }

  /**
   * @override
   * @export
   */
  isMuted() {
    return this.manager_.getVolume() == 0;
  }

  /**
   * @override
   * @export
   */
  isLinear() {
    return this.ad_.isLinear();
  }


  /**
   * @override
   * @export
   */
  resize(width, height) {
    this.manager_.resize(width, height);
  }

  /**
   * @override
   * @export
   */
  setMuted(muted) {
    this.video_.muted = muted;
    // Emulate the "mute" functionality, where current, pre-mute
    // volume is saved and can be restored on unmute.
    if (muted) {
      this.volume_ = this.getVolume();
      this.manager_.setVolume(0);
    } else {
      this.manager_.setVolume(this.volume_);
    }
  }

  /**
   * It's required for a muted ad to start when autoplaying.
   *
   * @param {number} videoVolume
   */
  setInitialMuted(videoVolume) {
    this.volume_ = videoVolume;
    this.manager_.setVolume(0);
  }

  /**
   * @override
   * @export
   */
  getSequenceLength() {
    const podInfo = this.ad_.getAdPodInfo();
    if (podInfo == null) {
      // No pod, just one ad.
      return 1;
    }

    return podInfo.getTotalAds();
  }

  /**
   * @override
   * @export
   */
  getPositionInSequence() {
    const podInfo = this.ad_.getAdPodInfo();
    if (podInfo == null) {
      // No pod, just one ad.
      return 1;
    }

    return podInfo.getAdPosition();
  }

  /**
   * @override
   * @export
   */
  getTitle() {
    return this.ad_.getTitle();
  }

  /**
   * @override
   * @export
   */
  getDescription() {
    return this.ad_.getDescription();
  }

  /**
   * @override
   * @export
   */
  getVastMediaBitrate() {
    return this.ad_.getVastMediaBitrate();
  }

  /**
   * @override
   * @export
   */
  getVastMediaHeight() {
    return this.ad_.getVastMediaHeight();
  }

  /**
   * @override
   * @export
   */
  getVastMediaWidth() {
    return this.ad_.getVastMediaWidth();
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
    return this.ad_.getAdId();
  }

  /**
   * @override
   * @export
   */
  getCreativeAdId() {
    return this.ad_.getCreativeAdId();
  }

  /**
   * @override
   * @export
   */
  getAdvertiserName() {
    return this.ad_.getAdvertiserName();
  }

  /**
   * @override
   * @export
   */
  getMediaUrl() {
    return this.ad_.getMediaUrl();
  }

  /**
   * @override
   * @export
   */
  getTimeOffset() {
    const podInfo = this.ad_.getAdPodInfo();
    if (podInfo == null) {
      // Defaults to 0 if this ad is not part of a pod, or the pod is not part
      // of an ad playlist.
      return 0;
    }

    return podInfo.getTimeOffset();
  }

  /**
   * @override
   * @export
   */
  getPodIndex() {
    const podInfo = this.ad_.getAdPodInfo();
    if (podInfo == null) {
      // Defaults to 0 if this ad is not part of a pod, or the pod is not part
      // of an ad playlist.
      return 0;
    }

    return podInfo.getPodIndex();
  }

  /**
   * @override
   * @export
   */
  release() {
    this.ad_ = null;
    this.manager_ = null;
  }
};
