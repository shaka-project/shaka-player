/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


goog.provide('shaka.ads.AdManager');

goog.require('shaka.Player');
goog.require('shaka.ads.ClientSideAdManager');
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
  }

  /**
   * @param {!HTMLElement} adContainer
   * @param {!HTMLMediaElement} video
   * @export
   */
  initClientSide(adContainer, video) {
    if (!window['google'] || !google.ima) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.ADS,
          shaka.util.Error.Code.IMA_SDK_MISSING);
    }

    this.csAdManager_ = new shaka.ads.ClientSideAdManager(
        adContainer, video,
        (e) => {
          this.dispatchEvent(e);
        });
  }

  /**
   * @param {!google.ima.AdsRequest} imaRequest
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
   * @param {string} assetKey
   * @param {string} assetId
   * @param {boolean} isLive
   * @param {string=} backupUrl
   * @export
   */
  loadServerSideStream(assetKey, assetId, isLive, backupUrl) {
    // TODO
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
 * The event name for when an ad has finished playing
 * (played all the way through or was skipped).
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_STOPPED = 'ad-stopped';


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
 * Set this is a default ad manager for the player.
 * Apps can also set their own ad manager, if they'd like.
 */
shaka.Player.setAdManagerFactory(shaka.ads.AdManager);
