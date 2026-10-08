/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.InterstitialTracker');

goog.require('shaka.ads.InterstitialAdSession');
goog.require('shaka.ads.Utils');


/**
 * Sends the tracking beacons of an interstitial. Event types follow the VAST
 * tracking event names, which other formats (e.g. SVTA2053) reuse.
 *
 * @implements {shaka.ads.InterstitialAdSession.Tracker}
 */
shaka.ads.InterstitialTracker = class {
  /**
   * @param {function():!Array<shaka.ads.InterstitialTracker.Event>} getEvents
   *   Returns the current events, which may change once deferred data is
   *   resolved.
   * @param {function(string)} sendBeacon
   * @param {!Set<shaka.ads.InterstitialTracker.Event>=} fired Events already
   *   sent, which may be shared with other trackers (e.g. the slots of a pod).
   */
  constructor(getEvents, sendBeacon, fired = new Set()) {
    /** @private {function():!Array<shaka.ads.InterstitialTracker.Event>} */
    this.getEvents_ = getEvents;
    /** @private {function(string)} */
    this.sendBeacon_ = sendBeacon;
    /** @private {!Set<shaka.ads.InterstitialTracker.Event>} */
    this.fired_ = fired;
    /** @private {boolean} */
    this.released_ = false;
  }

  /** @override */
  release() {
    this.released_ = true;
  }

  /** @override */
  resolve() {
    return Promise.resolve();
  }

  /** @override */
  onEvent(type) {
    const name = shaka.ads.InterstitialTracker.getName(type);
    if (name) {
      this.fire(name);
    }
  }

  /** @override */
  onProgress(previous, position) {
    if (this.released_) {
      return;
    }
    for (const event of this.getEvents_()) {
      if (event.offset == null || this.fired_.has(event) ||
          event.offset < previous || event.offset > position) {
        continue;
      }
      this.fired_.add(event);
      for (const url of event.urls) {
        this.sendBeacon_(url);
      }
    }
  }

  /**
   * Sends the beacons of the given event type. Events that describe a state
   * are sent once; events that describe an action are sent every time.
   *
   * @param {string} name
   */
  fire(name) {
    if (this.released_) {
      return;
    }
    const repeated = shaka.ads.InterstitialTracker.isRepeated(name);
    for (const event of this.getEvents_()) {
      if (event.type != name || event.offset != null ||
          (!repeated && this.fired_.has(event))) {
        continue;
      }
      if (!repeated) {
        this.fired_.add(event);
      }
      for (const url of event.urls) {
        this.sendBeacon_(url);
      }
    }
  }

  /**
   * @param {string} type An ad event type, or a VAST tracking event name.
   * @return {?string} The VAST tracking event name.
   */
  static getName(type) {
    const InterstitialTracker = shaka.ads.InterstitialTracker;
    return InterstitialTracker.NAMES_.get(type) ||
        (InterstitialTracker.REPEATED_.has(type) ? type : null);
  }

  /**
   * Whether the event describes an action, which is reported every time it
   * happens, rather than a state, which is reported once.
   *
   * @param {string} name
   * @return {boolean}
   */
  static isRepeated(name) {
    return shaka.ads.InterstitialTracker.REPEATED_.has(name);
  }

  /**
   * @param {?shaka.extern.AdTrackingEvent} tracking
   * @return {!Array<shaka.ads.InterstitialTracker.Event>}
   */
  static fromTracking(tracking) {
    const events = [];
    if (tracking) {
      for (const type of Object.keys(tracking)) {
        const urls = tracking[type];
        if (urls && urls.length) {
          events.push({type, urls});
        }
      }
    }
    return events;
  }
};


/**
 * @typedef {{
 *   type: string,
 *   offset: (number|undefined),
 *   urls: !Array<string>,
 * }}
 *
 * @property {string} type
 *   The VAST tracking event name.
 * @property {(number|undefined)} offset
 *   The position, in seconds, of a progress event.
 * @property {!Array<string>} urls
 *   The beacon URLs, which may contain VAST macros.
 */
shaka.ads.InterstitialTracker.Event;


/**
 * Maps ad events to tracking event names.
 *
 * @private @const {!Map<string, string>}
 */
shaka.ads.InterstitialTracker.NAMES_ = new Map([
  [shaka.ads.Utils.AD_IMPRESSION, 'impression'],
  [shaka.ads.Utils.AD_STARTED, 'start'],
  [shaka.ads.Utils.AD_LOADED, 'loaded'],
  [shaka.ads.Utils.AD_FIRST_QUARTILE, 'firstQuartile'],
  [shaka.ads.Utils.AD_MIDPOINT, 'midpoint'],
  [shaka.ads.Utils.AD_THIRD_QUARTILE, 'thirdQuartile'],
  [shaka.ads.Utils.AD_COMPLETE, 'complete'],
  [shaka.ads.Utils.AD_SKIPPED, 'skip'],
  [shaka.ads.Utils.AD_ERROR, 'error'],
  [shaka.ads.Utils.AD_CLICKED, 'clickTracking'],
  [shaka.ads.Utils.AD_PAUSED, 'pause'],
  [shaka.ads.Utils.AD_RESUMED, 'resume'],
  [shaka.ads.Utils.AD_MUTED, 'mute'],
  [shaka.ads.Utils.AD_VOLUME_CHANGED, 'unmute'],
]);


/**
 * Tracking events that describe an action, so they are sent every time.
 *
 * @private @const {!Set<string>}
 */
shaka.ads.InterstitialTracker.REPEATED_ = new Set([
  'pause', 'resume', 'mute', 'unmute', 'clickTracking', 'error',
  'playerExpand', 'playerCollapse',
]);
