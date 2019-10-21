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
shaka.ads.AdManager.AD_STARTED = 'adstarted';


/**
 * The event name for when an ad has finished playing.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_COMPLETE = 'adcomplete';


/**
 * The event name for when an ad was skipped.
 *
 * @const {string}
 * @export
 */
shaka.ads.AdManager.AD_SKIPPED = 'adskipped';
