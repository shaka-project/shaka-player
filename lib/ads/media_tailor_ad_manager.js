/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 * @suppress {missingRequire} TODO(b/152540451): this shouldn't be needed
 */

goog.provide('shaka.ads.MediaTailorAdManager');

goog.require('shaka.ads.MediaTailorAd');
goog.require('shaka.log');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.StringUtils');


/**
 * A class responsible for MediaTailor ad interactions.
 *
 * @implements {shaka.util.IReleasable}
 */
shaka.ads.MediaTailorAdManager = class {
  /**
   * @param {HTMLElement} adContainer
   * @param {shaka.net.NetworkingEngine} networkingEngine
   * @param {HTMLMediaElement} video
   * @param {function(!shaka.util.FakeEvent)} onEvent
   */
  constructor(adContainer, networkingEngine, video, onEvent) {
    /** @private {HTMLElement} */
    this.adContainer_ = adContainer;

    /** @private {shaka.net.NetworkingEngine} */
    this.networkingEngine_ = networkingEngine;

    /** @private {HTMLMediaElement} */
    this.video_ = video;

    /** @private {?shaka.util.PublicPromise.<string>} */
    this.streamPromise_ = null;

    /** @private {number} */
    this.streamRequestStartTime_ = NaN;

    /** @private {function(!shaka.util.FakeEvent)} */
    this.onEvent_ = onEvent;

    /** @private {boolean} */
    this.isLive_ = false;

    /**
     * Time to seek to after an ad if that ad was played as the result of
     * snapback.
     * @private {?number}
     */
    this.snapForwardTime_ = null;

    /** @private {!Array.<!mediaTailor.AdBreak>} */
    this.adBreaks_ = [];

    /** @private {!Array.<string>} */
    this.playedAds_ = [];

    /** @private {?shaka.ads.MediaTailorAd} */
    this.ad_ = null;

    /** @private {?mediaTailor.Ad} */
    this.mediaTailorAd_ = null;

    /** @private {?mediaTailor.AdBreak} */
    this.mediaTailorAdBreak_ = null;

    /** @private {!Array.<{id: string,
     *           apps: !Array.<mediaTailorExternalResource.App>}>} */
    this.staticResource_ = [];

    /** @private {!Array.<{target: EventTarget, type: string,
     *           listener: shaka.util.EventManager.ListenerType}>}
     */
    this.adListeners_ = [];

    /** @private {!Array.<string>} */
    this.eventsSent = [];

    /** @private {string} */
    this.trackingUrl_ = '';

    /** @private {boolean} */
    this.firstTrackingRequest_ = true;

    /** @private {string} */
    this.backupUrl_ = '';

    /** @private {!Array.<!shaka.extern.AdCuePoint>} */
    this.currentCuePoints_ = [];

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();
  }

  /**
   * @param {string} url
   * @param {Object} adsParams
   * @param {string} backupUrl
   * @return {!Promise.<string>}
   */
  streamRequest(url, adsParams, backupUrl) {
    if (this.streamPromise_) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.ADS,
          shaka.util.Error.Code.CURRENT_DAI_REQUEST_NOT_FINISHED));
    }

    this.streamPromise_ = new shaka.util.PublicPromise();
    this.requestSessionInfo_(url, adsParams);
    this.backupUrl_ = backupUrl || '';

    this.streamRequestStartTime_ = Date.now() / 1000;

    return this.streamPromise_;
  }

  /**
   * Resets the MediaTailor manager and removes any continuous polling.
   */
  stop() {
    for (const listener of this.adListeners_) {
      this.eventManager_.unlisten(
          listener.target, listener.type, listener.listener);
    }
    this.onEnded_();
    this.adListeners_ = [];
    this.eventsSent = [];
    this.trackingUrl_ = '';
    this.firstTrackingRequest_ = true;
    this.backupUrl_ = '';
    this.snapForwardTime_ = null;
    this.adBreaks_ = [];
    this.playedAds_ = [];
    this.staticResource_ = [];
  }

  /** @override */
  release() {
    this.stop();
    if (this.eventManager_) {
      this.eventManager_.release();
    }
  }

  /**
   * Fired when the manifest is updated
   *
   * @param {boolean} isLive
   */
  onManifestUpdated(isLive) {
    this.isLive_ = isLive;
    if (this.trackingUrl_ != '') {
      this.requestTrackingInfo_(
          this.trackingUrl_, this.firstTrackingRequest_);
      this.firstTrackingRequest_ = false;
    }
  }

  /**
   * @return {!Array.<!shaka.extern.AdCuePoint>}
   */
  getCuePoints() {
    const cuePoints = [];
    for (const adbreak of this.adBreaks_) {
      for (const ad of adbreak.ads) {
        /** @type {!shaka.extern.AdCuePoint} */
        const cuePoint = {
          start: ad.startTimeInSeconds,
          end: ad.startTimeInSeconds + ad.durationInSeconds,
        };
        cuePoints.push(cuePoint);
      }
    }
    return cuePoints;
  }

  /**
   * @param {string} url
   * @param {Object} adsParams
   * @private
   */
  async requestSessionInfo_(url, adsParams) {
    const type = shaka.net.NetworkingEngine.RequestType.ADS;
    const request = shaka.net.NetworkingEngine.makeRequest(
        [url],
        shaka.net.NetworkingEngine.defaultRetryParameters());
    request.method = 'POST';
    if (adsParams) {
      const body = JSON.stringify(adsParams);
      request.body = shaka.util.StringUtils.toUTF8(body);
    }

    const op = this.networkingEngine_.request(type, request);
    try {
      const response = await op.promise;
      const data = shaka.util.StringUtils.fromUTF8(response.data);
      const dataAsJson =
        /** @type {!mediaTailor.SessionResponse} */ (JSON.parse(data));
      if (dataAsJson.manifestUrl && dataAsJson.trackingUrl) {
        const baseUri = new goog.Uri(url);
        const relativeTrackingUri = new goog.Uri(dataAsJson.trackingUrl);
        this.trackingUrl_ = baseUri.resolve(relativeTrackingUri).toString();
        const now = Date.now() / 1000;
        const loadTime = now - this.streamRequestStartTime_;
        this.onEvent_(new shaka.util.FakeEvent(shaka.ads.AdManager.ADS_LOADED,
            (new Map()).set('loadTime', loadTime)));
        const relativeManifestUri = new goog.Uri(dataAsJson.manifestUrl);
        this.streamPromise_.resolve(
            baseUri.resolve(relativeManifestUri).toString());
        this.streamPromise_ = null;
      } else {
        throw new Error('Insufficient data from MediaTailor.');
      }
    } catch (e) {
      if (!this.backupUrl_.length) {
        this.streamPromise_.reject('MediaTailor request returned an error ' +
            'and there was no backup asset uri provided.');
        this.streamPromise_ = null;
        return;
      }

      shaka.log.warning('MediaTailor request returned an error. ' +
          'Falling back to the backup asset uri.');
      this.streamPromise_.resolve(this.backupUrl_);
      this.streamPromise_ = null;
    }
  }

  /**
   * @param {string} trackingUrl
   * @param {boolean} firstRequest
   * @private
   */
  async requestTrackingInfo_(trackingUrl, firstRequest) {
    const type = shaka.net.NetworkingEngine.RequestType.ADS;
    const request = shaka.net.NetworkingEngine.makeRequest(
        [trackingUrl],
        shaka.net.NetworkingEngine.defaultRetryParameters());

    const op = this.networkingEngine_.request(type, request);
    try {
      const response = await op.promise;
      let cuepoints = [];
      const data = shaka.util.StringUtils.fromUTF8(response.data);
      const dataAsJson =
        /** @type {!mediaTailor.TrackingResponse} */ (JSON.parse(data));
      if (dataAsJson.avails.length > 0) {
        if (JSON.stringify(this.adBreaks_) !=
            JSON.stringify(dataAsJson.avails)) {
          this.adBreaks_ = dataAsJson.avails;
          for (const adbreak of this.adBreaks_) {
            for (const nonLinearAd of adbreak.nonLinearAdsList) {
              for (const nonLinearAdResource of nonLinearAd.nonLinearAdList) {
                this.requestStaticResource_(nonLinearAdResource);
              }
            }
          }
          cuepoints = this.getCuePoints();
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.CUEPOINTS_CHANGED,
              (new Map()).set('cuepoints', cuepoints)));
        }
      } else {
        if (this.adBreaks_.length) {
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.CUEPOINTS_CHANGED,
              (new Map()).set('cuepoints', cuepoints)));
        }
        this.onEnded_();
        this.adBreaks_ = [];
      }
      if (firstRequest && (this.isLive_ || cuepoints.length > 0)) {
        this.setupAdBreakListeners_();
      }
    } catch (e) {}
  }

  /**
   * @param {mediaTailor.NonLinearAd} nonLinearAd
   * @private
   */
  async requestStaticResource_(nonLinearAd) {
    if (!nonLinearAd.staticResource) {
      return;
    }
    const id = this.getCacheKeyForNonLinear_(nonLinearAd);
    const staticResource = this.staticResource_.find(
        (resource) => resource.id == id);
    if (staticResource) {
      return;
    }

    const type = shaka.net.NetworkingEngine.RequestType.ADS;
    const request = shaka.net.NetworkingEngine.makeRequest(
        [nonLinearAd.staticResource],
        shaka.net.NetworkingEngine.defaultRetryParameters());

    const op = this.networkingEngine_.request(type, request);
    try {
      const response = await op.promise;
      const data = shaka.util.StringUtils.fromUTF8(response.data);
      const dataAsJson =
        /** @type {!mediaTailorExternalResource.Response} */ (JSON.parse(data));
      const apps = dataAsJson.apps;
      this.staticResource_.push({
        id: this.getCacheKeyForNonLinear_(nonLinearAd),
        apps: apps,
      });
    } catch (e) {}
  }

  /**
   * @param {mediaTailor.NonLinearAd} nonLinearAd
   * @return {string}
   * @private
   */
  getCacheKeyForNonLinear_(nonLinearAd) {
    return [
      nonLinearAd.adId,
      nonLinearAd.adParameters,
      nonLinearAd.adSystem,
      nonLinearAd.adTitle,
      nonLinearAd.creativeAdId,
      nonLinearAd.creativeId,
      nonLinearAd.creativeSequence,
      nonLinearAd.height,
      nonLinearAd.width,
      nonLinearAd.staticResource,
    ].join('');
  }

  /**
   * Setup Ad Break listeners
   *
   * @private
   */
  setupAdBreakListeners_() {
    this.onTimeupdate_();
    if (!this.isLive_) {
      this.checkForSnapback_();
      this.eventManager_.listen(this.video_, 'seeked', () => {
        this.checkForSnapback_();
      });
      this.eventManager_.listen(this.video_, 'ended', () => {
        this.onEnded_();
      });
    }
    this.eventManager_.listen(this.video_, 'timeupdate', () => {
      this.onTimeupdate_();
    });
  }

  /**
   * If a seek jumped over the ad break, return to the start of the
   * ad break, then complete the seek after the ad played through.
   *
   * @private
   */
  checkForSnapback_() {
    const currentTime = this.video_.currentTime;
    if (currentTime == 0 || this.snapForwardTime_ != null) {
      return;
    }

    let previousAdBreak;
    let previousAd;
    for (const adbreak of this.adBreaks_) {
      for (const ad of adbreak.ads) {
        if (!previousAd) {
          if (ad.startTimeInSeconds < currentTime) {
            previousAd = ad;
            previousAdBreak = adbreak;
          }
        } else if (ad.startTimeInSeconds < currentTime &&
            ad.startTimeInSeconds >
            (previousAd.startTimeInSeconds + previousAd.durationInSeconds)) {
          previousAd = ad;
          previousAdBreak = adbreak;
          break;
        }
      }
    }

    // The cue point gets marked as 'played' as soon as the playhead hits it
    // (at the start of an ad), so when we come back to this method as a result
    // of seeking back to the user-selected time, the 'played' flag will be set.
    if (previousAdBreak && previousAd &&
        !this.playedAds_.includes(previousAd.adId)) {
      shaka.log.info('Seeking back to the start of the ad break at ' +
          previousAdBreak.startTimeInSeconds +
          ' and will return to ' + currentTime);
      this.snapForwardTime_ = currentTime;
      this.video_.currentTime = previousAdBreak.startTimeInSeconds;
    }
  }

  /**
   * @private
   */
  onAdBreakEnded_() {
    const currentTime = this.video_.currentTime;
    // If the ad break was a result of snapping back (a user seeked over
    // an ad break and was returned to it), seek forward to the point,
    // originally chosen by the user.
    if (this.snapForwardTime_ && this.snapForwardTime_ > currentTime) {
      this.video_.currentTime = this.snapForwardTime_;
    }
    this.snapForwardTime_ = null;
  }

  /**
   * @private
   */
  onTimeupdate_() {
    if (!this.video_.duration) {
      // Can't play yet.  Ignore.
      return;
    }
    if (!this.ad_ && !this.adBreaks_.length) {
      // No ads
      return;
    }
    const currentTime = this.video_.currentTime;
    let previousAd = false;
    if (this.ad_) {
      previousAd = true;
      const firstQuartileTime = this.mediaTailorAd_.startTimeInSeconds +
          0.25 * this.mediaTailorAd_.durationInSeconds;
      const midpointTime = this.mediaTailorAd_.startTimeInSeconds +
          0.5 * this.mediaTailorAd_.durationInSeconds;
      const thirdQuartileTime = this.mediaTailorAd_.startTimeInSeconds +
          0.75 * this.mediaTailorAd_.durationInSeconds;
      if (!this.eventsSent.includes('firstQuartile') &&
          currentTime >= firstQuartileTime) {
        this.eventsSent.push('firstQuartile');
        this.sendTrackingEvent_('firstQuartile');
      } else if (!this.eventsSent.includes('midpoint') &&
          currentTime >= midpointTime) {
        this.eventsSent.push('midpoint');
        this.sendTrackingEvent_('midpoint');
      } else if (!this.eventsSent.includes('thirdQuartile') &&
          currentTime >= thirdQuartileTime) {
        this.eventsSent.push('thirdQuartile');
        this.sendTrackingEvent_('thirdQuartile');
      }
      const remainingTime = this.ad_.getRemainingTime();
      const duration = this.ad_.getDuration();
      if (duration > 0 && (remainingTime <= 0 || remainingTime > duration)) {
        this.onEnded_();
      }
      if (this.ad_&& this.ad_.isLinear()) {
        return;
      }
    }
    for (const adbreak of this.adBreaks_) {
      if (this.ad_ && this.ad_.isLinear()) {
        break;
      }
      for (let i = 0; i < adbreak.ads.length; i++) {
        const ad = adbreak.ads[i];
        const startTime = ad.startTimeInSeconds;
        const endTime = ad.startTimeInSeconds + ad.durationInSeconds;
        if (startTime <= currentTime && endTime > currentTime) {
          if (this.playedAds_.includes(ad.adId)) {
            if (this.video_.ended) {
              continue;
            }
            this.video_.currentTime = endTime;
            return;
          }
          this.onEnded_();
          this.mediaTailorAdBreak_ = adbreak;
          this.ad_ = new shaka.ads.MediaTailorAd(
              ad,
              /* adPosition= */ i + 1,
              /* totalAds= */ adbreak.ads.length,
              /* isLinear= */ true,
              this.video_);
          this.mediaTailorAd_ = ad;
          if (i === 0) {
            this.sendTrackingEvent_('breakStart');
          }
          this.setupCurrentAdListeners_();
          break;
        }
      }
    }
    for (const adbreak of this.adBreaks_) {
      if (this.ad_) {
        break;
      }
      for (let i = 0; i < adbreak.nonLinearAdsList.length; i++) {
        const ad = adbreak.nonLinearAdsList[i];
        if (!ad.nonLinearAdList.length) {
          continue;
        }
        const startTime = adbreak.startTimeInSeconds;
        const adId = this.getCacheKeyForNonLinear_(ad.nonLinearAdList[0]);
        const staticResource = this.staticResource_.find(
            (resource) => resource.id == adId);
        if (startTime <= currentTime && staticResource) {
          this.onEnded_();
          this.displayNonLinearAd_(staticResource.apps);
          this.mediaTailorAdBreak_ = adbreak;
          this.ad_ = new shaka.ads.MediaTailorAd(
              ad,
              /* adPosition= */ i + 1,
              /* totalAds= */ adbreak.ads.length,
              /* isLinear= */ false,
              this.video_);
          this.mediaTailorAd_ = ad;
          if (i === 0) {
            this.sendTrackingEvent_('breakStart');
          }
          this.setupCurrentAdListeners_();
          break;
        }
      }
    }
    if (previousAd && !this.ad_) {
      this.onAdBreakEnded_();
    }
  }


  /**
   * @param {!Array.<mediaTailorExternalResource.App>} apps
   * @private
   */
  displayNonLinearAd_(apps) {
    for (const app of apps) {
      if (!app.data.source.length) {
        continue;
      }
      const imageElement = document.createElement('img');
      imageElement.setAttribute('src', app.data.source[0].url);
      imageElement.style.top = (app.placeholder.top || 0) + '%';
      imageElement.style.height = (100 - (app.placeholder.top || 0)) + '%';
      imageElement.style.left = (app.placeholder.left || 0) + '%';
      imageElement.style.maxWidth = (100 - (app.placeholder.left || 0)) + '%';
      imageElement.style.objectFit = 'contain';
      imageElement.style.position = 'absolute';
      this.adContainer_.appendChild(imageElement);
    }
  }

  /**
   * @private
   */
  onEnded_() {
    if (this.ad_) {
      // Remove all child nodes
      while (this.adContainer_.lastChild) {
        this.adContainer_.removeChild(this.adContainer_.firstChild);
      }
      if (!this.isLive_) {
        this.playedAds_.push(this.mediaTailorAd_.adId);
      }
      this.removeCurrentAdListeners_();
      const position = this.ad_.getPositionInSequence();
      const totalAdsInBreak = this.ad_.getSequenceLength();
      if (position === totalAdsInBreak) {
        this.sendTrackingEvent_('breakEnd');
      }
      this.ad_ = null;
      this.mediaTailorAd_ = null;
      this.mediaTailorAdBreak_ = null;
    }
  }

  /**
   * @private
   */
  setupCurrentAdListeners_() {
    this.sendTrackingEvent_('impression');
    this.sendTrackingEvent_('start');
    this.adListeners_.push({
      target: this.video_,
      type: 'volumechange',
      listener: () => {
        if (this.video_.muted) {
          this.sendTrackingEvent_('mute');
        }
      },
    });
    this.adListeners_.push({
      target: this.video_,
      type: 'volumechange',
      listener: () => {
        if (!this.video_.muted) {
          this.sendTrackingEvent_('unmute');
        }
      },
    });
    this.adListeners_.push({
      target: this.video_,
      type: 'play',
      listener: () => {
        this.sendTrackingEvent_('resume');
      },
    });
    this.adListeners_.push({
      target: this.video_,
      type: 'pause',
      listener: () => {
        this.sendTrackingEvent_('pause');
      },
    });
    for (const listener of this.adListeners_) {
      this.eventManager_.listen(
          listener.target, listener.type, listener.listener);
    }
  }

  /**
   * @private
   */
  removeCurrentAdListeners_() {
    this.sendTrackingEvent_('complete');
    for (const listener of this.adListeners_) {
      this.eventManager_.unlisten(
          listener.target, listener.type, listener.listener);
    }
    this.adListeners_ = [];
    this.eventsSent = [];
  }

  /**
   * @param {string} eventType
   * @private
   */
  sendTrackingEvent_(eventType) {
    let trackingEvent = this.mediaTailorAd_.trackingEvents.find(
        (event) => event.eventType == eventType);
    if (!trackingEvent) {
      trackingEvent = this.mediaTailorAdBreak_.adBreakTrackingEvents.find(
          (event) => event.eventType == eventType);
    }
    if (trackingEvent) {
      const type = shaka.net.NetworkingEngine.RequestType.ADS;
      for (const beaconUrl of trackingEvent.beaconUrls) {
        if (!beaconUrl || beaconUrl == '') {
          continue;
        }
        const request = shaka.net.NetworkingEngine.makeRequest(
            [beaconUrl],
            shaka.net.NetworkingEngine.defaultRetryParameters());
        request.method = 'POST';
        this.networkingEngine_.request(type, request);
      }
    }
    switch (eventType) {
      case 'impression':
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.AdManager.AD_IMPRESSION));
        break;
      case 'start':
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STARTED,
                (new Map()).set('ad', this.ad_)));
        break;
      case 'mute':
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.AdManager.AD_MUTED));
        break;
      case 'unmute':
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.AdManager.AD_VOLUME_CHANGED));
        break;
      case 'resume':
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.AdManager.AD_RESUMED));
        break;
      case 'pause':
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.AdManager.AD_PAUSED));
        break;
      case 'firstQuartile':
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.AdManager.AD_FIRST_QUARTILE));
        break;
      case 'midpoint':
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.AdManager.AD_MIDPOINT));
        break;
      case 'thirdQuartile':
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.AdManager.AD_THIRD_QUARTILE));
        break;
      case 'complete':
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.AdManager.AD_COMPLETE));
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STOPPED));
        break;
      case 'breakStart':
        this.adContainer_.setAttribute('ad-active', 'true');
        break;
      case 'breakEnd':
        this.adContainer_.removeAttribute('ad-active');
        break;
    }
  }
};
