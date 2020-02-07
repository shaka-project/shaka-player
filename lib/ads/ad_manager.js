/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.AdManager');

goog.require('shaka.Player');
goog.require('shaka.ads.AdsStats');
goog.require('shaka.ads.ClientSideAdManager');
goog.require('shaka.ads.ServerSideAdManager');
goog.require('shaka.util.FakeEventTarget');


/**
 * @event shaka.AdManager.AdStartedEvent
 * @description Fired when an ad has started playing.
 * @property {string} type
 *   'adstarted'
 * @property {!shaka.extern.IAd} ad
 *    The ad that has started playing.
 * @exportDoc
 */


/**
 * @event shaka.AdManager.AdCompleteEvent
 * @description Fired when an ad has played through.
 * @property {string} type
 *   'adcomplete'
 * @exportDoc
 */


/**
 * @event shaka.AdManager.AdSkippedEvent
 * @description Fired when an ad has been skipped.
 * @property {string} type
 *   'adskipped'
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
  initServerSide(adContainer, video, player) {
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
        adContainer, video, player,
        (e) => {
          const event = /** @type {!shaka.util.FakeEvent} */ (e);
          if (event && event.type) {
            switch (event.type) {
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
   * @param {!google.ima.dai.api.StreamRequest} imaRequest
   * @param {string=} backupUrl
   * @param {?number=} startTime
   * @override
   * @export
   */
  requestServerSideStream(imaRequest, backupUrl = '', startTime = null) {
    if (!this.ssAdManager_) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.ADS,
          shaka.util.Error.Code.SS_AD_MANAGER_NOT_INITIALIZED);
    }

    this.ssAdManager_.streamRequest(imaRequest, backupUrl, startTime);
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
};


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
 * The event name for when an ad has completes playing.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_COMPLETE = 'ad-complete';


/**
 * The event name for when an ad has finished playing
 * (played all the way through or was skipped).
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
 * Set this is a default ad manager for the player.
 * Apps can also set their own ad manager, if they'd like.
 */
shaka.Player.setAdManagerFactory(() => new shaka.ads.AdManager());

