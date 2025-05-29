/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.FakeEvent');

goog.require('goog.asserts');


/**
 * @summary Create an Event work-alike object based on the provided dictionary.
 * The event should contain all of the same properties from the dict.
 *
 * @extends {Event}
 * @export
 */
shaka.util.FakeEvent = class {
  /**
   * @param {!Event} event
   * @return {!shaka.util.FakeEvent}
   */
  static fromRealEvent(event) {
    const fakeEvent = new shaka.util.FakeEvent(event.type);
    for (const key in event) {
      Object.defineProperty(fakeEvent, key, {
        value: event[key],
        writable: true,
        enumerable: true,
      });
    }
    return fakeEvent;
  }

  /**
   * Allows us to tell the compiler that the dictionary "map" is actually a
   * generic object, for backwards compatibility.
   * @param {!Map<string, Object>} dict
   * @return {!Object}
   * @suppress {invalidCasts}
   * @private
   */
  static recastDictAsObject_(dict) {
    goog.asserts.assert(!(dict instanceof Map), 'dict should not be a map');
    return /** @type {!Object} */ (dict);
  }

  /**
   * @param {string} type
   * @param {Map<string, Object>=} dict
   */
  constructor(type, dict) {
    if (dict) {
      if (dict instanceof Map) {
        // Take properties from dict if present.
        for (const key of dict.keys()) {
          Object.defineProperty(this, key, {
            value: dict.get(key),
            writable: true,
            enumerable: true,
          });
        }
      } else {
        // For backwards compatibility with external apps that may make use of
        // this public constructor, this should still accept generic objects.
        const obj = shaka.util.FakeEvent.recastDictAsObject_(dict);
        for (const key in obj) {
          Object.defineProperty(this, key, {
            value: obj[key],
            writable: true,
            enumerable: true,
          });
        }
      }
    }

    // The properties below cannot be set by the dict.  They are all provided
    // for compatibility with native events.

    /** @const {boolean} */
    this.bubbles = false;

    /** @type {boolean} */
    this.cancelable = false;

    /** @type {boolean} */
    this.defaultPrevented = false;

    /**
     * According to MDN, Chrome uses high-res timers instead of epoch time.
     * Follow suit so that timeStamps on FakeEvents use the same base as
     * on native Events.
     * @const {number}
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp
     */
    this.timeStamp = window.performance && window.performance.now ?
        window.performance.now() : Date.now();

    /** @const {string} */
    this.type = type;

    /** @const {boolean} */
    this.isTrusted = false;

    /** @type {EventTarget} */
    this.currentTarget = null;

    /** @type {EventTarget} */
    this.target = null;

    /**
     * Non-standard property read by FakeEventTarget to stop processing
     * listeners.
     * @type {boolean}
     */
    this.stopped = false;
  }

  /**
   * Prevents the default action of the event.  Has no effect if the event isn't
   * cancellable.
   * @override
   */
  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }

  /**
   * Stops processing event listeners for this event.  Provided for
   * compatibility with native Events.
   * @override
   */
  stopImmediatePropagation() {
    this.stopped = true;
  }

  /**
   * Does nothing, since FakeEvents do not bubble.  Provided for compatibility
   * with native Events.
   * @override
   */
  stopPropagation() {}
};


/**
 * An internal enum that contains the string values of all of the player events.
 * This exists primarily to act as an implicit list of events, for tests.
 *
 * @enum {string}
 */
shaka.util.FakeEvent.EventName = {
  AbrStatusChanged: 'abrstatuschanged',
  Adaptation: 'adaptation',
  AudioTrackChanged: 'audiotrackchanged',
  AudioTracksChanged: 'audiotrackschanged',
  BoundaryCrossed: 'boundarycrossed',
  Buffering: 'buffering',
  CanUpdateStartTime: 'canupdatestarttime',
  Complete: 'complete',
  CurrentItemChanged: 'currentitemchanged',
  DownloadCompleted: 'downloadcompleted',
  DownloadFailed: 'downloadfailed',
  DownloadHeadersReceived: 'downloadheadersreceived',
  DrmSessionUpdate: 'drmsessionupdate',
  Emsg: 'emsg',
  ItemsInserted: 'itemsinserted',
  ItemsRemoved: 'itemsremoved',
  Prft: 'prft',
  Error: 'error',
  ExpirationUpdated: 'expirationupdated',
  FirstQuartile: 'firstquartile',
  GapJumped: 'gapjumped',
  KeyStatusChanged: 'keystatuschanged',
  Loaded: 'loaded',
  Loading: 'loading',
  ManifestParsed: 'manifestparsed',
  ManifestUpdated: 'manifestupdated',
  MediaQualityChanged: 'mediaqualitychanged',
  MediaSourceRecovered: 'mediasourcerecovered',
  MetadataAdded: 'metadataadded',
  Metadata: 'metadata',
  Midpoint: 'midpoint',
  NoSpatialVideoInfoEvent: 'nospatialvideoinfo',
  OnStateChange: 'onstatechange',
  RateChange: 'ratechange',
  SegmentAppended: 'segmentappended',
  SessionDataEvent: 'sessiondata',
  SpatialVideoInfoEvent: 'spatialvideoinfo',
  StallDetected: 'stalldetected',
  Started: 'started',
  StateChanged: 'statechanged',
  Streaming: 'streaming',
  TextChanged: 'textchanged',
  TextTrackVisibility: 'texttrackvisibility',
  ThirdQuartile: 'thirdquartile',
  TimelineRegionAdded: 'timelineregionadded',
  TimelineRegionEnter: 'timelineregionenter',
  TimelineRegionExit: 'timelineregionexit',
  TracksChanged: 'trackschanged',
  Unloading: 'unloading',
  VariantChanged: 'variantchanged',
};
