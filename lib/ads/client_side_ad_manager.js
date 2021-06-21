/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 * @suppress {missingRequire} TODO(b/152540451): this shouldn't be needed
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
   * @param {string} locale
   * @param {function(!shaka.util.FakeEvent)} onEvent
   */
  constructor(adContainer, video, locale, onEvent) {
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

    google.ima.settings.setLocale(locale);

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
        google.ima.AdErrorEvent.Type.AD_ERROR, (e) => {
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
    goog.asserts.assert(
        imaRequest.adTagUrl || imaRequest.adsResponse,
        'The ad tag needs to be set up before requesting ads, ' +
          'or adsResponse must be filled.');
    this.requestAdsStartTime_ = Date.now() / 1000;
    this.adsLoader_.requestAds(imaRequest);
  }

  /**
   * Stop all currently playing ads.
   */
  stop() {
    // this.imaAdsManager_ might not be set yet... if, for example, an ad
    // blocker prevented the ads from ever loading.
    if (this.imaAdsManager_) {
      this.imaAdsManager_.stop();
    }
    if (this.adContainer_) {
      shaka.util.Dom.removeAllChildren(this.adContainer_);
    }
  }

  /**
   * @param {!google.ima.AdErrorEvent} e
   * @private
   */
  onAdError_(e) {
    shaka.log.warning(
        'There was an ad error from the IMA SDK: ' + e.getError());
    shaka.log.warning('Resuming playback.');
    this.onAdComplete_(/* adEvent= */ null);
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

    this.onEvent_(new shaka.util.FakeEvent(
        shaka.ads.AdManager.IMA_AD_MANAGER_LOADED,
        {
          'imaAdManager': this.imaAdsManager_,
        }));

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

    this.addImaEventListeners_();

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
      this.onAdComplete_(/* adEvent= */ null);
    }
  }


  /**
   * @private
   */
  addImaEventListeners_() {
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
        google.ima.AdEvent.Type.FIRST_QUARTILE, (e) => {
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_FIRST_QUARTILE,
                  {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.MIDPOINT, (e) => {
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_MIDPOINT,
                  {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.THIRD_QUARTILE, (e) => {
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_THIRD_QUARTILE,
                  {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.COMPLETE, (e) => {
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_COMPLETE,
                  {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, (e) => {
          this.onAdComplete_(/** @type {!google.ima.AdEvent} */ (e));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.ALL_ADS_COMPLETED, (e) => {
          this.onAdComplete_(/** @type {!google.ima.AdEvent} */ (e));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.SKIPPED, (e) => {
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_SKIPPED,
                  {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.VOLUME_CHANGED, (e) => {
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_VOLUME_CHANGED,
                  {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.VOLUME_MUTED, (e) => {
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_MUTED,
                  {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.PAUSED, (e) => {
          goog.asserts.assert(this.ad_ != null, 'Ad should not be null!');
          this.ad_.setPaused(true);
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_PAUSED,
                  {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.RESUMED, (e) => {
          goog.asserts.assert(this.ad_ != null, 'Ad should not be null!');
          this.ad_.setPaused(false);
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_RESUMED,
                  {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.SKIPPABLE_STATE_CHANGED, (e) => {
          goog.asserts.assert(this.ad_ != null, 'Ad should not be null!');
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.AD_SKIP_STATE_CHANGED,
              {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.CLICK, (e) => {
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.AD_CLICKED,
              {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.AD_PROGRESS, (e) => {
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.AD_PROGRESS,
              {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.AD_BUFFERING, (e) => {
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.AD_BUFFERING,
              {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.IMPRESSION, (e) => {
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.AD_IMPRESSION,
              {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.DURATION_CHANGE, (e) => {
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.AD_DURATION_CHANGED,
              {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.USER_CLOSE, (e) => {
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.AD_CLOSED,
              {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.LOADED, (e) => {
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.AD_LOADED,
              {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.ALL_ADS_COMPLETED, (e) => {
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.ALL_ADS_COMPLETED,
              {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.LINEAR_CHANGED, (e) => {
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.AD_LINEAR_CHANGED,
              {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.AD_METADATA, (e) => {
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.AD_METADATA,
              {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.LOG, (e) => {
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.AD_RECOVERABLE_ERROR,
              {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.AD_BREAK_READY, (e) => {
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.AD_BREAK_READY,
              {'originalEvent': e}));
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.INTERACTION, (e) => {
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.AD_INTERACTION,
              {'originalEvent': e}));
        });
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
        {
          'ad': this.ad_,
          'sdkAdObject': imaAd,
          'originalEvent': e,
        }));
    this.adContainer_.setAttribute('ad-active', 'true');
    this.video_.pause();
  }

  /**
   * @param {?google.ima.AdEvent} e
   * @private
   */
  onAdComplete_(e) {
    this.onEvent_(new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STOPPED,
        {'originalEvent': e}));
    this.adContainer_.removeAttribute('ad-active');
    this.video_.play();
  }
};
