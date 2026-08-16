/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.Utils');

goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.TXml');


/**
 * A class responsible for ad utils.
 * @export
 */
shaka.ads.Utils = class {
  /**
   * @return {!shaka.extern.AdTrackingEvent}
   */
  static createTracking() {
    return {
      impression: null,
      clickTracking: null,
      start: null,
      firstQuartile: null,
      midpoint: null,
      thirdQuartile: null,
      complete: null,
      skip: null,
      error: null,
      resume: null,
      pause: null,
      mute: null,
      unmute: null,
    };
  }

  /**
   * @param {!shaka.extern.xml.Node} inline
   * @return {!shaka.extern.AdTrackingEvent}
   */
  static createTrackingFromInline(inline) {
    const TXml = shaka.util.TXml;

    const tracking = shaka.ads.Utils.createTracking();

    for (const error of TXml.findChildren(inline, 'Error')) {
      const url = TXml.getTextContents(error);
      if (url) {
        if (!tracking.error) {
          tracking.error = [];
        }
        tracking.error.push(url);
      }
    }
    for (const impression of TXml.findChildren(inline, 'Impression')) {
      const url = TXml.getTextContents(impression);
      if (url) {
        if (!tracking.impression) {
          tracking.impression = [];
        }
        tracking.impression.push(url);
      }
    }

    return tracking;
  }

  /**
   * @param {!Array<!shaka.extern.AdCreativeSignaling.TrackingEvent>} events
   * @return {!shaka.extern.AdTrackingEvent}
   */
  static createTrackingFromEvents(events) {
    const tracking = shaka.ads.Utils.createTracking();

    for (const event of events) {
      if (event.type in tracking) {
        if (!tracking[event.type]) {
          tracking[event.type] = event.urls;
        } else {
          tracking[event.type].push(...event.urls);
        }
      }
    }

    return tracking;
  }

  /**
   * @param {!Array<!shaka.extern.xml.Node>} trackingEvents
   * @param {!shaka.extern.AdTrackingEvent} tracking
   */
  static processTrackingEvents(trackingEvents, tracking) {
    const TXml = shaka.util.TXml;
    for (const trackingEvent of trackingEvents) {
      const eventName = trackingEvent.attributes['event'];
      if (eventName in tracking) {
        const url = TXml.getTextContents(trackingEvent);
        if (url) {
          if (!tracking[eventName]) {
            tracking[eventName] = [];
          }
          tracking[eventName].push(url);
        }
      }
    }
  }

  /**
   * Sends the tracking beacons (via POST requests) registered for the given
   * event type in the provided tracking object, if any.
   *
   * @param {?shaka.extern.AdTrackingEvent} tracking
   * @param {string} type
   * @param {shaka.net.NetworkingEngine} netEngine
   */
  static fireTrackingEvents(tracking, type, netEngine) {
    if (!tracking) {
      return;
    }
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
    if (!urls) {
      return;
    }
    const NetworkingEngine = shaka.net.NetworkingEngine;
    const context = {
      type: NetworkingEngine.AdvancedRequestType.TRACKING_EVENT,
    };
    const requestType = NetworkingEngine.RequestType.ADS;
    for (const url of urls) {
      const request = NetworkingEngine.makeRequest(
          [url], NetworkingEngine.defaultRetryParameters());
      request.method = 'POST';
      netEngine.request(requestType, request, context);
    }
  }
};

