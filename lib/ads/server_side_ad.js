/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.ServerSideAd');

goog.require('shaka.ads.AbstractAd');

/**
 * @export
 */
shaka.ads.ServerSideAd = class extends shaka.ads.AbstractAd {
  /**
   * @param {google.ima.dai.api.Ad} imaAd
   * @param {HTMLMediaElement} video
   */
  constructor(imaAd, video) {
    super(video);

    /** @private {google.ima.dai.api.Ad} */
    this.ad_ = imaAd;

    /** @private {?google.ima.dai.api.AdProgressData} */
    this.adProgressData_ = null;
  }


  /**
   * @param {google.ima.dai.api.AdProgressData} data
   */
  setProgressData(data) {
    this.adProgressData_ = data;
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
  hasCustomClick() {
    return true;
  }

  /**
   * @override
   */
  getDuration() {
    if (!this.adProgressData_) {
      // Unknown yet
      return -1;
    }
    return this.adProgressData_.duration;
  }

  /**
   * @override
   */
  getRemainingTime() {
    if (!this.adProgressData_) {
      // Unknown yet
      return -1;
    }

    return this.adProgressData_.duration - this.adProgressData_.currentTime;
  }

  /**
   * @override
   */
  isSkippable() {
    return this.ad_.isSkippable();
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
    return this.getTimeUntilSkippable() == 0;
  }

  /**
   * @override
   */
  skip() {
    this.video.currentTime += this.getRemainingTime();
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
    this.adProgressData_ = null;
  }
};
