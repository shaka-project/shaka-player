/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.Utils');

goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.StringUtils');
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
   * Creates an interstitial. Only the fields that differ from the defaults
   * need to be given.
   *
   * @param {!Object} fields
   * @return {!shaka.extern.AdInterstitial}
   */
  static createInterstitial(fields) {
    return /** @type {!shaka.extern.AdInterstitial} */ (Object.assign({
      id: null,
      groupId: null,
      startTime: 0,
      endTime: null,
      uri: null,
      mimeType: null,
      isSkippable: false,
      skipOffset: null,
      skipFor: null,
      canJump: true,
      resumeOffset: null,
      playoutLimit: null,
      once: false,
      pre: false,
      post: false,
      timelineRange: false,
      loop: false,
      overlay: null,
      displayOnBackground: false,
      currentVideo: null,
      background: null,
      clickThroughUrl: null,
      tracking: null,
    }, fields));
  }

  /**
   * Creates an interstitial resource that is resolved by fetching a JSON
   * document when the manager schedules it.
   *
   * @param {!Object} fields The fields of the resource, which must include
   *   those of shaka.extern.DeferredInterstitial that describe its timing.
   * @param {!shaka.net.NetworkingEngine} networkingEngine
   * @param {function(number):string} getUri Returns the URI to fetch for a
   *   playback offset.
   * @param {function(*, string, number, !shaka.extern.DeferredInterstitial):
   *     !Array<shaka.extern.AdInterstitial>} parse Parses the document, given
   *   its URI after redirects, the playback offset and the resource.
   * @param {shaka.extern.RequestContext=} context
   * @return {!shaka.extern.DeferredInterstitial}
   */
  static createDeferredInterstitial(fields, networkingEngine, getUri, parse,
      context) {
    /** @type {?shaka.net.NetworkingEngine.PendingRequest} */
    let pending = null;
    const resource = /** @type {!shaka.extern.DeferredInterstitial} */ (
      Object.assign({
        resolving: false,
        resolved: false,
        resolve: async (offset) => {
          const NetworkingEngine = shaka.net.NetworkingEngine;
          const request = NetworkingEngine.makeRequest(
              [getUri(offset)], NetworkingEngine.defaultRetryParameters());
          pending = networkingEngine.request(
              NetworkingEngine.RequestType.ADS, request, context);
          const response = await pending.promise;
          pending = null;
          return parse(
              JSON.parse(shaka.util.StringUtils.fromUTF8(response.data)),
              response.uri, offset, resource);
        },
        abort: () => pending ? pending.abort() : Promise.resolve(),
      }, fields));
    return resource;
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
};

/**
 * The playback mode of interstitials whose media is already present in the
 * content.
 *
 * @const {string}
 * @noinline
 */
shaka.ads.Utils.EMBEDDED = 'embedded';

/**
 * The event name for when a sequence of ads has been loaded.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.ADS_LOADED = 'ads-loaded';

/**
 * The event name for when an ad has started playing.
 *
 * @const {string}
 * @noinline
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
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_PLAYING = 'ad-playing';


/**
 * The event name for when an ad playhead crosses first quartile.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_FIRST_QUARTILE = 'ad-first-quartile';


/**
 * The event name for when an ad playhead crosses midpoint.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_MIDPOINT = 'ad-midpoint';


/**
 * The event name for when an ad playhead crosses third quartile.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_THIRD_QUARTILE = 'ad-third-quartile';


/**
 * The event name for when an ad has completed playing.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_COMPLETE = 'ad-complete';


/**
 * The event name for when an ad has finished playing
 * (played all the way through, was skipped, or was unable to proceed
 * due to an error).
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_STOPPED = 'ad-stopped';


/**
 * The event name for when an ad is skipped by the user..
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_SKIPPED = 'ad-skipped';


/**
 * The event name for when the ad volume has changed.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_VOLUME_CHANGED = 'ad-volume-changed';


/**
 * The event name for when the ad was muted.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_MUTED = 'ad-muted';


/**
 * The event name for when the ad was paused.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_PAUSED = 'ad-paused';


/**
 * The event name for when the ad was resumed after a pause.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_RESUMED = 'ad-resumed';


/**
 * The event name for when the ad's skip status changes
 * (usually it becomes skippable when it wasn't before).
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_SKIP_STATE_CHANGED = 'ad-skip-state-changed';


/**
 * The event name for when the ad's cue points (start/end markers)
 * have changed.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.CUEPOINTS_CHANGED = 'ad-cue-points-changed';


/**
 * The event name for when the native IMA ad manager object has
 * loaded and become available.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.IMA_AD_MANAGER_LOADED = 'ima-ad-manager-loaded';


/**
 * The event name for when the native IMA stream manager object has
 * loaded and become available.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.IMA_STREAM_MANAGER_LOADED = 'ima-stream-manager-loaded';


/**
 * The event name for when the ad was clicked.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_CLICKED = 'ad-clicked';


/**
 * The event name for when there is an update to the current ad's progress.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_PROGRESS = 'ad-progress';


/**
 * The event name for when the ad is buffering.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_BUFFERING = 'ad-buffering';


/**
 * The event name for when the ad's URL was hit.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_IMPRESSION = 'ad-impression';


/**
 * The event name for when the ad's duration changed.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_DURATION_CHANGED = 'ad-duration-changed';


/**
 * The event name for when the ad was closed by the user.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_CLOSED = 'ad-closed';


/**
 * The event name for when the ad data becomes available.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_LOADED = 'ad-loaded';


/**
 * The event name for when all the ads were completed.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.ALL_ADS_COMPLETED = 'all-ads-completed';


/**
 * The event name for when the ad changes from or to linear.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_LINEAR_CHANGED = 'ad-linear-changed';


/**
 * The event name for when the ad's metadata becomes available.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_METADATA = 'ad-metadata';


/**
 * The event name for when the ad display encountered a recoverable
 * error.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_RECOVERABLE_ERROR = 'ad-recoverable-error';

/**
 * The event name for when the ad manager dispatch errors.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_ERROR = 'ad-error';

/**
 * The event name for when the client side SDK signalled its readiness
 * to play a VPAID ad or an ad rule.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_BREAK_READY = 'ad-break-ready';

/**
 * The event name for when the ad manager starts an ad break.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_BREAK_STARTED = 'ad-break-started';

/**
 * The event name for when the ad manager ends an ad break.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_BREAK_ENDED = 'ad-break-ended';

/**
 * The event name for when the ad manager starts the preload of an interstitial.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_INTERSTITIAL_PRELOAD = 'ad-interstitial-preload';

/**
 * The event name for when the ad manager finish the preload of an interstitial.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_INTERSTITIAL_PRELOADED = 'ad-interstitial-preloaded';


/**
 * The event name for when the interaction callback for the ad was
 * triggered.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_INTERACTION = 'ad-interaction';


/**
 * The name of the event for when an ad requires the main content to be paused.
 * Fired when the platform does not support multiple media elements.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_CONTENT_PAUSE_REQUESTED = 'ad-content-pause-requested';


/**
 * The name of the event for when an ad requires the main content to be resumed.
 * Fired when the platform does not support multiple media elements.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_CONTENT_RESUME_REQUESTED = 'ad-content-resume-requested';


/**
 * The name of the event for when an ad requires the video of the main content
 * to be attached.
 *
 * @const {string}
 * @noinline
 * @export
 */
shaka.ads.Utils.AD_CONTENT_ATTACH_REQUESTED = 'ad-content-attach-requested';

