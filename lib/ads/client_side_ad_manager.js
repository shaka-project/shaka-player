/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ads.ClientSideAdManager');

goog.require('goog.asserts');
goog.require('shaka.ads.ClientSideAd');


/**
 * A class responsible for client-side ad interactions.
 */
shaka.ads.ClientSideAdManager = class {
  /**
   * @param {HTMLElement} adContainer
   * @param {HTMLMediaElement} video
   * @param {function(!shaka.util.FakeEvent)} onEvent
   */
  constructor(adContainer, video, onEvent) {
    /** @private {HTMLElement} */
    this.adContainer_ = adContainer;

    /** @private {HTMLMediaElement} */
    this.video_ = video;

    /** @private {number} */
    this.requestAdsStartTime_ = NaN;

    /** @private {function(!shaka.util.FakeEvent)} */
    this.onEvent_ = onEvent;

    /** @private {shaka.ads.ClientSideAd} */
    this.ad_ = null;

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    const adDisplayContainer = new google.ima.AdDisplayContainer(
        this.adContainer_,
        this.video_);

    // TODO: IMA: Must be done as the result of a user action on mobile
    adDisplayContainer.initialize();

    // IMA: This instance should be re-used for the entire lifecycle of
    // the page.
    this.adsLoader_ = new google.ima.AdsLoader(adDisplayContainer);

    this.adsLoader_.getSettings().setPlayerType('shaka-player');
    this.adsLoader_.getSettings().setPlayerVersion(shaka.Player.version);

    /** @private {google.ima.AdsManager} */
    this.imaAdsManager_ = null;

    this.eventManager_.listenOnce(this.adsLoader_,
        google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (e) => {
          this.onAdsManagerLoaded_(
              /** @type {!google.ima.AdsManagerLoadedEvent} */ (e));
        });

    this.eventManager_.listen(this.adsLoader_,
        google.ima.AdEvent.Type.AD_ERROR, (e) => {
          this.onAdError_( /** @type {!google.ima.AdErrorEvent} */ (e));
        });

    // Notify the SDK when the video has ended, so it can play post-roll ads.
    this.video_.onended = () => {
      this.adsLoader_.contentComplete();
    };
  }

  /**
   * @param {!google.ima.AdsRequest} imaRequest
   */
  requestAds(imaRequest) {
    goog.asserts.assert(imaRequest.adTagUrl.length,
        'The ad tag needs to be set up before requesting ads.');
    this.requestAdsStartTime_ = Date.now() / 1000;
    this.adsLoader_.requestAds(imaRequest);
  }

  /**
   * Stop all currently playing ads.
   */
  stop() {
    this.imaAdsManager_.stop();
  }


  /**
   * @return {shaka.ads.ClientSideAd} The current AD.
   */
  getCurrentAd() {
    return this.ad_;
  }

  /**
   * @param {!google.ima.AdErrorEvent} e
   * @private
   */
  onAdError_(e) {
    shaka.log.warning(
        'There was an ad error from the IMA SDK: ' + e.getError());
    shaka.log.warning('Resuming playback.');
    this.onAdComplete_();
    // Remove ad breaks from the timeline
    this.onEvent_(
        new shaka.util.FakeEvent(shaka.ads.AdManager.CUEPOINTS_CHANGED,
            {'cuepoints': []}));
  }


  /**
   * @param {!google.ima.AdsManagerLoadedEvent} e
   * @private
   */
  onAdsManagerLoaded_(e) {
    goog.asserts.assert(this.video_ != null, 'Video should not be null!');

    const now = Date.now() / 1000;
    const loadTime = now - this.requestAdsStartTime_;
    this.onEvent_(
        new shaka.util.FakeEvent(shaka.ads.AdManager.ADS_LOADED,
            {'loadTime': loadTime}));

    this.imaAdsManager_ = e.getAdsManager(this.video_);

    const cuePointStarts = this.imaAdsManager_.getCuePoints();
    if (cuePointStarts.length) {
      /** @type {!Array.<!shaka.ads.CuePoint>} */
      const cuePoints = [];
      for (const start of cuePointStarts) {
        const shakaCuePoint = new shaka.ads.CuePoint(start);
        cuePoints.push(shakaCuePoint);
      }

      this.onEvent_(
          new shaka.util.FakeEvent(shaka.ads.AdManager.CUEPOINTS_CHANGED,
              {'cuepoints': cuePoints}));
    }

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdErrorEvent.Type.AD_ERROR, (error) => {
          this.onAdError_(/** @type {!google.ima.AdErrorEvent} */ (error));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, (e) => {
          this.onAdStart_(/** @type {!google.ima.AdEvent} */ (e));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.STARTED, (e) => {
          this.onAdStart_(/** @type {!google.ima.AdEvent} */ (e));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.FIRST_QUARTILE, () => {
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_FIRST_QUARTILE));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.MIDPOINT, () => {
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_MIDPOINT));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.THIRD_QUARTILE, () => {
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_THIRD_QUARTILE));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.COMPLETE, () => {
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_COMPLETE));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, () => {
          this.onAdComplete_();
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.ALL_ADS_COMPLETED, () => {
          this.onAdComplete_();
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.SKIPPED, () => {
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_SKIPPED));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.VOLUME_CHANGED, () => {
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_VOLUME_CHANGED));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.VOLUME_MUTED, () => {
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_MUTED));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.PAUSED, () => {
          goog.asserts.assert(this.ad_ != null, 'Ad should not be null!');
          this.ad_.setPaused(true);
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_PAUSED));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.RESUMED, () => {
          goog.asserts.assert(this.ad_ != null, 'Ad should not be null!');
          this.ad_.setPaused(false);
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_RESUMED));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.SKIPPABLE_STATE_CHANGED, () => {
          goog.asserts.assert(this.ad_ != null, 'Ad should not be null!');
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.AD_SKIP_STATE_CHANGED));
        });

    try {
      const viewMode = document.fullscreenElement ?
          google.ima.ViewMode.FULLSCREEN : google.ima.ViewMode.NORMAL;

      this.imaAdsManager_.init(this.video_.offsetWidth,
          this.video_.offsetHeight, viewMode);

      // Wait on the 'loadeddata' event rather than the 'loadedmetadata' event
      // because 'loadedmetadata' is sometimes called before the video resizes
      // on some platforms (e.g. Safari).
      this.eventManager_.listen(this.video_, 'loadeddata', () => {
        const viewMode = document.fullscreenElement ?
            google.ima.ViewMode.FULLSCREEN : google.ima.ViewMode.NORMAL;
        this.imaAdsManager_.resize(this.video_.offsetWidth,
            this.video_.offsetHeight, viewMode);
      });

      // Single video and overlay ads will start at this time
      // TODO (ismena): Need a better inderstanding of what this does.
      // The docs say it's called to 'start playing the ads,' but I haven't
      // seen the ads actually play until requestAds() is called.
      this.imaAdsManager_.start();
    } catch (adError) {
      // If there was a problem with the VAST response,
      // we we won't be getting an ad. Hide ad UI if we showed it already
      // and get back to the presentation.
      this.onAdComplete_();
    }
  }

  /**
   * @param {!google.ima.AdEvent} e
   * @private
   */
  onAdStart_(e) {
    goog.asserts.assert(this.imaAdsManager_,
        'Should have an ads manager at this point!');

    const imaAd = e.getAd();
    this.ad_ = new shaka.ads.ClientSideAd(imaAd, this.imaAdsManager_);
    this.onEvent_(new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STARTED,
        {'ad': this.ad_}));
    this.adContainer_.setAttribute('ad-active', 'true');
    this.video_.pause();
  }

  /** @private */
  onAdComplete_() {
    this.onEvent_(new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STOPPED));
    this.adContainer_.removeAttribute('ad-active');
    this.video_.play();
  }
};
