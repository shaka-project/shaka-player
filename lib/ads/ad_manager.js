/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.AdManager');

goog.require('goog.asserts');
goog.require('shaka.Player');
goog.require('shaka.ads.AdsStats');
goog.require('shaka.ads.ClientSideAdManager');
goog.require('shaka.ads.InterstitialAdManager');
goog.require('shaka.ads.MediaTailorAdManager');
goog.require('shaka.ads.ServerSideAdManager');
goog.require('shaka.ads.SvtaAdManager');
goog.require('shaka.ads.Utils');
goog.require('shaka.log');
goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.TXml');


/**
 * @event shaka.ads.AdManager.AdsLoadedEvent
 * @description Fired when a sequence of ads has been loaded.
 * @property {string} type
 *   'ads-loaded'
 * @property {number} loadTime
 *    The time it takes to load ads.
 * @exportDoc
 */

/**
 * @event shaka.ads.AdManager.AdStartedEvent
 * @description Fired when an ad has started playing.
 * @property {string} type
 *   'ad-started'
 * @property {!shaka.extern.IAd} ad
 *    The ad that has started playing.
 * @property {Object} sdkAdObject
 *    The ad object in the SDK format, if there is one.
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdCompleteEvent
 * @description Fired when an ad has played through.
 * @property {string} type
 *   'ad-complete'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdSkippedEvent
 * @description Fired when an ad has been skipped.
 * @property {string} type
 *   'ad-skipped'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdFirstQuartileEvent
 * @description Fired when an ad has played through the first 1/4.
 * @property {string} type
 *   'ad-first-quartile'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdMidpointEvent
 * @description Fired when an ad has played through its midpoint.
 * @property {string} type
 *   'ad-midpoint'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdThirdQuartileEvent
 * @description Fired when an ad has played through the third quartile.
 * @property {string} type
 *   'ad-third-quartile'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdStoppedEvent
 * @description Fired when an ad has stopped playing, was skipped,
 *   or was unable to proceed due to an error.
 * @property {string} type
 *   'ad-stopped'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdVolumeChangedEvent
 * @description Fired when an ad's volume changed.
 * @property {string} type
 *   'ad-volume-changed'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdMutedEvent
 * @description Fired when an ad was muted.
 * @property {string} type
 *   'ad-muted'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdPausedEvent
 * @description Fired when an ad was paused.
 * @property {string} type
 *   'ad-paused'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdResumedEvent
 * @description Fired when an ad was resumed after a pause.
 * @property {string} type
 *   'ad-resumed'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdSkipStateChangedEvent
 * @description Fired when an ad's skip state changes (for example, when
 *  it becomes possible to skip the ad).
 * @property {string} type
 *   'ad-skip-state-changed'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdCuePointsChangedEvent
 * @description Fired when the ad cue points change, signalling ad breaks
 *  change.
 * @property {string} type
 *   'ad-cue-points-changed'
 * @property {!Array<!shaka.extern.AdCuePoint>} cuepoints
 *    The ad cue points, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdProgressEvent
 * @description Fired when there is an update to the current ad's progress.
 * @property {string} type
 *   'ad-progress'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdBufferingEvent
 * @description Fired when the ad has stalled playback to buffer.
 * @property {string} type
 *   'ad-buffering'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdImpressionEvent
 * @description Fired when the impression URL has been pinged.
 * @property {string} type
 *   'ad-impression'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdClickEvent
 * @description Fired when the ad was clicked.
 * @property {string} type
 *   'ad-clicked'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdDurationChangedEvent
 * @description Fired when the ad's duration changes.
 * @property {string} type
 *   'ad-duration-changed'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdClosedEvent
 * @description Fired when the ad was closed by the user.
 * @property {string} type
 *   'ad-closed'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdLoadedEvent
 * @description Fired when the ad data becomes available.
 * @property {string} type
 *   'ad-loaded'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AllAdsCompletedEvent
 * @description Fired when the ads manager is done playing all the ads.
 * @property {string} type
 *   'all-ads-completed'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdLinearChangedEvent
 * @description Fired when the displayed ad changes from
 *   linear to nonlinear, or vice versa.
 * @property {string} type
 *   'ad-linear-changed'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdMetadataEvent
 * @description Fired when the ad's metadata becomes available.
 * @property {string} type
 *   'ad-metadata'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager#AdBreakReadyEvent
 * @description Fired when the client-side SDK is ready to play a
 *   VPAID ad or an ad rule.
 * @property {string} type
 *   'ad-break-ready'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager#AdBreakStartedEvent
 * @description Fired when ad manager starts an ad break.
 * @property {string} type
 *   'ad-break-started'
 * @property {number} timeOffset
 *    The time offset for the ad break.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager#AdBreakEndedEvent
 * @description Fired when ad manager ends an ad break.
 * @property {string} type
 *   'ad-break-ended'
 * @property {number} timeOffset
 *    The time offset for the ad break.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager#AdInterstitialPreloadEvent
 * @description Fired when the ad manager starts the preload of an interstitial.
 * @property {string} type
 *   'ad-interstitial-preload'
 * @property {shaka.extern.AdInterstitial} interstitial
 *    The interstitial to preload.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdRecoverableErrorEvent
 * @description Fired when the a non-fatal error was encountered.
 *   The presentation will continue with the same or next ad playback
 *   depending on the error situation.
 * @property {string} type
 *   'ad-recoverable-error'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.Utils.AD_ERROR
 * @description Fired when a fatal error is encountered.
 * @property {string} type
 *   'ad-error'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdInteractionEvent
 * @description Fired when an ad triggers the interaction callback.
 * @property {string} type
 *   'ad-interaction'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager#ImaAdManagerLoadedEvent
 * @description Fired when the native IMA ad manager becomes available.
 * @property {string} type
 *   'ima-ad-manager-loaded'
 * @property {!Object} imaAdManager
 *    The native IMA ad manager.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager#ImaStreamManagerLoadedEvent
 * @description Fired when the native IMA stream manager becomes available.
 * @property {string} type
 *   'ima-stream-manager-loaded'
 * @property {!Object} imaStreamManager
 *    The native IMA stream manager.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdClickedEvent
 * @description Fired when the ad was clicked.
 * @property {string} type
 *   'ad-clicked'
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdContentPauseRequestedEvent
 * @description Fired when the ad requires the main content to be paused.
 *   Fired when the platform does not support multiple media elements.
 * @property {string} type
 *   'ad-content-pause-requested'
 * @property {?boolean} saveLivePosition
 *    Indicates whether the live position has to be saved or not.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdContentResumeRequestedEvent
 * @description Fired when the ad requires the main content to be resumed.
 *   Fired when the platform does not support multiple media elements.
 * @property {string} type
 *   'ad-content-resume-requested'
 * @property {?number} offset
 *   Indicates the offset that should be applied to the previously saved time.
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdContentResumeRequestedEvent
 * @description Fired when the ad requires the video of the main content to be
 *   attached.
 * @property {string} type
 *   'ad-content-attach-requested'
 * @exportDoc
 */


