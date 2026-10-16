/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.InterstitialAdSession');

goog.require('shaka.ads.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IReleasable');

goog.requireType('shaka.ads.InterstitialAd');
goog.requireType('shaka.net.NetworkingEngine');


/**
 * Owns the playback clock and measurement state of one interstitial. State
 * belongs to the session, so a callback from an earlier ad cannot track the
 * next ad in a pod. Format specific measurement is delegated to an optional
 * tracker.
 *
 * @implements {shaka.util.IReleasable}
 */
shaka.ads.InterstitialAdSession = class {
  /**
   * @param {!HTMLMediaElement} video
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @param {!shaka.ads.InterstitialAd} ad
   * @param {function(string)} onEvent
   * @param {function():number=} contentPosition
   */
  constructor(video, interstitial, ad, onEvent,
      contentPosition = () => video.currentTime) {
    /** @private {!HTMLMediaElement} */
    this.video_ = video;
    /** @private {!shaka.extern.AdInterstitial} */
    this.interstitial_ = interstitial;
    /** @private {!shaka.ads.InterstitialAd} */
    this.ad_ = ad;
    /** @private {function(string)} */
    this.onEvent_ = onEvent;
    /** @private {function():number} */
    this.contentPosition_ = contentPosition;
    /** @private {?shaka.ads.InterstitialAdSession.Tracker} */
    this.tracker_ = null;
    /** @private {boolean} */
    this.canSkip_ = false;
    /** @private {!Array<{start: number, end: number}>} */
    this.playedRanges_ = [];
    /** @private {!Set<string>} */
    this.quartiles_ = new Set();
    /** @private {?number} */
    this.lastPosition_ = null;
    /** @private {boolean} */
    this.started_ = false;
    /** @private {boolean} */
    this.paused_ = false;
    /** @private {boolean} */
    this.muted_ = video.muted;
    /** @private {boolean} */
    this.completed_ = false;
    /** @private {boolean} */
    this.seeked_ = false;
    /** @private {boolean} */
    this.released_ = false;
    /** @private {!shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();
    this.eventManager_.listen(video, 'seeking', () => {
      // A seek establishes a new clock origin; it never represents watched
      // media between the old and new playhead positions.
      this.lastPosition_ = null;
      this.completed_ = false;
      this.seeked_ = true;
    });
    this.eventManager_.listen(video, 'timeupdate', () => this.update());
    this.eventManager_.listen(video, 'playing', () => this.update());
  }

  /**
   * Attaches the format specific tracker, if any, and resolves its deferred
   * data. Data that becomes available later is delivered without replaying
   * events that were already sent.
   *
   * @param {?shaka.ads.InterstitialAdSession.Tracker} tracker
   */
  setTracker(tracker) {
    this.tracker_ = tracker;
    if (!tracker) {
      return;
    }
    shaka.util.Dom.listenForPlayerExpansion(this.eventManager_, this.video_,
        (expanded) => {
          this.notify(expanded ? 'playerExpand' : 'playerCollapse');
        });
    tracker.resolve().then(() => this.refresh());
  }

  /** @override */
  release() {
    this.released_ = true;
    this.eventManager_.release();
    if (this.tracker_) {
      this.tracker_.release();
      this.tracker_ = null;
    }
  }

  /** @return {!shaka.util.EventManager} */
  getEventManager() {
    return this.eventManager_;
  }

  /**
   * The playhead position relative to the start of the interstitial.
   *
   * @return {number}
   */
  getPosition() {
    return this.interstitial_.playbackMode == shaka.ads.Utils.EMBEDDED ?
        this.video_.currentTime - this.interstitial_.startTime :
        this.video_.currentTime;
  }

  /**
   * Whether the user seeked during the interstitial. Browsers fire
   * timeupdate before seeked, so the seeked event alone is not enough to tell
   * a skip from the natural end of the interstitial.
   *
   * @return {boolean}
   */
  hasSeeked() {
    return this.seeked_;
  }

  /** @return {boolean} */
  canComplete() {
    this.update();
    return this.completed_;
  }

  /**
   * Advances measurement only over media played at normal speed. Quartiles
   * and offset events crossed by seeks or fast playback are not backfilled.
   */
  update() {
    if (this.released_ || this.video_.readyState < 2 ||
        this.ad_.getDuration() <= 0) {
      return;
    }
    const position = this.getPosition();
    const duration = this.ad_.getDuration();
    if (this.video_.seeking ||
        (this.video_.paused && !this.video_.ended && position < duration)) {
      this.lastPosition_ = null;
      return;
    }
    const Utils = shaka.ads.Utils;
    if (!this.started_) {
      this.started_ = true;
      if (position < 0.1) {
        this.lastPosition_ = 0;
      }
      this.notify(Utils.AD_LOADED);
      this.notify(Utils.AD_IMPRESSION);
      this.notify(Utils.AD_STARTED);
    }
    if (this.interstitial_.playbackMode == shaka.ads.Utils.EMBEDDED &&
        this.canSkip_ != this.ad_.canSkipNow()) {
      this.canSkip_ = this.ad_.canSkipNow();
      this.onEvent_(Utils.AD_SKIP_STATE_CHANGED);
    }
    if (this.video_.playbackRate != 1) {
      this.lastPosition_ = null;
      return;
    }
    const previous = this.lastPosition_;
    this.lastPosition_ = position;
    if (previous == null || position < previous) {
      return;
    }
    const lastRange = this.playedRanges_[this.playedRanges_.length - 1];
    if (lastRange && lastRange.end == previous) {
      lastRange.end = position;
    } else {
      this.playedRanges_.push({start: previous, end: position});
    }
    const quartiles = [
      {fraction: 0.25, type: Utils.AD_FIRST_QUARTILE},
      {fraction: 0.5, type: Utils.AD_MIDPOINT},
      {fraction: 0.75, type: Utils.AD_THIRD_QUARTILE},
    ];
    for (const quartile of quartiles) {
      const threshold = duration * quartile.fraction;
      if (previous <= threshold && position >= threshold &&
          !this.quartiles_.has(quartile.type)) {
        this.quartiles_.add(quartile.type);
        this.onEvent_(quartile.type);
      }
    }
    if (this.tracker_) {
      this.tracker_.onProgress(previous, position);
    }
    // Reaching the end of the media while measuring is a completion, even
    // when the media is slightly shorter than the signaled duration.
    this.completed_ = this.completed_ || this.video_.ended ||
        (position >= duration && previous < duration);
  }

  /**
   * Forwards an ad event to the tracker. Events describing playback are only
   * forwarded once playback has actually started.
   *
   * @param {string} type
   */
  notify(type) {
    const Utils = shaka.ads.Utils;
    if (!this.tracker_ || this.released_) {
      return;
    }
    // AD_STARTED announces the ad object before external media has loaded.
    // Start and impression are measured on actual playback instead.
    if (!this.started_ && type != Utils.AD_LOADED && type != Utils.AD_ERROR) {
      return;
    }
    if (type == Utils.AD_PAUSED) {
      this.paused_ = true;
    } else if (type == Utils.AD_RESUMED) {
      if (!this.paused_) {
        return;
      }
      this.paused_ = false;
    } else if (type == Utils.AD_MUTED || type == Utils.AD_VOLUME_CHANGED) {
      if (this.video_.muted == this.muted_) {
        return;
      }
      this.muted_ = this.video_.muted;
    }
    this.tracker_.onEvent(type);
  }

  /**
   * Delivers data that became valid while it was being resolved, without
   * replaying events that were already delivered.
   */
  refresh() {
    if (this.released_) {
      return;
    }
    if (this.started_ && this.tracker_) {
      const Utils = shaka.ads.Utils;
      this.tracker_.onEvent(Utils.AD_LOADED);
      this.tracker_.onEvent(Utils.AD_IMPRESSION);
      this.tracker_.onEvent(Utils.AD_STARTED);
      for (const type of this.quartiles_) {
        this.tracker_.onEvent(type);
      }
      for (const range of this.playedRanges_) {
        this.tracker_.onProgress(range.start, range.end);
      }
    }
    this.update();
  }

  /**
   * Expands known VAST macros and uses the VAST unavailable value for context
   * the player cannot supply. Apps may still add context via request filters.
   *
   * @param {string} uri
   * @return {string}
   */
  expandUri(uri) {
    const pad = (value) => (value < 10 ? '0' : '') + value;
    const time = (seconds) => {
      const value = Math.max(0, seconds);
      return pad(Math.floor(value / 3600)) + ':' +
          pad(Math.floor(value / 60 % 60)) + ':' +
          (value % 60 < 10 ? '0' : '') + (value % 60).toFixed(3);
    };
    // Eight random digits, keeping the leading zeros.
    const random = String(1e8 + Math.floor(Math.random() * 1e8)).slice(1);
    const macros = {
      'CACHEBUSTING': random,
      'RANDOM': random,
      'TIMESTAMP': new Date().toISOString(),
      'ADPLAYHEAD': time(this.getPosition()),
      'CONTENTPLAYHEAD': time(this.contentPosition_()),
      'ASSETURI': this.interstitial_.uri || this.video_.currentSrc,
      'ADTYPE': this.ad_.isLinear() ? '1' : '2',
      'ADID': this.ad_.getAdId(),
      'PLAYERSIZE': this.video_.clientWidth + ',' + this.video_.clientHeight,
      'PLAYERSTATE': this.video_.paused ? 'paused' : 'playing',
    };
    return uri.replace(/\[([A-Z0-9_]+)\]|%5B([A-Z0-9_]+)%5D/gi,
        (match, plain, encoded) => encodeURIComponent(
            macros[(plain || encoded).toUpperCase()] || '-1'));
  }
};


/**
 * Format specific measurement of one interstitial.
 *
 * @interface
 * @extends {shaka.util.IReleasable}
 */
shaka.ads.InterstitialAdSession.Tracker = class {
  /**
   * Called for every ad event of the interstitial. May be called again with
   * the same event when deferred data is resolved.
   *
   * @param {string} type
   */
  onEvent(type) {}

  /**
   * Called when media between two positions (relative to the start of the
   * interstitial) was played at normal speed.
   *
   * @param {number} previous
   * @param {number} position
   */
  onProgress(previous, position) {}

  /**
   * Resolves data required for measurement that is not available yet.
   *
   * @return {!Promise}
   */
  resolve() {}
};


/**
 * Creates the tracker of an interstitial, or null if it has nothing to track.
 * It is given a function that sends a tracking beacon, expanding its macros,
 * and a function that fetches a resource.
 *
 * @typedef {function(!shaka.extern.AdInterstitial,
 *     !shaka.ads.InterstitialAdSession, function(string),
 *     function(string):!shaka.net.NetworkingEngine.PendingRequest):
 *     ?shaka.ads.InterstitialAdSession.Tracker}
 */
shaka.ads.InterstitialAdSession.TrackerFactory;
