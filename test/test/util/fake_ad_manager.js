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
  setLocale(locale) {}

  /** @override */
  setContainers(clientSideAdContainer, serverSideAdContainer) {}

  /** @override */
  configure(config) {}

  /** @override */
  release() {}

  /** @override */
  onAssetUnload() {}

  /** @override */
  requestClientSideAds(imaRequest, adsRenderingSettings) {
    return Promise.resolve('fake:url');
  }

  /** @override */
  updateClientSideAdsRenderingSettings(adsRenderingSettings) {}

  /** @override */
  requestServerSideStream(imaRequest, backupUrl = '') {
    return Promise.resolve('fake:url');
  }

  /** @override */
  replaceServerSideAdTagParameters(adTagParameters) {}

  /** @override */
  requestMediaTailorStream(url, adsParams, backupUrl) {
    return Promise.resolve('fake:url');
  }

  /** @override */
  addMediaTailorTrackingUrl(url) {}

  /** @override */
  addCustomInterstitial(interstitial) {}

  /** @override */
  addAdUrlInterstitial(url) {}

  /** @override */
  getInterstitialPlayer() {}

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
  onHlsTimedMetadata(metadata) {}

  /** @override */
  onCueMetadataChange(data) {}

  /** @override */
  onHLSMetadata(metadata) {}

  /** @override */
  onDASHMetadata(region) {}

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