/**
 * The event name for when a sequence of ads has been loaded.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.ADS_LOADED = 'ads-loaded';

/**
 * The event name for when an ad has started playing.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_STARTED = 'ad-started';


/**
 * The event name for when an ad actually starts playback.
 *
 * This is fired when the ad's media element enters the 'playing' state,
 * indicating that playback has begun with media data available.
 *
 * Unlike AD_STARTED, which signals the intent to start an ad,
 * this event guarantees that the ad is truly rendering and advancing
 * its playhead.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_PLAYING = 'ad-playing';


/**
 * The event name for when an ad playhead crosses first quartile.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_FIRST_QUARTILE = 'ad-first-quartile';


/**
 * The event name for when an ad playhead crosses midpoint.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_MIDPOINT = 'ad-midpoint';


/**
 * The event name for when an ad playhead crosses third quartile.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_THIRD_QUARTILE = 'ad-third-quartile';


/**
 * The event name for when an ad has completed playing.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_COMPLETE = 'ad-complete';


/**
 * The event name for when an ad has finished playing
 * (played all the way through, was skipped, or was unable to proceed
 * due to an error).
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_STOPPED = 'ad-stopped';


/**
 * The event name for when an ad is skipped by the user..
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_SKIPPED = 'ad-skipped';


/**
 * The event name for when the ad volume has changed.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_VOLUME_CHANGED = 'ad-volume-changed';


/**
 * The event name for when the ad was muted.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_MUTED = 'ad-muted';


/**
 * The event name for when the ad was paused.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_PAUSED = 'ad-paused';


/**
 * The event name for when the ad was resumed after a pause.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_RESUMED = 'ad-resumed';


/**
 * The event name for when the ad's skip status changes
 * (usually it becomes skippable when it wasn't before).
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_SKIP_STATE_CHANGED = 'ad-skip-state-changed';


/**
 * The event name for when the ad's cue points (start/end markers)
 * have changed.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.CUEPOINTS_CHANGED = 'ad-cue-points-changed';


/**
 * The event name for when the native IMA ad manager object has
 * loaded and become available.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.IMA_AD_MANAGER_LOADED = 'ima-ad-manager-loaded';


/**
 * The event name for when the native IMA stream manager object has
 * loaded and become available.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.IMA_STREAM_MANAGER_LOADED = 'ima-stream-manager-loaded';


/**
 * The event name for when the ad was clicked.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_CLICKED = 'ad-clicked';


/**
 * The event name for when there is an update to the current ad's progress.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_PROGRESS = 'ad-progress';


/**
 * The event name for when the ad is buffering.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_BUFFERING = 'ad-buffering';


/**
 * The event name for when the ad's URL was hit.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_IMPRESSION = 'ad-impression';


/**
 * The event name for when the ad's duration changed.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_DURATION_CHANGED = 'ad-duration-changed';


/**
 * The event name for when the ad was closed by the user.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_CLOSED = 'ad-closed';


/**
 * The event name for when the ad data becomes available.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_LOADED = 'ad-loaded';


/**
 * The event name for when all the ads were completed.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.ALL_ADS_COMPLETED = 'all-ads-completed';


/**
 * The event name for when the ad changes from or to linear.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_LINEAR_CHANGED = 'ad-linear-changed';


/**
 * The event name for when the ad's metadata becomes available.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_METADATA = 'ad-metadata';


/**
 * The event name for when the ad display encountered a recoverable
 * error.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_RECOVERABLE_ERROR = 'ad-recoverable-error';

/**
 * The event name for when the ad manager dispatch errors.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_ERROR = 'ad-error';

/**
 * The event name for when the client side SDK signalled its readiness
 * to play a VPAID ad or an ad rule.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_BREAK_READY = 'ad-break-ready';

/**
 * The event name for when the ad manager starts an ad break.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_BREAK_STARTED = 'ad-break-started';

/**
 * The event name for when the ad manager ends an ad break.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_BREAK_ENDED = 'ad-break-ended';

/**
 * The event name for when the ad manager starts the preload of an interstitial.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_INTERSTITIAL_PRELOAD = 'ad-interstitial-preload';

/**
 * The event name for when the ad manager finish the preload of an interstitial.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_INTERSTITIAL_PRELOADED = 'ad-interstitial-preloaded';


/**
 * The event name for when the interaction callback for the ad was
 * triggered.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_INTERACTION = 'ad-interaction';


/**
 * The name of the event for when an ad requires the main content to be paused.
 * Fired when the platform does not support multiple media elements.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_CONTENT_PAUSE_REQUESTED = 'ad-content-pause-requested';


/**
 * The name of the event for when an ad requires the main content to be resumed.
 * Fired when the platform does not support multiple media elements.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_CONTENT_RESUME_REQUESTED = 'ad-content-resume-requested';


/**
 * The name of the event for when an ad requires the video of the main content
 * to be attached.
 *
 * @const {string}
 * @export
 */
shaka.ads.Utils.AD_CONTENT_ATTACH_REQUESTED = 'ad-content-attach-requested';

