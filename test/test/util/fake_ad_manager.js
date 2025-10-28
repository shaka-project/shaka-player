/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @implements {shaka.extern.IAdManager}
 * @final
 */
shaka.test.FakeAdManager = class extends shaka.util.FakeEventTarget {
  constructor() {
    super();

    /** @private {shaka.ads.AdsStats} */
    this.stats_ = new shaka.ads.AdsStats();

    /** @private {?shaka.extern.IAd} */
    this.currentAd_ = null;
  }

  /** @override */
  release() {}

  /** @override */
  setLocale(locale) {}

  /** @override */
  configure(config) {}

  /** @override */
  initInterstitial(adContainer, basePlayer, baseVideo) {}

  /** @override */
  initClientSide(adContainer, video, adsRenderingSettings) {}

  /** @override */
  onAssetUnload() {}

  /** @override */
  requestClientSideAds(imaRequest) {
    return Promise.resolve('fake:url');
  }

  /** @override */
  updateClientSideAdsRenderingSettings(adsRenderingSettings) {}

  /** @override */
  initMediaTailor(networkingEngine, video) {}

  /** @override */
  requestMediaTailorStream(url, adsParams, backupUrl) {
    return Promise.resolve('fake:url');
  }

  /** @override */
  addMediaTailorTrackingUrl(url) {}

  /** @override */
  initServerSide(adContainer, video) {}

  /** @override */
  requestServerSideStream(imaRequest, backupUrl = '') {
    return Promise.resolve('fake:url');
  }

  /** @override */
  replaceServerSideAdTagParameters(adTagParameters) {}

  /** @override */
  getCuePoints() {
    return [];
  }

  /** @override */
  getStats() {
    return this.stats_;
  }

  /** @override */
  onManifestUpdated(isLive) {}

  /** @override */
  onDashTimedMetadata(region) {}

  /** @override */
  onHlsTimedMetadata(metadata) {}

  /** @override */
  onCueMetadataChange(data) {}

  /** @override */
  onHLSMetadata(basePlayer, baseVideo, metadata) {}

  /** @override */
  onDASHMetadata(basePlayer, baseVideo, region) {}

  /** @override */
  addCustomInterstitial(interstitial) {}

  /** @override */
  addAdUrlInterstitial(url) {}

  /** @override */
  getInterstitialPlayer() {}

  /** @override */
  getCurrentAd() {
    return this.currentAd_;
  }

  /**
   * @param {!shaka.test.FakeAd} ad
   */
  startAd(ad) {
    this.currentAd_ = ad;
    const event = new shaka.util.FakeEvent(shaka.ads.Utils.AD_STARTED,
        (new Map()).set('ad', ad));

    this.dispatchEvent(event);
  }

  /** @public */
  finishAd() {
    this.currentAd_ = null;
    const event = new shaka.util.FakeEvent(shaka.ads.Utils.AD_STOPPED);
    this.dispatchEvent(event);
  }

  /** @public */
  changeSkipState() {
    const event =
        new shaka.util.FakeEvent(shaka.ads.Utils.AD_SKIP_STATE_CHANGED);
    this.dispatchEvent(event);
  }
};
