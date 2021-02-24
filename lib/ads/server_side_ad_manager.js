/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 * @suppress {missingRequire} TODO(b/152540451): this shouldn't be needed
 */

goog.provide('shaka.ads.ServerSideAdManager');

goog.require('goog.asserts');
goog.require('shaka.ads.ServerSideAd');
goog.require('shaka.log');


/**
 * A class responsible for server-side ad interactions.
 */
shaka.ads.ServerSideAdManager = class {
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

    /** @private
        {?shaka.util.PublicPromise.<string>} */
    this.streamPromise_ = null;

    /** @private {number} */
    this.streamRequestStartTime_ = NaN;

    /** @private {function(!shaka.util.FakeEvent)} */
    this.onEvent_ = onEvent;

    /** @private {boolean} */
    this.isLiveContent_ = false;

    /**
     * Time to seek to after an ad if that ad was played as the result of
     * snapback.
     * @private {?number}
     */
    this.snapForwardTime_ = null;

    /** @private {shaka.ads.ServerSideAd} */
    this.ad_ = null;

    /** @private {?google.ima.dai.api.AdProgressData} */
    this.adProgressData_ = null;

    /** @private {string} */
    this.backupUrl_ = '';

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {google.ima.dai.api.UiSettings} */
    const uiSettings = new google.ima.dai.api.UiSettings();
    uiSettings.setLocale(locale);

    /** @private {google.ima.dai.api.StreamManager} */
    this.streamManager_ = new google.ima.dai.api.StreamManager(
        this.video_, this.adContainer_, uiSettings);

    this.onEvent_(new shaka.util.FakeEvent(
        shaka.ads.AdManager.IMA_STREAM_MANAGER_LOADED,
        {
          'imaStreamManager': this.streamManager_,
        }));

    // Events
    this.eventManager_.listen(this.streamManager_,
        google.ima.dai.api.StreamEvent.Type.LOADED, (e) => {
          shaka.log.info('Ad SS Loaded');
          this.onLoaded_(
              /** @type {!google.ima.dai.api.StreamEvent} */ (e));
        });

    this.eventManager_.listen(this.streamManager_,
        google.ima.dai.api.StreamEvent.Type.ERROR, () => {
          shaka.log.info('Ad SS Error');
          this.onError_();
        });

    this.eventManager_.listen(this.streamManager_,
        google.ima.dai.api.StreamEvent.Type.AD_BREAK_STARTED, () => {
          shaka.log.info('Ad Break Started');
        });

    this.eventManager_.listen(this.streamManager_,
        google.ima.dai.api.StreamEvent.Type.STARTED, (e) => {
          shaka.log.info('Ad Started');
          this.onAdStart_(/** @type {!google.ima.dai.api.StreamEvent} */ (e));
        });

    this.eventManager_.listen(this.streamManager_,
        google.ima.dai.api.StreamEvent.Type.AD_BREAK_ENDED, () => {
          shaka.log.info('Ad Break Ended');
          this.onAdBreakEnded_();
        });

    this.eventManager_.listen(this.streamManager_,
        google.ima.dai.api.StreamEvent.Type.AD_PROGRESS, (e) => {
          this.onAdProgress_(
              /** @type {!google.ima.dai.api.StreamEvent} */ (e));
        });

    this.eventManager_.listen(this.streamManager_,
        google.ima.dai.api.StreamEvent.Type.FIRST_QUARTILE, () => {
          shaka.log.info('Ad event: First Quartile');
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_FIRST_QUARTILE));
        });

    this.eventManager_.listen(this.streamManager_,
        google.ima.dai.api.StreamEvent.Type.MIDPOINT, () => {
          shaka.log.info('Ad event: Midpoint');
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_MIDPOINT));
        });

    this.eventManager_.listen(this.streamManager_,
        google.ima.dai.api.StreamEvent.Type.THIRD_QUARTILE, () => {
          shaka.log.info('Ad event: Third Quartile');
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_THIRD_QUARTILE));
        });

    this.eventManager_.listen(this.streamManager_,
        google.ima.dai.api.StreamEvent.Type.COMPLETE, () => {
          shaka.log.info('Ad event: Complete');
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_COMPLETE));
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STOPPED));
          this.adContainer_.removeAttribute('ad-active');
          this.ad_ = null;
        });

    this.eventManager_.listen(this.streamManager_,
        google.ima.dai.api.StreamEvent.Type.SKIPPED, () => {
          shaka.log.info('Ad event: Skipped');
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_SKIPPED));
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STOPPED));
        });

    this.eventManager_.listen(this.streamManager_,
        google.ima.dai.api.StreamEvent.Type.CUEPOINTS_CHANGED, (e) => {
          shaka.log.info('Ad event: Cue points changed');
          this.onCuePointsChanged_(
              /** @type {!google.ima.dai.api.StreamEvent} */ (e));
        });
  }

  /**
   * @param {!google.ima.dai.api.StreamRequest} streamRequest
   * @param {string=} backupUrl
   * @return {!Promise.<string>}
   */
  streamRequest(streamRequest, backupUrl) {
    if (this.streamPromise_) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.ADS,
          shaka.util.Error.Code.CURRENT_DAI_REQUEST_NOT_FINISHED));
    }
    if (streamRequest instanceof google.ima.dai.api.LiveStreamRequest) {
      this.isLiveContent_ = true;
    }

    this.streamPromise_ = new shaka.util.PublicPromise();
    this.streamManager_.requestStream(streamRequest);
    this.backupUrl_ = backupUrl || '';

    this.streamRequestStartTime_ = Date.now() / 1000;

    return this.streamPromise_;
  }

  /**
   * @param {Object} adTagParameters
   */
  replaceAdTagParameters(adTagParameters) {
    this.streamManager_.replaceAdTagParameters(adTagParameters);
  }

  /**
   * Resets the stream manager and removes any continuous polling.
   */
  stop() {
    this.streamManager_.reset();
    this.backupUrl_ = '';
    this.snapForwardTime_ = null;
  }

  /**
   * @param {string} type
   * @param {Uint8Array|string} data
   *   Comes as string in DASH and as Uint8Array in HLS.
   * @param {number} timestamp (in seconds)
   */
  onTimedMetadata(type, data, timestamp) {
    this.streamManager_.processMetadata(type, data, timestamp);
  }

  /**
   * @param {shaka.extern.ID3Metadata} value
   */
  onCueMetadataChange(value) {
    // Native HLS over Safari/iOS/iPadOS
    // For live event streams, the stream needs some way of informing the SDK
    // that an ad break is coming up or ending. In the IMA DAI SDK, this is
    // done through timed metadata. Timed metadata is carried as part of the
    // DAI stream content and carries ad break timing information used by the
    // SDK to track ad breaks.
    if (value['key'] && value['data']) {
      const metadata = {};
      metadata[value['key']] = value['data'];
      this.streamManager_.onTimedMetadata(metadata);
    }
  }

  /**
   * If a seek jumped over the ad break, return to the start of the
   * ad break, then complete the seek after the ad played through.
   * @private
   */
  checkForSnapback_() {
    const currentTime = this.video_.currentTime;
    if (currentTime == 0) {
      return;
    }

    this.streamManager_.streamTimeForContentTime(currentTime);
    const previousCuePoint =
        this.streamManager_.previousCuePointForStreamTime(currentTime);
    // The cue point gets marked as 'played' as soon as the playhead hits it
    // (at the start of an ad), so when we come back to this method as a result
    // of seeking back to the user-selected time, the 'played' flag will be set.
    if (previousCuePoint && !previousCuePoint.played) {
      shaka.log.info('Seeking back to the start of the ad break at ' +
          previousCuePoint.start + ' and will return to ' + currentTime);
      this.snapForwardTime_ = currentTime;
      this.video_.currentTime = previousCuePoint.start;
    }
  }

  /**
   * @param {!google.ima.dai.api.StreamEvent} e
   * @private
   */
  onAdStart_(e) {
    goog.asserts.assert(this.streamManager_,
        'Should have a stream manager at this point!');

    const imaAd = e.getAd();
    this.ad_ = new shaka.ads.ServerSideAd(imaAd, this.video_);

    // Ad object and ad progress data come from two different IMA events.
    // It's a race, and we don't know, which one will fire first - the
    // event that contains an ad object (AD_STARTED) or the one that
    // contains ad progress info (AD_PROGRESS).
    // If the progress event fired first, we must've saved the progress
    // info and can now add it to the ad object.
    if (this.adProgressData_) {
      this.ad_.setProgressData(this.adProgressData_);
    }

    this.onEvent_(new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STARTED,
        {'ad': this.ad_}));
    this.adContainer_.setAttribute('ad-active', 'true');
  }

  /**
   * @private
   */
  onAdBreakEnded_() {
    this.adContainer_.removeAttribute('ad-active');
    const currentTime = this.video_.currentTime;
    // If the ad break was a result of snapping back (a user seeked over
    // an ad break and was returned to it), seek forward to the point,
    // originally chosen by the user.
    if (this.snapForwardTime_ && this.snapForwardTime_ > currentTime) {
      this.video_.currentTime = this.snapForwardTime_;
      this.snapForwardTime_ = null;
    }
  }

  /**
   * @param {!google.ima.dai.api.StreamEvent} e
   * @private
   */
  onLoaded_(e) {
    const now = Date.now() / 1000;
    const loadTime = now - this.streamRequestStartTime_;
    this.onEvent_(
        new shaka.util.FakeEvent(shaka.ads.AdManager.ADS_LOADED,
            {'loadTime': loadTime}));

    const streamData = e.getStreamData();
    const url = streamData.url;
    this.streamPromise_.resolve(url);
    this.streamPromise_ = null;

    if (!this.isLiveContent_) {
      this.eventManager_.listen(this.video_, 'seeked', () => {
        this.checkForSnapback_();
      });
    }
  }

  /**
   * @private
   */
  onError_() {
    if (!this.backupUrl_.length) {
      this.streamPromise_.reject('IMA Stream request returned an error ' +
          'and there was no backup asset uri provided.');
      this.streamPromise_ = null;
      return;
    }

    shaka.log.warning('IMA stream request returned an error. ' +
        'Falling back to the backup asset uri.');
    this.streamPromise_.resolve(this.backupUrl_);
    this.streamPromise_ = null;
  }


  /**
   * @param {!google.ima.dai.api.StreamEvent} e
   * @private
   */
  onAdProgress_(e) {
    const streamData = e.getStreamData();
    const adProgressData = streamData.adProgressData;
    this.adProgressData_ = adProgressData;
    if (this.ad_) {
      this.ad_.setProgressData(this.adProgressData_);
    }
  }


  /**
   * @param {!google.ima.dai.api.StreamEvent} e
   * @private
   */
  onCuePointsChanged_(e) {
    const streamData = e.getStreamData();

    /** @type {!Array.<!shaka.ads.CuePoint>} */
    const cuePoints = [];
    for (const point of streamData.cuepoints) {
      const shakaCuePoint = new shaka.ads.CuePoint(point.start, point.end);
      cuePoints.push(shakaCuePoint);
    }

    this.onEvent_(
        new shaka.util.FakeEvent(shaka.ads.AdManager.CUEPOINTS_CHANGED,
            {'cuepoints': cuePoints}));
  }
};
