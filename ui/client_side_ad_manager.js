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

goog.provide('shaka.ui.ClientSideAdManager');

goog.require('goog.asserts');


/**
 * A class responsible for client-side ad interactions.
 */
shaka.ui.ClientSideAdManager = class {
  /**
   * @param {!shaka.ui.Controls} controls
   */
  constructor(controls) {
    this.controls_ = controls;

    this.adContainer_ = this.controls_.getAdContainer();

    /** @private {HTMLMediaElement} */
    this.video_ = this.controls_.getVideo();

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

    /** @private {google.ima.AdsManager} */
    this.adsManager_ = null;

    this.eventManager_.listenOnce(this.adsLoader_,
        google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (e) => {
          this.onAdsManagerLoaded_(
              /** @type {!google.ima.AdsManagerLoadedEvent} */ (e));
        });

    this.eventManager_.listen(this.adsLoader_,
        google.ima.AdEvent.Type.AD_ERROR, (e) => {
          this.onAdError_( /** @type {!google.ima.AdErrorEvent} */ (e));
        });

    this.eventManager_.listen(this.adsLoader_,
        google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => {
          this.onAdStart_();
        });

    this.eventManager_.listen(this.adsLoader_,
        google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, () => {
          this.onAdComplete_();
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
    this.adsLoader_.requestAds(imaRequest);
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
  }


  /**
   * @param {!google.ima.AdsManagerLoadedEvent} e
   * @private
   */
  onAdsManagerLoaded_(e) {
    goog.asserts.assert(this.video_ != null, 'Video should not be null!');

    this.adsManager_ = e.getAdsManager(this.video_);

    this.eventManager_.listen(this.adsManager_,
        google.ima.AdErrorEvent.Type.AD_ERROR, (error) => {
          this.onAdError_(/** @type {!google.ima.AdErrorEvent} */ (error));
        });

    this.eventManager_.listen(this.adsManager_,
        google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => {
          this.onAdStart_();
        });

    this.eventManager_.listen(this.adsManager_,
        google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, () => {
          this.onAdComplete_();
        });

    try {
      const viewMode = document.fullscreenElement ?
        google.ima.ViewMode.FULLSCREEN : google.ima.ViewMode.NORMAL;

      this.adsManager_.init(this.video_.offsetWidth,
          this.video_.offsetHeight, viewMode);

      // Single video and overlay ads will start at this time
      // TODO (ismena): Need a better inderstanding of what this does.
      // The docs say it's called to 'start playing the ads,' but I haven't
      // seen the ads actually play until requestAds() is called.
      this.adsManager_.start();
    } catch (adError) {
      // If there was a problem with the VAST response,
      // we we won't be getting an ad. Hide ad UI if we showed it already
      // and get back to the presentation.
      this.onAdComplete_();
    }
  }

  /** @private */
  onAdStart_() {
    this.video_.pause();
    this.controls_.showAdUI();
  }

  /** @private */
  onAdComplete_() {
    this.controls_.hideAdUI();
    this.video_.play();
  }
};
