/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.AdManager');

goog.require('goog.asserts');
goog.require('shaka.Deprecate');
goog.require('shaka.Player');
goog.require('shaka.ads.AdsStats');
goog.require('shaka.ads.ClientSideAdManager');
goog.require('shaka.ads.MediaTailorAdManager');
goog.require('shaka.ads.ServerSideAdManager');
goog.require('shaka.log');
goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IReleasable');


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
 * @event shaka.ads.AdManager.AdResumedEvent
 * @description Fired when the ad cue points change, signalling ad breaks
 *  change.
 * @property {string} type
 *   'ad-cue-points-changed'
 * @property {Object} originalEvent
 *    The native SDK event, if available.
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
 * @event shaka.ads.AdManager.AD_ERROR
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
 * A class responsible for ad-related interactions.
 * @implements {shaka.extern.IAdManager}
 * @implements {shaka.util.IReleasable}
 * @export
 */
shaka.ads.AdManager = class extends shaka.util.FakeEventTarget {
  /** */
  constructor() {
    super();
    /** @private {shaka.ads.ClientSideAdManager} */
    this.csAdManager_ = null;
    /** @private {shaka.ads.MediaTailorAdManager} */
    this.mtAdManager_ = null;
    /** @private {shaka.ads.ServerSideAdManager} */
    this.ssAdManager_ = null;
    /** @private {shaka.ads.AdsStats} */
    this.stats_ = new shaka.ads.AdsStats();
    /** @private {string} locale */
    this.locale_ = navigator.language;
    /** @private {?shaka.extern.AdsConfiguration} */
    this.config_ = null;
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
  configure(config) {
    this.config_ = config;
    if (this.csAdManager_) {
      this.csAdManager_.configure(this.config_);
    }
    if (this.ssAdManager_) {
      this.ssAdManager_.configure(this.config_);
    }
  }


  /**
   * @override
   * @export
   */
  initClientSide(adContainer, video, adsRenderingSettings) {
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

    this.csAdManager_ = new shaka.ads.ClientSideAdManager(
        adContainer, video, this.locale_, adsRenderingSettings,
        (e) => this.processAndDispatchEvent_(e));

    goog.asserts.assert(this.config_, 'Config must not be null!');
    this.csAdManager_.configure(this.config_);
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
    if (this.mtAdManager_) {
      this.mtAdManager_.release();
      this.mtAdManager_ = null;
    }
    if (this.ssAdManager_) {
      this.ssAdManager_.release();
      this.ssAdManager_ = null;
    }
    super.release();
  }


  /**
  * @override
  * @export
  */
  onAssetUnload() {
    if (this.csAdManager_) {
      this.csAdManager_.stop();
    }
    if (this.mtAdManager_) {
      this.mtAdManager_.stop();
    }
    if (this.ssAdManager_) {
      this.ssAdManager_.stop();
    }

    this.dispatchEvent(
        new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STOPPED));

    this.stats_ = new shaka.ads.AdsStats();
  }


  /**
   * @override
   * @export
   */
  requestClientSideAds(imaRequest) {
    if (!this.csAdManager_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.ADS,
          shaka.util.Error.Code.CS_AD_MANAGER_NOT_INITIALIZED);
    }

    this.csAdManager_.requestAds(imaRequest);
  }


  /**
   * @override
   * @export
   */
  updateClientSideAdsRenderingSettings(adsRenderingSettings) {
    if (!this.csAdManager_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.ADS,
          shaka.util.Error.Code.CS_AD_MANAGER_NOT_INITIALIZED);
    }

    this.csAdManager_.updateAdsRenderingSettings(adsRenderingSettings);
  }


  /**
   * @override
   * @export
   */
  initMediaTailor(adContainer, networkingEngine, video) {
    if (this.mtAdManager_) {
      this.mtAdManager_.release();
    }

    this.mtAdManager_ = new shaka.ads.MediaTailorAdManager(
        adContainer, networkingEngine, video,
        (e) => this.processAndDispatchEvent_(e));
  }


  /**
   * @param {string} url
   * @param {Object} adsParams
   * @param {string=} backupUrl
   * @return {!Promise.<string>}
   * @override
   * @export
   */
  requestMediaTailorStream(url, adsParams, backupUrl = '') {
    if (!this.mtAdManager_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.ADS,
          shaka.util.Error.Code.MT_AD_MANAGER_NOT_INITIALIZED);
    }

    return this.mtAdManager_.streamRequest(url, adsParams, backupUrl);
  }


  /**
   * @override
   * @export
   */
  initServerSide(adContainer, video) {
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

    this.ssAdManager_ = new shaka.ads.ServerSideAdManager(
        adContainer, video, this.locale_,
        (e) => this.processAndDispatchEvent_(e));

    goog.asserts.assert(this.config_, 'Config must not be null!');
    this.ssAdManager_.configure(this.config_);
  }


  /**
   * @param {!google.ima.dai.api.StreamRequest} imaRequest
   * @param {string=} backupUrl
   * @return {!Promise.<string>}
   * @override
   * @export
   */
  requestServerSideStream(imaRequest, backupUrl = '') {
    if (!this.ssAdManager_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.ADS,
          shaka.util.Error.Code.SS_AD_MANAGER_NOT_INITIALIZED);
    }

    if (!imaRequest.adTagParameters) {
      imaRequest.adTagParameters = {};
    }
    const adTagParams = imaRequest.adTagParameters;

    if (adTagParams['mpt'] || adTagParams['mpv']) {
      shaka.log.alwaysWarn('You have attempted to set "mpt" and/or "mpv" ' +
        'parameters of the ad tag. Please note that those parameters are ' +
        'used for Shaka adoption tracking and will be overriden.');
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
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.ADS,
          shaka.util.Error.Code.SS_AD_MANAGER_NOT_INITIALIZED);
    }

    if (adTagParameters['mpt'] || adTagParameters['mpv']) {
      shaka.log.alwaysWarn('You have attempted to set "mpt" and/or "mpv" ' +
        'parameters of the ad tag. Please note that those parameters are ' +
        'used for Shaka adoption tracking and will be overriden.');
    }

    adTagParameters['mpt'] = 'Shaka Player';
    adTagParameters['mpv'] = shaka.Player.version;

    this.ssAdManager_.replaceAdTagParameters(adTagParameters);
  }


  /**
   * @return {!Array.<!shaka.extern.AdCuePoint>}
   * @override
   * @export
   */
  getServerSideCuePoints() {
    shaka.Deprecate.deprecateFeature(5,
        'AdManager',
        'Please use getCuePoints function.');
    return this.getCuePoints();
  }


  /**
   * @return {!Array.<!shaka.extern.AdCuePoint>}
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
  onDashTimedMetadata(region) {
    if (this.ssAdManager_ && region.schemeIdUri == 'urn:google:dai:2018') {
      const type = region.schemeIdUri;
      const data = region.eventElement ?
          region.eventElement.getAttribute('messageData') : null;
      const timestamp = region.startTime;
      this.ssAdManager_.onTimedMetadata(type, data, timestamp);
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
   * @param {!shaka.util.FakeEvent} event
   * @private
   */
  processAndDispatchEvent_(event) {
    if (event && event.type) {
      switch (event.type) {
        case shaka.ads.AdManager.ADS_LOADED: {
          const loadTime = (/** @type {!Object} */ (event))['loadTime'];
          this.stats_.addLoadTime(loadTime);
          break;
        }
        case shaka.ads.AdManager.AD_STARTED:
          this.stats_.incrementStarted();
          break;
        case shaka.ads.AdManager.AD_COMPLETE:
          this.stats_.incrementPlayedCompletely();
          break;
        case shaka.ads.AdManager.AD_SKIPPED:
          this.stats_.incrementSkipped();
          break;
      }
    }
    this.dispatchEvent(event);
  }
};

