/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ads.ServerSideAdManager');

goog.require('shaka.ads.ServerSideAd');
goog.require('shaka.log');


/**
 * A class responsible for server-side ad interactions.
 */
shaka.ads.ServerSideAdManager = class {
  /**
   * @param {HTMLElement} adContainer
   * @param {HTMLMediaElement} video
   * @param {shaka.Player} player
   * @param {function(!shaka.util.FakeEvent)} onEvent
   */
  constructor(adContainer, video, player, onEvent) {
    /** @private {HTMLElement} */
    this.adContainer_ = adContainer;

    /** @private {HTMLMediaElement} */
    this.video_ = video;

    /** @private {shaka.Player} */
    this.player_ = player;

    /** @private {function(!shaka.util.FakeEvent)} */
    this.onEvent_ = onEvent;

    /**
     * Time to seek to after an ad if that ad was played as the result of
     * snapback.
     * @private {?number}
     */
    this.snapForwardTime_ = null;

    /** @private {shaka.ads.ServerSideAd} */
    this.ad_ = null;

    /** @private {string} */
    this.backupUrl_ = '';

    /** @private {?number} */
    this.startTime_ = null;

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {google.ima.dai.api.StreamManager} */
    this.streamManager_ = new google.ima.dai.api.StreamManager(this.video_);

    this.streamManager_.setClickElement(this.adContainer_);

    // Native HLS over Safari/iOS/iPadOS
    // This is a real EventTarget, but the compiler doesn't know that.
    // TODO: File a bug or send a PR to the compiler externs to fix this.
    const textTracks = /** @type {EventTarget} */(this.video_.textTracks);
    this.eventManager_.listen(textTracks, 'addtrack', (event) => {
      const track = event.track;
      if (track.kind == 'metadata') {
        track.mode = 'hidden';
        track.addEventListener('cuechange', () => {
          for (const cue of track.activeCues) {
            const metadata = {};
            metadata[cue.value.key] = cue.value.data;
            this.streamManager_.onTimedMetadata(metadata);
          }
        });
      }
    });

    // DASH managed by the player
    this.eventManager_.listen(
        this.player_, 'timelineregionadded', (event) => {
          const detail = event.detail;
          if (detail && detail.schemeIdUri == 'urn:google:dai:2018') {
            const type = detail.schemeIdUri;
            const data = detail.eventElement ?
                detail.eventElement.getAttribute('messageData') : null;
            const timestamp = detail.startTime;
            this.streamManager_.processMetadata(type, data, timestamp);
          }
        });

    // HLS managed by the player
    // TODO: There are not method to get the metadata in HLS

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
          this.adContainer_.setAttribute('ad-active', 'true');
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STARTED));
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
        google.ima.dai.api.StreamEvent.Type.STARTED, () => {
          shaka.log.info('Ad event: Started');
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STARTED));
          this.adContainer_.setAttribute('ad-active', 'true');
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
          this.adContainer_.removeAttribute('ad-active');
          this.ad_ = null;
        });

    this.eventManager_.listen(this.streamManager_,
        google.ima.dai.api.StreamEvent.Type.SKIPPED, () => {
          shaka.log.info('Ad event: Skipped');
          this.onEvent_(
              new shaka.util.FakeEvent(shaka.ads.AdManager.AD_SKIPPED));
        });
  }

  /**
   * @param {!google.ima.dai.api.StreamRequest} streamRequest
   * @param {string} backupUrl
   * @param {?number} startTime
   */
  streamRequest(streamRequest, backupUrl, startTime) {
    this.streamManager_.requestStream(streamRequest);
    this.backupUrl_ = backupUrl;
    this.startTime_ = startTime;
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
   * Takes the current video time and snaps to the previous ad break if it
   * was not played.
   * @private
   */
  onLoadedEnd_() {
    if (this.player_.isLive()) {
      return;
    }
    const currentTime = this.video_.currentTime;
    if (currentTime == 0) {
      return;
    }
    this.streamManager_.streamTimeForContentTime(currentTime);
    const previousCuePoint =
        this.streamManager_.previousCuePointForStreamTime(currentTime);
    if (previousCuePoint && !previousCuePoint.played) {
      shaka.log.info('Seeking back to ' + previousCuePoint.start +
          ' and will return to ' + currentTime);
      this.snapForwardTime_ = currentTime;
      this.video_.currentTime = previousCuePoint.start;
    }
  }

  /**
   * @private
   */
  onAdBreakEnded_() {
    this.adContainer_.removeAttribute('ad-active');
    const currentTime = this.video_.currentTime;
    if (this.snapForwardTime_ && this.snapForwardTime_ > currentTime) {
      this.video_.currentTime = this.snapForwardTime_;
      this.snapForwardTime_ = null;
    }
    this.onEvent_(new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STOPPED));
  }

  /**
   * @param {!google.ima.dai.api.StreamEvent} e
   * @private
   */
  onLoaded_(e) {
    const streamData = e.getStreamData();
    const url = streamData.url;
    this.player_.load(url, this.startTime_).then(() => {
      this.onLoadedEnd_();
    });
  }

  /**
   * @private
   */
  onError_() {
    this.player_.load(this.backupUrl_, this.startTime_);
  }


  /**
   * @param {!google.ima.dai.api.StreamEvent} e
   * @private
   */
  onAdProgress_(e) {
    const imaAd = e.getAd();
    const streamData = e.getStreamData();
    const progressDataAd = streamData.adProgressData;
    this.ad_ = new shaka.ads.ServerSideAd(imaAd, progressDataAd, this.video_);
  }
};
