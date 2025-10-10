/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.ClientSideAd');

goog.require('shaka.ads.AbstractAd');
goog.require('shaka.util.EventManager');


/**
 * @export
 */
shaka.ads.ClientSideAd = class extends shaka.ads.AbstractAd {
  /**
   * @param {!google.ima.Ad} imaAd
   * @param {!google.ima.AdsManager} imaAdManager
   * @param {HTMLMediaElement} video
   */
  constructor(imaAd, imaAdManager, video) {
    super(video);

    /** @private {google.ima.Ad} */
    this.ad_ = imaAd;

    /** @private {google.ima.AdsManager} */
    this.manager_ = imaAdManager;


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
   */
  needsSkipUI() {
    return false;
  }

  /**
   * @override
   */
  hasCustomClick() {
    return true;
  }

  /**
   * @override
   */
  isUsingAnotherMediaElement() {
    return true;
  }

  /**
   * @override
   */
  getDuration() {
    return this.ad_.getDuration();
  }

  /**
   * @override
   */
  getMinSuggestedDuration() {
    return this.ad_.getMinSuggestedDuration();
  }

  /**
   * @override
   */
  getRemainingTime() {
    return this.manager_.getRemainingTime();
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
    // IMA returns -1 for non-skippable ads. Any positive number is a genuine
    // skip offset, meaning the ad is skippable.
    return this.ad_.getSkipTimeOffset() >= 0;
  }

  /**
   * @override
   */
  getTimeUntilSkippable() {
    const skipOffset = this.ad_.getSkipTimeOffset();
    const canSkipIn = this.getRemainingTime() - skipOffset;
    return Math.max(canSkipIn, 0);
  }

  /**
   * @override
   */
  canSkipNow() {
    return this.manager_.getAdSkippableState();
  }

  /**
   * @override
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
   */
  pause() {
    return this.manager_.pause();
  }

  /**
   * @override
   */
  play() {
    return this.manager_.resume();
  }


  /**
   * @override
   */
  getVolume() {
    return this.manager_.getVolume();
  }

  /**
   * @override
   */
  setVolume(volume) {
    this.video.volume = volume;
    return this.manager_.setVolume(volume);
  }

  /**
   * @override
   */
  isMuted() {
    return this.manager_.getVolume() == 0;
  }

  /**
   * @override
   */
  isLinear() {
    return this.ad_.isLinear();
  }


  /**
   * @override
   */
  resize(width, height) {
    this.manager_.resize(width, height);
  }

  /**
   * @override
   */
  setMuted(muted) {
    this.video.muted = muted;
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
   */
  getTitle() {
    return this.ad_.getTitle();
  }

  /**
   * @override
   */
  getDescription() {
    return this.ad_.getDescription();
  }

  /**
   * @override
   */
  getVastMediaBitrate() {
    return this.ad_.getVastMediaBitrate();
  }

  /**
   * @override
   */
  getVastMediaHeight() {
    return this.ad_.getVastMediaHeight();
  }

  /**
   * @override
   */
  getVastMediaWidth() {
    return this.ad_.getVastMediaWidth();
  }

  /**
   * @override
   */
  getAdId() {
    return this.ad_.getAdId();
  }

  /**
   * @override
   */
  getCreativeAdId() {
    return this.ad_.getCreativeAdId();
  }

  /**
   * @override
   */
  getAdvertiserName() {
    return this.ad_.getAdvertiserName();
  }

  /**
   * @override
   */
  getMediaUrl() {
    return this.ad_.getMediaUrl();
  }

  /**
   * @override
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
   */
  release() {
    this.ad_ = null;
    this.manager_ = null;
  }
};