/**
 * The event name for when a sequence of ads has been loaded.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.ADS_LOADED = 'ads-loaded';

/**
 * The event name for when an ad has started playing.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_STARTED = 'ad-started';


/**
 * The event name for when an ad playhead crosses first quartile.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_FIRST_QUARTILE = 'ad-first-quartile';


/**
 * The event name for when an ad playhead crosses midpoint.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_MIDPOINT = 'ad-midpoint';


/**
 * The event name for when an ad playhead crosses third quartile.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_THIRD_QUARTILE = 'ad-third-quartile';


/**
 * The event name for when an ad has completed playing.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_COMPLETE = 'ad-complete';


/**
 * The event name for when an ad has finished playing
 * (played all the way through, was skipped, or was unable to proceed
 * due to an error).
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_STOPPED = 'ad-stopped';


/**
 * The event name for when an ad is skipped by the user..
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_SKIPPED = 'ad-skipped';


/**
 * The event name for when the ad volume has changed.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_VOLUME_CHANGED = 'ad-volume-changed';


/**
 * The event name for when the ad was muted.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_MUTED = 'ad-muted';


/**
 * The event name for when the ad was paused.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_PAUSED = 'ad-paused';


/**
 * The event name for when the ad was resumed after a pause.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_RESUMED = 'ad-resumed';


/**
 * The event name for when the ad's skip status changes
 * (usually it becomes skippable when it wasn't before).
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_SKIP_STATE_CHANGED = 'ad-skip-state-changed';


/**
 * The event name for when the ad's cue points (start/end markers)
 * have changed.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.CUEPOINTS_CHANGED = 'ad-cue-points-changed';


/**
 * The event name for when the native IMA ad manager object has
 * loaded and become available.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.IMA_AD_MANAGER_LOADED = 'ima-ad-manager-loaded';


/**
 * The event name for when the native IMA stream manager object has
 * loaded and become available.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.IMA_STREAM_MANAGER_LOADED = 'ima-stream-manager-loaded';


/**
 * The event name for when the ad was clicked.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_CLICKED = 'ad-clicked';


/**
 * The event name for when there is an update to the current ad's progress.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_PROGRESS = 'ad-progress';


/**
 * The event name for when the ad is buffering.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_BUFFERING = 'ad-buffering';


/**
 * The event name for when the ad's URL was hit.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_IMPRESSION = 'ad-impression';


/**
 * The event name for when the ad's duration changed.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_DURATION_CHANGED = 'ad-duration-changed';


/**
 * The event name for when the ad was closed by the user.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_CLOSED = 'ad-closed';


/**
 * The event name for when the ad data becomes available.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_LOADED = 'ad-loaded';


/**
 * The event name for when all the ads were completed.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.ALL_ADS_COMPLETED = 'all-ads-completed';


/**
 * The event name for when the ad changes from or to linear.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_LINEAR_CHANGED = 'ad-linear-changed';


/**
 * The event name for when the ad's metadata becomes available.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_METADATA = 'ad-metadata';


/**
 * The event name for when the ad display encountered a recoverable
 * error.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_RECOVERABLE_ERROR = 'ad-recoverable-error';

/**
 * The event name for when the ad manager dispatch errors.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_ERROR = 'ad-error';

/**
 * The event name for when the client side SDK signalled its readiness
 * to play a VPAID ad or an ad rule.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_BREAK_READY = 'ad-break-ready';


/**
 * The event name for when the interaction callback for the ad was
 * triggered.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_INTERACTION = 'ad-interaction';


/**
 * Set this is a default ad manager for the player.
 * Apps can also set their own ad manager, if they'd like.
 */
shaka.Player.setAdManagerFactory(() => new shaka.ads.AdManager());