/**
 * A class responsible for ad-related interactions.
 * @implements {shaka.extern.IAdManager}
 * @implements {shaka.util.IReleasable}
 * @export
 */
shaka.ads.AdManager = class extends shaka.util.FakeEventTarget {
  /**
   * @param {shaka.Player} player
   */
  constructor(player) {
    super();
    /** @private {?shaka.Player} */
    this.player_ = player;
    /** @private {shaka.ads.InterstitialAdManager} */
    this.interstitialAdManager_ = null;
    /** @private {shaka.ads.ClientSideAdManager} */
    this.csAdManager_ = null;
    /** @private {shaka.ads.MediaTailorAdManager} */
    this.mtAdManager_ = null;
    /** @private {shaka.ads.ServerSideAdManager} */
    this.ssAdManager_ = null;
    /** @private {shaka.ads.SvtaAdManager} */
    this.svtaAdManager_ = null;
    /** @private {shaka.ads.AdsStats} */
    this.stats_ = new shaka.ads.AdsStats();
    /** @private {string} locale */
    this.locale_ = navigator.language;
    /** @private {?shaka.extern.AdsConfiguration} */
    this.config_ = null;
    /** @private {?shaka.extern.IAd} */
    this.currentAd_ = null;
    /** @private {HTMLElement} */
    this.clientSideAdContainer_ = null;
    /** @private {HTMLElement} */
    this.serverSideAdContainer_ = null;
  }

  /**
   * @override
   * @export
   */
  setLocale(locale) {
    this.locale_ = locale;
  }

  /**
   * @override
   * @export
   */
  setContainers(clientSideAdContainer, serverSideAdContainer) {
    this.clientSideAdContainer_ = clientSideAdContainer;
    this.serverSideAdContainer_ = serverSideAdContainer;
  }

  /**
   * @override
   * @export
   */
  configure(config) {
    this.config_ = config;
    if (this.interstitialAdManager_) {
      this.interstitialAdManager_.configure(this.config_);
    }
    if (this.csAdManager_) {
      this.csAdManager_.configure(this.config_);
    }
    if (this.ssAdManager_) {
      this.ssAdManager_.configure(this.config_);
    }
    if (this.svtaAdManager_) {
      this.svtaAdManager_.configure(this.config_);
    }
    if (this.mtAdManager_) {
      this.mtAdManager_.configure(this.config_);
    }
  }

  /**
   * @override
   * @export
   */
  release() {
    if (this.csAdManager_) {
      this.csAdManager_.release();
      this.csAdManager_ = null;
    }
    if (this.ssAdManager_) {
      this.ssAdManager_.release();
      this.ssAdManager_ = null;
    }
    if (this.mtAdManager_) {
      this.mtAdManager_.release();
      this.mtAdManager_ = null;
    }
    if (this.interstitialAdManager_) {
      this.interstitialAdManager_.release();
      this.interstitialAdManager_ = null;
    }
    if (this.svtaAdManager_) {
      this.svtaAdManager_.release();
      this.svtaAdManager_ = null;
    }
    super.release();
  }

  /**
   * @override
   * @export
   */
  onAssetUnload() {
    // Because of the way IMA SDK works, it is necessary to recreate it when it
    // is necessary to reuse it in another asset.
    if (this.csAdManager_) {
      this.csAdManager_.release();
      this.csAdManager_ = null;
    }
    if (this.ssAdManager_) {
      this.ssAdManager_.stop();
    }
    if (this.mtAdManager_) {
      this.mtAdManager_.stop();
    }
    if (this.interstitialAdManager_) {
      this.interstitialAdManager_.stop();
    }
    if (this.svtaAdManager_) {
      this.svtaAdManager_.stop();
    }

    if (this.currentAd_) {
      this.processAndDispatchEvent_(
          new shaka.util.FakeEvent(shaka.ads.Utils.AD_STOPPED));
      this.processAndDispatchEvent_(new shaka.util.FakeEvent(
          shaka.ads.Utils.AD_CONTENT_ATTACH_REQUESTED));
    }

    this.stats_ = new shaka.ads.AdsStats();
  }

  /**
   * @param {?google.ima.AdsRenderingSettings} adsRenderingSettings
   * @private
   */
  initClientSide_(adsRenderingSettings) {
    // Check that Client Side IMA SDK has been included
    // NOTE: (window['google'] && google.ima) check for any
    // IMA SDK, including SDK for Server Side ads.
    // The 3rd check insures we have the right SDK:
    // {google.ima.AdsLoader} is an object that's part of CS IMA SDK
    // but not SS SDK.
    if (!window['google'] || !google.ima || !google.ima.AdsLoader) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.ADS,
          shaka.util.Error.Code.CS_IMA_SDK_MISSING);
    }

    if (this.csAdManager_) {
      this.csAdManager_.release();
    }

    if (!this.clientSideAdContainer_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.ADS,
          shaka.util.Error.Code.CS_AD_CONTAINER_MISSING);
    }

    const video = this.player_.getMediaElement();
    goog.asserts.assert(video, 'Video must not be null!');
    this.csAdManager_ = new shaka.ads.ClientSideAdManager(
        this.clientSideAdContainer_, video, this.locale_, adsRenderingSettings,
        (e) => this.processAndDispatchEvent_(e));

    goog.asserts.assert(this.config_, 'Config must not be null!');
    this.csAdManager_.configure(this.config_);
  }

  /**
   * @override
   * @export
   */
  requestClientSideAds(imaRequest, adsRenderingSettings) {
    if (!this.csAdManager_) {
      this.initClientSide_(adsRenderingSettings);
    }

    this.csAdManager_.requestAds(imaRequest);
  }

  /**
   * @override
   * @export
   */
  updateClientSideAdsRenderingSettings(adsRenderingSettings) {
    if (!this.csAdManager_) {
      this.initClientSide_(adsRenderingSettings);
    }

    this.csAdManager_.updateAdsRenderingSettings(adsRenderingSettings);
  }

  /**
   * @private
   */
  initServerSide_() {
    // Check that Client Side IMA SDK has been included
    // NOTE: (window['google'] && google.ima) check for any
    // IMA SDK, including SDK for Server Side ads.
    // The 3rd check insures we have the right SDK:
    // {google.ima.dai} is an object that's part of DAI IMA SDK
    // but not SS SDK.
    if (!window['google'] || !google.ima || !google.ima.dai) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.ADS,
          shaka.util.Error.Code.SS_IMA_SDK_MISSING);
    }

    if (this.ssAdManager_) {
      this.ssAdManager_.release();
    }

    if (!this.serverSideAdContainer_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.ADS,
          shaka.util.Error.Code.SS_AD_CONTAINER_MISSING);
    }

    const video = this.player_.getMediaElement();
    goog.asserts.assert(video, 'Video must not be null!');
    this.ssAdManager_ = new shaka.ads.ServerSideAdManager(
        this.serverSideAdContainer_, video, this.locale_,
        (e) => this.processAndDispatchEvent_(e));

    goog.asserts.assert(this.config_, 'Config must not be null!');
    this.ssAdManager_.configure(this.config_);
  }

  /**
   * @param {!google.ima.dai.api.StreamRequest} imaRequest
   * @param {string=} backupUrl
   * @return {!Promise<string>}
   * @override
   * @export
   */
  requestServerSideStream(imaRequest, backupUrl = '') {
    if (!this.ssAdManager_) {
      this.initServerSide_();
    }

    if (!imaRequest.adTagParameters) {
      imaRequest.adTagParameters = {};
    }
    const adTagParams = imaRequest.adTagParameters;

    if (adTagParams['mpt'] || adTagParams['mpv']) {
      shaka.log.alwaysWarn('You have attempted to set "mpt" and/or "mpv" ' +
        'parameters of the ad tag. Please note that those parameters are ' +
        'used for Shaka adoption tracking and will be overridden.');
    }

    // Set player and version parameters for tracking
    imaRequest.adTagParameters['mpt'] = 'shaka-player';
    imaRequest.adTagParameters['mpv'] = shaka.Player.version;
    return this.ssAdManager_.streamRequest(imaRequest, backupUrl);
  }

  /**
   * @override
   * @export
   */
  replaceServerSideAdTagParameters(adTagParameters) {
    if (!this.ssAdManager_) {
      this.initServerSide_();
    }

    if (adTagParameters['mpt'] || adTagParameters['mpv']) {
      shaka.log.alwaysWarn('You have attempted to set "mpt" and/or "mpv" ' +
        'parameters of the ad tag. Please note that those parameters are ' +
        'used for Shaka adoption tracking and will be overridden.');
    }

    adTagParameters['mpt'] = 'Shaka Player';
    adTagParameters['mpv'] = shaka.Player.version;

    this.ssAdManager_.replaceAdTagParameters(adTagParameters);
  }

  /**
   * @private
   */
  initMediaTailor_() {
    if (this.mtAdManager_) {
      this.mtAdManager_.release();
    }

    const container = this.serverSideAdContainer_;

    if (!container) {
      shaka.log.warning('Init Media Tailor without a container causes ' +
          'overlays to not be displayed.');
    }

    const video = this.player_.getMediaElement();
    goog.asserts.assert(video, 'Video must not be null!');
    const networkingEngine = this.player_.getNetworkingEngine();
    goog.asserts.assert(networkingEngine, 'There should be a net engine.');
    this.mtAdManager_ = new shaka.ads.MediaTailorAdManager(
        container, networkingEngine, video,
        (e) => this.processAndDispatchEvent_(e));
    goog.asserts.assert(this.config_, 'Config must not be null!');
    this.mtAdManager_.configure(this.config_);
  }

  /**
   * @param {string} url
   * @param {Object} adsParams
   * @param {string=} backupUrl
   * @return {!Promise<string>}
   * @override
   * @export
   */
  requestMediaTailorStream(url, adsParams, backupUrl = '') {
    if (!this.mtAdManager_) {
      this.initMediaTailor_();
    }

    return this.mtAdManager_.streamRequest(url, adsParams, backupUrl);
  }

  /**
   * @param {string} url
   * @override
   * @export
   */
  addMediaTailorTrackingUrl(url) {
    if (!this.mtAdManager_) {
      this.initMediaTailor_();
    }

    this.mtAdManager_.addTrackingUrl(url);
  }

  /**
   * @private
   */
  initInterstitial_() {
    const container = this.clientSideAdContainer_;
    if (!container) {
      shaka.log.info('Initializing interstitials without ad container');
    }
    if (this.interstitialAdManager_) {
      this.interstitialAdManager_.release();
    }
    this.interstitialAdManager_ = new shaka.ads.InterstitialAdManager(
        container, this.player_,
        (e) => this.processAndDispatchEvent_(e));

    goog.asserts.assert(this.config_, 'Config must not be null!');
    this.interstitialAdManager_.configure(this.config_);
  }

  /**
   * @override
   * @export
   */
  addCustomInterstitial(interstitial) {
    if (!this.interstitialAdManager_) {
      this.initInterstitial_();
    }
    this.interstitialAdManager_.addInterstitials([interstitial]);
  }

  /**
   * @override
   * @export
   */
  addAdUrlInterstitial(url) {
    if (!this.interstitialAdManager_) {
      this.initInterstitial_();
    }
    return this.interstitialAdManager_.addAdUrlInterstitial(url);
  }

  /**
   * @override
   * @export
   */
  getInterstitialPlayer() {
    if (!this.interstitialAdManager_) {
      this.initInterstitial_();
    }
    return this.interstitialAdManager_.getPlayer();
  }

  /**
   * @private
   */
  initSVTA_() {
    if (this.svtaAdManager_) {
      this.svtaAdManager_.release();
    }
    this.svtaAdManager_ = new shaka.ads.SvtaAdManager(
        this.player_, (e) => this.processAndDispatchEvent_(e));
    goog.asserts.assert(this.config_, 'Config must not be null!');
    this.svtaAdManager_.configure(this.config_);
  }

  /**
   * @return {!Array<!shaka.extern.AdCuePoint>}
   * @override
   * @export
   */
  getCuePoints() {
    let cuepoints = [];
    if (this.ssAdManager_) {
      cuepoints = cuepoints.concat(this.ssAdManager_.getCuePoints());
    }
    if (this.mtAdManager_) {
      cuepoints = cuepoints.concat(this.mtAdManager_.getCuePoints());
    }
    return cuepoints;
  }

  /**
   * @return {shaka.extern.AdsStats}
   * @override
   * @export
   */
  getStats() {
    return this.stats_.getBlob();
  }

  /**
   * @override
   * @export
   */
  onManifestUpdated(isLive) {
    if (this.mtAdManager_) {
      this.mtAdManager_.onManifestUpdated(isLive);
    }
  }

  /**
   * @override
   * @export
   */
  onHlsTimedMetadata(metadata, timestamp) {
    if (this.ssAdManager_) {
      this.ssAdManager_.onTimedMetadata('ID3', metadata['data'], timestamp);
    }
  }

  /**
   * @override
   * @export
   */
  onCueMetadataChange(value) {
    if (this.ssAdManager_) {
      this.ssAdManager_.onCueMetadataChange(value);
    }
  }

  /**
   * @override
   * @export
   */
  async onHLSMetadata(metadata) {
    if (metadata.type == 'com.apple.quicktime.HLS') {
      if (this.config_ && this.config_.disableHLSInterstitial) {
        return;
      }
      if (!this.interstitialAdManager_) {
        this.initInterstitial_();
      }
      if (this.interstitialAdManager_) {
        await this.interstitialAdManager_.addMetadata(metadata);
      }
    } else if (shaka.ads.SvtaAdManager.isValidMetadata(metadata)) {
      if (!this.svtaAdManager_) {
        this.initSVTA_();
      }
      this.svtaAdManager_.addMetadata(metadata);
    }
  }

  /**
   * @override
   * @export
   */
  onDASHMetadata(region) {
    const schemeIdUri = region.schemeIdUri;
    if (schemeIdUri == 'urn:google:dai:2018') {
      if (this.ssAdManager_) {
        const type = region.schemeIdUri;
        const data = region.eventNode ?
            region.eventNode.attributes['messageData'] : null;
        const timestamp = region.startTime;
        this.ssAdManager_.onTimedMetadata(type, data, timestamp);
      }
    } else if (
      schemeIdUri == 'urn:mpeg:dash:event:alternativeMPD:insert:2025' ||
        schemeIdUri == 'urn:mpeg:dash:event:alternativeMPD:replace:2025') {
      if (this.config_ && this.config_.disableDASHInterstitial) {
        return;
      }
      if (!this.interstitialAdManager_) {
        this.initInterstitial_();
      }
      if (this.interstitialAdManager_) {
        this.interstitialAdManager_.addRegion(region);
      }
    } else if ((schemeIdUri == 'urn:mpeg:dash:event:2012' ||
        schemeIdUri == 'urn:scte:dash:scte214-events') &&
        region.eventNode &&
        shaka.util.TXml.findChild(region.eventNode, 'OverlayEvent')) {
      if (this.config_ && this.config_.disableDASHInterstitial) {
        return;
      }
      if (!this.interstitialAdManager_) {
        this.initInterstitial_();
      }
      if (this.interstitialAdManager_) {
        this.interstitialAdManager_.addOverlayRegion(region);
      }
    } else if (shaka.ads.SvtaAdManager.isValidRegion(region)) {
      if (!this.svtaAdManager_) {
        this.initSVTA_();
      }
      this.svtaAdManager_.addRegion(region);
    }
  }

  /**
   * @override
   * @export
   */
  getCurrentAd() {
    return this.currentAd_;
  }

  /**
   * @param {!shaka.util.FakeEvent} event
   * @private
   */
  processAndDispatchEvent_(event) {
    if (event && event.type) {
      switch (event.type) {
        case shaka.ads.Utils.ADS_LOADED: {
          const loadTime = (/** @type {!Object} */ (event))['loadTime'];
          this.stats_.addLoadTime(loadTime);
          break;
        }
        case shaka.ads.Utils.AD_STARTED: {
          this.stats_.incrementStarted();
          this.currentAd_ = (/** @type {!Object} */ (event))['ad'];
          if (this.currentAd_ && !this.currentAd_.isLinear()) {
            this.stats_.incrementOverlayAds();
          }
          break;
        }
        case shaka.ads.Utils.AD_STOPPED:
          this.currentAd_ = null;
          break;
        case shaka.ads.Utils.AD_COMPLETE:
          this.stats_.incrementPlayedCompletely();
          break;
        case shaka.ads.Utils.AD_SKIPPED:
          this.stats_.incrementSkipped();
          break;
        case shaka.ads.Utils.AD_ERROR:
          this.stats_.incrementErrors();
          break;
      }
    }
    this.dispatchEvent(event);
  }
};


/**
 * Set this is a default ad manager for the player.
 * Apps can also set their own ad manager, if they'd like.
 */
shaka.Player.setAdManagerFactory((player) => {
  return new shaka.ads.AdManager(player);
});

