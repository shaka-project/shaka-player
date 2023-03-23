/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */


/**
 * Parses media manifests and handles manifest updates.
 *
 * Given a URI where the initial manifest is found, a parser will request the
 * manifest, parse it, and return the resulting Manifest object.
 *
 * If the manifest requires updates (e.g. for live media), the parser will use
 * background timers to update the same Manifest object.
 *
 * There are many ways for |start| and |stop| to be called. Implementations
 * should support all cases:
 *
 *  BASIC
 *    await parser.start(uri, playerInterface);
 *    await parser.stop();
 *
 *  INTERRUPTING
 *    const p = parser.start(uri, playerInterface);
 *    await parser.stop();
 *    await p;
 *
 *    |p| should be rejected with an OPERATION_ABORTED error.
 *
 *  STOPPED BEFORE STARTING
 *    await parser.stop();
 *
 * @interface
 * @exportDoc
 */
shaka.extern.ManifestParser = class {
  constructor() {}

  /**
   * Called by the Player to provide an updated configuration any time the
   * configuration changes.  Will be called at least once before start().
   *
   * @param {shaka.extern.ManifestConfiguration} config
   * @exportDoc
   */
  configure(config) {}

  /**
   * Initialize and start the parser. When |start| resolves, it should return
   * the initial version of the manifest. |start| will only be called once. If
   * |stop| is called while |start| is pending, |start| should reject.
   *
   * @param {string} uri The URI of the manifest.
   * @param {shaka.extern.ManifestParser.PlayerInterface} playerInterface
   *    The player interface contains the callbacks and members that the parser
   *    can use to communicate with the player and outside world.
   * @return {!Promise.<shaka.extern.Manifest>}
   * @exportDoc
   */
  start(uri, playerInterface) {}

  /**
   * Tell the parser that it must stop and free all internal resources as soon
   * as possible. Only once all internal resources are stopped and freed will
   * the promise resolve. Once stopped a parser will not be started again.
   *
   * The parser should support having |stop| called multiple times and the
   * promise should always resolve.
   *
   * @return {!Promise}
   * @exportDoc
   */
  stop() {}

  /**
   * Tells the parser to do a manual manifest update.  Implementing this is
   * optional.  This is only called when 'emsg' boxes are present.
   * @exportDoc
   */
  update() {}

  /**
   * Tells the parser that the expiration time of an EME session has changed.
   * Implementing this is optional.
   *
   * @param {string} sessionId
   * @param {number} expiration
   * @exportDoc
   */
  onExpirationUpdated(sessionId, expiration) {}
};


/**
 * @typedef {{
 *   networkingEngine: !shaka.net.NetworkingEngine,
 *   filter: function(shaka.extern.Manifest):!Promise,
 *   makeTextStreamsForClosedCaptions: function(shaka.extern.Manifest),
 *   onTimelineRegionAdded: function(shaka.extern.TimelineRegionInfo),
 *   onEvent: function(!Event),
 *   onError: function(!shaka.util.Error),
 *   isLowLatencyMode: function():boolean,
 *   isAutoLowLatencyMode: function():boolean,
 *   enableLowLatencyMode: function(),
 *   updateDuration: function(),
 *   newDrmInfo: function(shaka.extern.Stream)
 * }}
 *
 * @description
 * Defines the interface of the Player to the manifest parser.  This defines
 * fields and callback methods that the parser will use to interact with the
 * Player.  The callback methods do not need to be called as member functions
 * (i.e. they can be called as "free" functions).
 *
 * @property {!shaka.net.NetworkingEngine} networkingEngine
 *   The networking engine to use for network requests.
 * @property {function(shaka.extern.Manifest):!Promise} filter
 *   Should be called when new variants or text streams are added to the
 *   Manifest.  Note that this operation is asynchronous.
 * @property {function(shaka.extern.Manifest)} makeTextStreamsForClosedCaptions
 *   A callback that adds text streams to represent the closed captions of the
 *   video streams in the Manifest.  Should be called whenever new video streams
 *   are added to the Manifest.
 * @property {function(shaka.extern.TimelineRegionInfo)} onTimelineRegionAdded
 *   Should be called when a new timeline region is added.
 * @property {function(!Event)} onEvent
 *   Should be called to raise events.
 * @property {function(!shaka.util.Error)} onError
 *   Should be called when an error occurs.
 * @property {function():boolean} isLowLatencyMode
 *   Return true if low latency streaming mode is enabled.
 * @property {function():boolean} isAutoLowLatencyMode
 *   Return true if auto low latency streaming mode is enabled.
 * @property {function()} enableLowLatencyMode
 *   Enable low latency streaming mode.
 * @property {function()} updateDuration
 *   Update the presentation duration based on PresentationTimeline.
 * @property {function(shaka.extern.Stream)} newDrmInfo
 *   Inform the player of new DRM info that needs to be processed for the given
 *   stream.
 * @exportDoc
 */
shaka.extern.ManifestParser.PlayerInterface;


/**
 * A factory for creating the manifest parser.  This function is registered with
 * shaka.media.ManifestParser to create parser instances.
 *
 * @typedef {function():!shaka.extern.ManifestParser}
 * @exportDoc
 */
shaka.extern.ManifestParser.Factory;
