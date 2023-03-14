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
goog.require('shaka.util.IReleasable');

/**
 * A class responsible for client-side ad interactions.
 * @implements {shaka.util.IReleasable}
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

    /** @private {?shaka.extern.AdsConfiguration} */
    this.config_ = null;

    /** @private {ResizeObserver} */
    this.resizeObserver_ = null;

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
    this.eventManager_.listen(this.video_, 'ended', () => {
      this.adsLoader_.contentComplete();
    });
  }

  /**
   * Called by the AdManager to provide an updated configuration any time it
   * changes.
   *
   * @param {shaka.extern.AdsConfiguration} config
   */
  configure(config) {
    this.config_ = config;
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

  /** @override */
  release() {
    this.stop();
    if (this.resizeObserver_) {
      this.resizeObserver_.disconnect();
    }
    if (this.eventManager_) {
      this.eventManager_.release();
    }
    if (this.imaAdsManager_) {
      this.imaAdsManager_.destroy();
    }
    this.adsLoader_.destroy();
  }

  /**
   * @param {!google.ima.AdErrorEvent} e
   * @private
   */
  onAdError_(e) {
    shaka.log.warning(
        'There was an ad error from the IMA SDK: ' + e.getError());
    shaka.log.warning('Resuming playback.');

    const data = (new Map()).set('originalEvent', e);
    this.onEvent_(new shaka.util.FakeEvent(shaka.ads.AdManager.AD_ERROR, data));

    this.onAdComplete_(/* adEvent= */ null);
    // Remove ad breaks from the timeline
    this.onEvent_(
        new shaka.util.FakeEvent(shaka.ads.AdManager.CUEPOINTS_CHANGED,
            (new Map()).set('cuepoints', [])));
  }


  /**
   * @param {!google.ima.AdsManagerLoadedEvent} e
   * @private
   */
  onAdsManagerLoaded_(e) {
    goog.asserts.assert(this.video_ != null, 'Video should not be null!');

    const now = Date.now() / 1000;
    const loadTime = now - this.requestAdsStartTime_;
    this.onEvent_(new shaka.util.FakeEvent(shaka.ads.AdManager.ADS_LOADED,
        (new Map()).set('loadTime', loadTime)));

    this.imaAdsManager_ = e.getAdsManager(this.video_);

    this.onEvent_(new shaka.util.FakeEvent(
        shaka.ads.AdManager.IMA_AD_MANAGER_LOADED,
        (new Map()).set('imaAdManager', this.imaAdsManager_)));

    const cuePointStarts = this.imaAdsManager_.getCuePoints();
    if (cuePointStarts.length) {
      /** @type {!Array.<!shaka.extern.AdCuePoint>} */
      const cuePoints = [];
      for (const start of cuePointStarts) {
        /** @type {shaka.extern.AdCuePoint} */
        const shakaCuePoint = {
          start: start,
          end: null,
        };
        cuePoints.push(shakaCuePoint);
      }

      this.onEvent_(new shaka.util.FakeEvent(
          shaka.ads.AdManager.CUEPOINTS_CHANGED,
          (new Map()).set('cuepoints', cuePoints)));
    }

    this.addImaEventListeners_();

    try {
      const viewMode = this.isFullScreenEnabled_() ?
          google.ima.ViewMode.FULLSCREEN : google.ima.ViewMode.NORMAL;

      this.imaAdsManager_.init(this.video_.offsetWidth,
          this.video_.offsetHeight, viewMode);

      // Wait on the 'loadeddata' event rather than the 'loadedmetadata' event
      // because 'loadedmetadata' is sometimes called before the video resizes
      // on some platforms (e.g. Safari).
      this.eventManager_.listen(this.video_, 'loadeddata', () => {
        const viewMode = this.isFullScreenEnabled_() ?
            google.ima.ViewMode.FULLSCREEN : google.ima.ViewMode.NORMAL;
        this.imaAdsManager_.resize(this.video_.offsetWidth,
            this.video_.offsetHeight, viewMode);
      });

      if ('ResizeObserver' in window) {
        this.resizeObserver_ = new ResizeObserver(() => {
          const viewMode = this.isFullScreenEnabled_() ?
              google.ima.ViewMode.FULLSCREEN : google.ima.ViewMode.NORMAL;
          this.imaAdsManager_.resize(this.video_.offsetWidth,
              this.video_.offsetHeight, viewMode);
        });
        this.resizeObserver_.observe(this.video_);
      } else {
        this.eventManager_.listen(document, 'fullscreenchange', () => {
          const viewMode = this.isFullScreenEnabled_() ?
              google.ima.ViewMode.FULLSCREEN : google.ima.ViewMode.NORMAL;
          this.imaAdsManager_.resize(this.video_.offsetWidth,
              this.video_.offsetHeight, viewMode);
        });
      }

      // Single video and overlay ads will start at this time
      // TODO (ismena): Need a better inderstanding of what this does.
      // The docs say it's called to 'start playing the ads,' but I haven't
      // seen the ads actually play until requestAds() is called.
      // Note: We listen for a play event to avoid autoplay issues that might
      // crash IMA.
      this.eventManager_.listenOnce(this.video_, 'play', () => {
        this.imaAdsManager_.start();
      });
    } catch (adError) {
      // If there was a problem with the VAST response,
      // we we won't be getting an ad. Hide ad UI if we showed it already
      // and get back to the presentation.
      this.onAdComplete_(/* adEvent= */ null);
    }
  }


  /**
   * @return {boolean}
   * @private
   */
  isFullScreenEnabled_() {
    if (document.fullscreenEnabled) {
      return !!document.fullscreenElement;
    } else {
      const video = /** @type {HTMLVideoElement} */(this.video_);
      if (video.webkitSupportsFullscreen) {
        return video.webkitDisplayingFullscreen;
      }
    }
    return false;
  }


  /**
   * @private
   */
  addImaEventListeners_() {
    /**
     * @param {!Event} e
     * @param {string} type
     */
    const convertEventAndSend = (e, type) => {
      const data = (new Map()).set('originalEvent', e);
      this.onEvent_(new shaka.util.FakeEvent(type, data));
    };

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
          convertEventAndSend(e, shaka.ads.AdManager.AD_FIRST_QUARTILE);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.MIDPOINT, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_MIDPOINT);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.THIRD_QUARTILE, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_THIRD_QUARTILE);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.COMPLETE, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_COMPLETE);
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
          convertEventAndSend(e, shaka.ads.AdManager.AD_SKIPPED);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.VOLUME_CHANGED, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_VOLUME_CHANGED);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.VOLUME_MUTED, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_MUTED);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.PAUSED, (e) => {
          if (this.ad_) {
            this.ad_.setPaused(true);
            convertEventAndSend(e, shaka.ads.AdManager.AD_PAUSED);
          }
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.RESUMED, (e) => {
          if (this.ad_) {
            this.ad_.setPaused(false);
            convertEventAndSend(e, shaka.ads.AdManager.AD_RESUMED);
          }
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.SKIPPABLE_STATE_CHANGED, (e) => {
          if (this.ad_) {
            convertEventAndSend(e, shaka.ads.AdManager.AD_SKIP_STATE_CHANGED);
          }
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.CLICK, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_CLICKED);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.AD_PROGRESS, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_PROGRESS);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.AD_BUFFERING, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_BUFFERING);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.IMPRESSION, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_IMPRESSION);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.DURATION_CHANGE, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_DURATION_CHANGED);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.USER_CLOSE, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_CLOSED);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.LOADED, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_LOADED);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.ALL_ADS_COMPLETED, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.ALL_ADS_COMPLETED);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.LINEAR_CHANGED, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_LINEAR_CHANGED);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.AD_METADATA, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_METADATA);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.LOG, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_RECOVERABLE_ERROR);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.AD_BREAK_READY, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_BREAK_READY);
        });

    this.eventManager_.listen(this.imaAdsManager_,
        google.ima.AdEvent.Type.INTERACTION, (e) => {
          convertEventAndSend(e, shaka.ads.AdManager.AD_INTERACTION);
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
    if (!imaAd) {
      // Sometimes the IMA SDK will fire a CONTENT_PAUSE_REQUESTED or STARTED
      // event with no associated ad object.
      // We can't really play an ad in that situation, so just ignore the event.
      shaka.log.alwaysWarn(
          'The IMA SDK fired a ' + e.type + ' event with no associated ad. ' +
          'Unable to play ad!');
      return;
    }

    this.ad_ = new shaka.ads.ClientSideAd(imaAd,
        this.imaAdsManager_, this.video_);
    const data = new Map()
        .set('ad', this.ad_)
        .set('sdkAdObject', imaAd)
        .set('originalEvent', e);
    this.onEvent_(new shaka.util.FakeEvent(
        shaka.ads.AdManager.AD_STARTED, data));
    if (this.ad_.isLinear()) {
      this.adContainer_.setAttribute('ad-active', 'true');
      this.video_.pause();
      this.ad_.setVolume(this.video_.muted ? 0 : this.video_.volume);
    }
  }

  /**
   * @param {?google.ima.AdEvent} e
   * @private
   */
  onAdComplete_(e) {
    this.onEvent_(new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STOPPED,
        (new Map()).set('originalEvent', e)));
    if (this.ad_ && this.ad_.isLinear()) {
      this.adContainer_.removeAttribute('ad-active');
      if (!this.video_.ended) {
        this.video_.play();
      }
    }
  }
};
