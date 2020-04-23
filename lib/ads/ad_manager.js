/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.AdManager');
goog.provide('shaka.ads.CuePoint');

goog.require('shaka.Player');
goog.require('shaka.ads.AdsStats');
goog.require('shaka.ads.ClientSideAdManager');
goog.require('shaka.ads.ServerSideAdManager');
goog.require('shaka.log');
goog.require('shaka.util.FakeEventTarget');


/**
 * @event shaka.ads.AdManager.ADS_LOADED
 * @description Fired when an ad has started playing.
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
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdCompleteEvent
 * @description Fired when an ad has played through.
 * @property {string} type
 *   'ad-complete'
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdSkippedEvent
 * @description Fired when an ad has been skipped.
 * @property {string} type
 *   'ad-skipped'
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdFirstQuartileEvent
 * @description Fired when an ad has played through the first 1/4.
 * @property {string} type
 *   'ad-first-quartile'
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdMidpointEvent
 * @description Fired when an ad has played through its midpoint.
 * @property {string} type
 *   'ad-midpoint'
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdThirdQuartileEvent
 * @description Fired when an ad has played through the third quartile.
 * @property {string} type
 *   'ad-third-quartile'
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdStoppedEvent
 * @description Fired when an ad has stopped playing, was skipped,
 *   or was unable to proceed due to an error.
 * @property {string} type
 *   'ad-stopped'
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdVolumeChangedEvent
 * @description Fired when an ad's volume changed.
 * @property {string} type
 *   'ad-volume-changed'
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdMutedEvent
 * @description Fired when an ad was muted.
 * @property {string} type
 *   'ad-muted'
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdPausedEvent
 * @description Fired when an ad was paused.
 * @property {string} type
 *   'ad-paused'
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdResumedEvent
 * @description Fired when an ad was resumed after a pause.
 * @property {string} type
 *   'ad-resumed'
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdSkipStateChangedEvent
 * @description Fired when an ad's skip state changes (for example, when
 *  it becomes possible to skip the ad).
 * @property {string} type
 *   'ad-skip-state-changed'
 * @exportDoc
 */


/**
 * @event shaka.ads.AdManager.AdResumedEvent
 * @description Fired when the ad cue points change, signalling ad breaks
 *  change.
 * @property {string} type
 *   'ad-cue-points-changed'
 * @exportDoc
 */


/**
 * A class responsible for ad-related interactions.
 * @implements {shaka.extern.IAdManager}
 * @export
 */
shaka.ads.AdManager = class extends shaka.util.FakeEventTarget {
  constructor() {
    super();
    /** @private {shaka.ads.ClientSideAdManager} */
    this.csAdManager_ = null;
    /** @private {shaka.ads.ServerSideAdManager} */
    this.ssAdManager_ = null;
    /** @private {shaka.ads.AdsStats} */
    this.stats_ = new shaka.ads.AdsStats();
  }

  /**
   * @override
   * @export
   */
  initClientSide(adContainer, video) {
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

    this.csAdManager_ = new shaka.ads.ClientSideAdManager(
        adContainer, video,
        (e) => {
          const event = /** @type {!shaka.util.FakeEvent} */ (e);
          if (event && event.type) {
            switch (event.type) {
              case shaka.ads.AdManager.ADS_LOADED: {
                const loadTime = (/** @type {!Object} */ (e))['loadTime'];
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
        });
  }


  /**
  * @override
  * @export
  */
  onAssetUnload() {
    if (this.csAdManager_) {
      this.csAdManager_.stop();
    }

    this.dispatchEvent(
        new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STOPPED));

    // TODO:
    // For SS DAI streams, if a different asset gets unloaded as
    // part of the process
    // of loading a DAI asset, stream manager state gets reset and we
    // don't get any ad events.
    // We need to figure out if it makes sense to stop the SS
    // manager on unload, and, if it does, find
    // a way to do it safely.
    // if (this.ssAdManager_) {
    //   this.ssAdManager_.stop();
    // }
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

    this.ssAdManager_ = new shaka.ads.ServerSideAdManager(
        adContainer, video,
        (e) => {
          const event = /** @type {!shaka.util.FakeEvent} */ (e);
          if (event && event.type) {
            switch (event.type) {
              case shaka.ads.AdManager.ADS_LOADED: {
                const loadTime = (/** @type {!Object} */ (e))['loadTime'];
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
        });

    // Set the name and version of the player in IMA for tracking.
    this.replaceServerSideAdTagParameters(
        {
          'mpt': 'shaka',
          'mpv': shaka.Player.version,
        });
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

    this.ssAdManager_.replaceAdTagParameters(adTagParameters);
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
  onTimedMetadata(region) {
    if (this.ssAdManager_) {
      this.ssAdManager_.onTimedMetadata(region);
    }
  }

  /**
   * @override
   * @export
   */
  onCueMetadataChange(value) {
    if (this.ssAdManager_) {
      this.ssAdManager_.onCueMetadataChange(value);
    } else {
      shaka.log.warning('The method was called without initializing server ' +
        'side logic and will not take effect');
    }
  }
};


shaka.ads.CuePoint = class {
  /**
   * @param {number} start
   * @param {?number=} end
   */
  constructor(start, end = null) {
    /** @public {number} */
    this.start = start;
    /** @public {?number} */
    this.end = end;
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
 * Set this is a default ad manager for the player.
 * Apps can also set their own ad manager, if they'd like.
 */
shaka.Player.setAdManagerFactory(() => new shaka.ads.AdManager());

