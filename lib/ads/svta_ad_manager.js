/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.SvtaAdManager');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.Player');
goog.require('shaka.ads.SvtaAd');
goog.require('shaka.ads.Utils');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.NumberUtils');
goog.require('shaka.util.Timer');
goog.require('shaka.util.TXml');


/**
 * A class responsible for SVTA2053-2: Ad Creative Signaling in DASH and HLS.
 *
 * @implements {shaka.util.IReleasable}
 */
shaka.ads.SvtaAdManager = class {
  /**
   * @param {shaka.Player} player
   * @param {function(!shaka.util.FakeEvent)} onEvent
   */
  constructor(player, onEvent) {
    /** @private {?shaka.extern.AdsConfiguration} */
    this.config_ = null;

    /** @private {?shaka.Player} */
    this.player_ = player;

    /** @private {function(!shaka.util.FakeEvent)} */
    this.onEvent_ = onEvent;

    /** @private {?HTMLMediaElement} */
    this.video_ = null;

    /** @private {boolean} */
    this.playbackStarted_ = false;

    /** @private {Map<string, shaka.extern.AdTrackingInfo>} */
    this.trackings_ = new Map();

    /** @private {?shaka.extern.AdTrackingInfo} */
    this.currentTracking_ = null;

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {shaka.util.EventManager} */
    this.playbackEventManager_ = new shaka.util.EventManager();

    /** @private {shaka.util.EventManager} */
    this.trackingEventManager_ = new shaka.util.EventManager();

    this.eventManager_.listen(this.player_, 'loading', () => {
      this.playbackStart_();
    });

    this.eventManager_.listen(this.player_, 'unloading', () => {
      this.playbackEnd_();
    });

    /** @private {shaka.util.Timer} */
    this.pollTimer_ = new shaka.util.Timer(() => {
      if (this.trackings_.size) {
        const currentLoadMode = this.player_.getLoadMode();
        if (currentLoadMode == shaka.Player.LoadMode.DESTROYED ||
            currentLoadMode == shaka.Player.LoadMode.NOT_LOADED) {
          return;
        }
        let cuepointsChanged = false;
        const trackings = Array.from(this.trackings_.values());
        const seekRange = this.player_.seekRange();
        for (const tracking of trackings) {
          if (tracking == this.currentTracking_) {
            continue;
          }
          const comparisonTime = tracking.endTime || tracking.startTime;
          if ((seekRange.start - comparisonTime) >= 1) {
            const id = JSON.stringify(tracking);
            this.trackings_.delete(id);
            cuepointsChanged = true;
          }
        }
        if (cuepointsChanged) {
          this.cuepointsChanged_();
        }
      }
    });
  }

  /**
   * Called by the AdManager to provide an updated configuration any time it
   * changes.
   *
   * @param {shaka.extern.AdsConfiguration} config
   */
  configure(config) {
    this.config_ = config;
  }

  /**
   * @override
   */
  release() {
    this.video_ = null;
    this.playbackStarted_ = false;
    this.trackings_.clear();
    this.unSetupCurrentTracking_();
    this.player_ = null;
    if (this.eventManager_) {
      this.eventManager_.release();
    }
    if (this.playbackEventManager_) {
      this.playbackEventManager_.release();
    }
    if (this.trackingEventManager_) {
      this.trackingEventManager_.release();
    }
    if (this.pollTimer_) {
      this.pollTimer_.stop();
      this.pollTimer_ = null;
    }
  }

  /**
   * @param {shaka.extern.HLSMetadata} metadata
   */
  addMetadata(metadata) {
    if (!this.playbackStarted_) {
      return;
    }
    if (!shaka.ads.SvtaAdManager.validSchemes_.has(metadata.type)) {
      return;
    }
    const signaling =
        metadata.values.find((v) => v.key == 'X-AD-CREATIVE-SIGNALING');
    if (!signaling) {
      return;
    }
    const base64 = /** @type {string} */(signaling.data);
    /** @type {?shaka.extern.AdCreativeSignaling.CarriageEnvelope} */
    let json;
    try {
      json = /** @type {!shaka.extern.AdCreativeSignaling.CarriageEnvelope} */ (
        JSON.parse(window.atob(base64)));
    } catch (e) {
      return;
    }
    if (!json.payload) {
      return;
    }
    const trackings = [];
    for (let i = 0; i < json.payload.length; i++) {
      const payloadSlot = json.payload[i];
      goog.asserts.assert(typeof metadata.startTime == 'number',
          'startTime must not be null!');
      const startTime = metadata.startTime + payloadSlot.start || 0;
      const endTime = payloadSlot.duration ?
          metadata.startTime + payloadSlot.duration : metadata.endTime;
      if (payloadSlot && payloadSlot.tracking) {
        const Utils = shaka.ads.Utils;
        /** @type {shaka.extern.AdTrackingInfo} */
        const trackingInfo = {
          startTime,
          endTime,
          tracking: Utils.createTrackingFromEvents(payloadSlot.tracking),
          position: i + 1,
          sequenceLength: json.payload.length,
        };
        trackings.push(trackingInfo);
      }
    }
    this.addTracking_(trackings);
  }

  /**
   * @param {shaka.extern.TimelineRegionInfo} region
   */
  addRegion(region) {
    const TXml = shaka.util.TXml;
    if (!this.playbackStarted_) {
      return;
    }
    if (!shaka.ads.SvtaAdManager.validSchemes_.has(region.schemeIdUri) ||
      !region.eventNode) {
      return;
    }
    const text = TXml.getTextContents(region.eventNode);
    if (!text) {
      return;
    }
    /** @type {?shaka.extern.AdCreativeSignaling.CarriageEnvelope} */
    let json;
    try {
      json = /** @type {!shaka.extern.AdCreativeSignaling.CarriageEnvelope} */ (
        JSON.parse(text));
    } catch (e) {
      return;
    }
    if (!json.payload) {
      return;
    }
    const trackings = [];
    for (let i = 0; i < json.payload.length; i++) {
      const payloadSlot = json.payload[i];
      const startTime = region.startTime + payloadSlot.start || 0;
      const endTime = payloadSlot.duration ?
          region.startTime + payloadSlot.duration : region.endTime;
      if (payloadSlot && payloadSlot.tracking) {
        const Utils = shaka.ads.Utils;
        /** @type {shaka.extern.AdTrackingInfo} */
        const trackingInfo = {
          startTime,
          endTime,
          tracking: Utils.createTrackingFromEvents(payloadSlot.tracking),
          position: i + 1,
          sequenceLength: json.payload.length,
        };
        trackings.push(trackingInfo);
      }
    }
    this.addTracking_(trackings);
  }

  /**
   * @param {!Array<shaka.extern.AdTrackingInfo>} trackings
   * @private
   */
  addTracking_(trackings) {
    if (!this.playbackStarted_ || !trackings.length) {
      return;
    }
    if (!this.player_.isFullyLoaded()) {
      this.playbackEventManager_.listenOnce(this.player_, 'loaded', () => {
        this.addTracking_(trackings);
      });
      return;
    }
    let cuepointsChanged = false;
    for (const tracking of trackings) {
      const id = JSON.stringify(tracking);
      if (!this.trackings_.has(id)) {
        this.trackings_.set(id, tracking);
        cuepointsChanged = true;
      }
    }
    if (cuepointsChanged) {
      this.cuepointsChanged_();
    }
    this.setupCurrentTracking_();
    this.playbackEventManager_.listen(
        this.video_, 'timeupdate', () => this.setupCurrentTracking_());
    if (this.pollTimer_ && this.player_.isLive()) {
      this.pollTimer_.tickEvery(/* seconds= */ 1);
    }
  }

  /**
   * @private
   */
  playbackStart_() {
    if (this.playbackStarted_) {
      return;
    }
    this.playbackStarted_ = true;
    this.video_ = this.player_.getMediaElement();
  }

  /**
   * @private
   */
  playbackEnd_() {
    if (!this.playbackStarted_) {
      return;
    }
    this.playbackStarted_ = false;
    this.video_ = null;
    this.playbackEventManager_.removeAll();
    this.trackings_.clear();
    this.unSetupCurrentTracking_();
    this.trackingEventManager_.removeAll();

    if (this.pollTimer_) {
      this.pollTimer_.stop();
    }
  }

  /**
   * @private
   */
  setupCurrentTracking_() {
    if (!this.trackings_.size || this.currentTracking_ ||
        !this.video_.duration) {
      return;
    }
    const currentTime = this.video_.currentTime;
    for (const tracking of this.trackings_.values()) {
      if (tracking.startTime <= currentTime && (tracking.endTime &&
          currentTime <= tracking.endTime) && !this.player_.isEnded()) {
        this.currentTracking_ = tracking;
        break;
      }
    }
    if (!this.currentTracking_) {
      return;
    }
    shaka.log.info('Found tracking', this.currentTracking_);
    let singleSetup = false;
    if (!this.player_.isLive()) {
      const seekRange = this.player_.seekRange();
      singleSetup = seekRange.start === this.currentTracking_.startTime &&
          seekRange.end === this.currentTracking_.endTime;
    }
    this.createBaseSetupTracking_();
    if (singleSetup) {
      this.createSingleSetupTracking_();
    } else {
      this.createSlidingSetupTracking_();
    }
  }

  /**
   * @param {boolean=} complete
   * @private
   */
  unSetupCurrentTracking_(complete = false) {
    if (!this.currentTracking_) {
      return;
    }
    if (!complete) {
      this.sendEvent_(shaka.ads.Utils.AD_SKIPPED);
      this.sendEvent_(shaka.ads.Utils.AD_STOPPED);
    }
    this.trackingEventManager_.removeAll();
    this.currentTracking_ = null;
  }

  /**
   * @private
   */
  createBaseSetupTracking_() {
    goog.asserts.assert(this.currentTracking_,
        'AdTrackingInfo must not be null!');
    const ad = new shaka.ads.SvtaAd(this.video_, this.currentTracking_);
    this.sendEvent_(shaka.ads.Utils.AD_IMPRESSION);
    this.sendEvent_(shaka.ads.Utils.AD_STARTED, (new Map()).set('ad', ad));

    this.trackingEventManager_.listen(this.player_, 'error', (e) => {
      this.sendEvent_(shaka.ads.Utils.AD_ERROR,
          (new Map()).set('originalEvent', e));
    });
    this.trackingEventManager_.listen(this.video_, 'play', () => {
      this.sendEvent_(shaka.ads.Utils.AD_RESUMED);
    });
    this.trackingEventManager_.listen(this.video_, 'pause', () => {
      this.sendEvent_(shaka.ads.Utils.AD_PAUSED);
    });
    this.trackingEventManager_.listen(this.video_, 'volumechange', () => {
      if (this.video_.muted) {
        this.sendEvent_(shaka.ads.Utils.AD_MUTED);
      } else {
        this.sendEvent_(shaka.ads.Utils.AD_VOLUME_CHANGED);
      }
    });
  }

  /**
   * @private
   */
  createSingleSetupTracking_() {
    this.trackingEventManager_.listenOnce(this.player_, 'firstquartile', () => {
      this.sendEvent_(shaka.ads.Utils.AD_FIRST_QUARTILE);
    });
    this.trackingEventManager_.listenOnce(this.player_, 'midpoint', () => {
      this.sendEvent_(shaka.ads.Utils.AD_MIDPOINT);
    });
    this.trackingEventManager_.listenOnce(this.player_, 'thirdquartile', () => {
      this.sendEvent_(shaka.ads.Utils.AD_THIRD_QUARTILE);
    });
    this.trackingEventManager_.listenOnce(this.player_, 'complete', () => {
      this.sendEvent_(shaka.ads.Utils.AD_STOPPED);
      this.sendEvent_(shaka.ads.Utils.AD_COMPLETE);
      this.unSetupCurrentTracking_(/* complete= */ true);
    });
  }

  /**
   * @private
   */
  createSlidingSetupTracking_() {
    let endTime = this.currentTracking_.endTime;
    if (!this.player_.isLive() || !endTime) {
      const seekRange = this.player_.seekRange();
      endTime = Math.min(
          seekRange.end, this.currentTracking_.endTime || Infinity);
    }
    const duration = endTime - this.currentTracking_.startTime;

    let completionPercent_ = -1;

    const isQuartile = (quartilePercent, currentPercent) => {
      const NumberUtils = shaka.util.NumberUtils;
      if ((NumberUtils.isFloatEqual(quartilePercent, currentPercent) ||
          currentPercent > quartilePercent) &&
          completionPercent_ < quartilePercent) {
        completionPercent_ = quartilePercent;
        return true;
      }
      return false;
    };

    this.trackingEventManager_.listen(this.video_, 'timeupdate', () => {
      const currentTime =
          this.video_.currentTime - this.currentTracking_.startTime;
      const completionRatio = currentTime / duration;

      if (isNaN(completionRatio)) {
        return;
      }

      const percent = completionRatio * 100;

      if (isQuartile(25, percent)) {
        this.sendEvent_(shaka.ads.Utils.AD_FIRST_QUARTILE);
      } else if (isQuartile(50, percent)) {
        this.sendEvent_(shaka.ads.Utils.AD_MIDPOINT);
      } else if (isQuartile(75, percent)) {
        this.sendEvent_(shaka.ads.Utils.AD_THIRD_QUARTILE);
      } else if (isQuartile(100, percent) || percent > 100) {
        this.sendEvent_(shaka.ads.Utils.AD_STOPPED);
        this.sendEvent_(shaka.ads.Utils.AD_COMPLETE);
        this.unSetupCurrentTracking_(/* complete= */ true);
      }
    });
  }


  /**
   * @param {string} type
   * @param {Map<string, Object>=} dict
   * @private
   */
  sendEvent_(type, dict) {
    shaka.log.info('SVTA event', type);
    this.onEvent_(new shaka.util.FakeEvent(type, dict));
    this.processTrackingEvent_(type);
  }

  /**
   * @param {string} type
   * @private
   */
  processTrackingEvent_(type) {
    if (this.config_.disableTrackingEvents) {
      return;
    }
    const tracking = this.currentTracking_ && this.currentTracking_.tracking;
    if (tracking) {
      let urls;
      switch (type) {
        case shaka.ads.Utils.AD_IMPRESSION:
          urls = tracking.impression;
          break;
        case shaka.ads.Utils.AD_CLICKED:
          urls = tracking.clickTracking;
          break;
        case shaka.ads.Utils.AD_STARTED:
          urls = tracking.start;
          break;
        case shaka.ads.Utils.AD_FIRST_QUARTILE:
          urls = tracking.firstQuartile;
          break;
        case shaka.ads.Utils.AD_MIDPOINT:
          urls = tracking.midpoint;
          break;
        case shaka.ads.Utils.AD_THIRD_QUARTILE:
          urls = tracking.thirdQuartile;
          break;
        case shaka.ads.Utils.AD_COMPLETE:
          urls = tracking.complete;
          break;
        case shaka.ads.Utils.AD_SKIPPED:
          urls = tracking.skip;
          break;
        case shaka.ads.Utils.AD_ERROR:
          urls = tracking.error;
          break;
        case shaka.ads.Utils.AD_RESUMED:
          urls = tracking.resume;
          break;
        case shaka.ads.Utils.AD_PAUSED:
          urls = tracking.pause;
          break;
        case shaka.ads.Utils.AD_MUTED:
          urls = tracking.mute;
          break;
        case shaka.ads.Utils.AD_VOLUME_CHANGED:
          urls = tracking.unmute;
          break;
      }
      if (urls) {
        for (const url of urls) {
          this.sendTrackingEvent_(url);
        }
      }
    }
  }

  /**
   * @param {string} url
   * @private
   */
  sendTrackingEvent_(url) {
    const NetworkingEngine = shaka.net.NetworkingEngine;
    const context = {
      type: NetworkingEngine.AdvancedRequestType.TRACKING_EVENT,
    };
    const type = shaka.net.NetworkingEngine.RequestType.ADS;
    const request = shaka.net.NetworkingEngine.makeRequest(
        [url],
        shaka.net.NetworkingEngine.defaultRetryParameters());
    request.method = 'POST';
    this.player_.getNetworkingEngine().request(type, request, context);
  }


  /**
   * @private
   */
  cuepointsChanged_() {
    /** @type {!Array<!shaka.extern.AdCuePoint>} */
    const cuePoints = [];
    if (this.trackings_.size) {
      for (const tracking of this.trackings_.values()) {
        /** @type {shaka.extern.AdCuePoint} */
        const shakaCuePoint = {
          start: tracking.startTime,
          end: tracking.endTime,
        };
        const isValid = !cuePoints.find((c) => {
          return shakaCuePoint.start == c.start && shakaCuePoint.end == c.end;
        });
        if (isValid) {
          cuePoints.push(shakaCuePoint);
        }
      }
    }
    this.sendEvent_(shaka.ads.Utils.CUEPOINTS_CHANGED,
        (new Map()).set('cuepoints', cuePoints));
  }
};


/**
 * @const {!Set<string>}
 * @private
 */
shaka.ads.SvtaAdManager.validSchemes_ = new Set()
    .add('urn:svta:advertising-wg:ad-id-signaling')
    .add('urn:svta:advertising-wg:ad-creative-signaling');
