/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
shaka.extern.ManifestParser = function() {};


/**
 * @typedef {{
 *   networkingEngine: !shaka.net.NetworkingEngine,
 *   filterNewPeriod: function(shaka.extern.Period),
 *   filterAllPeriods: function(!Array.<!shaka.extern.Period>),
 *   onTimelineRegionAdded: function(shaka.extern.TimelineRegionInfo),
 *   onEvent: function(!Event),
 *   onError: function(!shaka.util.Error)
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
 * @property {function(shaka.extern.Period)} filterNewPeriod
 *   Should be called on a new Period so that it can be filtered.
 * @property {function(!Array.<!shaka.extern.Period>)} filterAllPeriods
 *   Should be called on all Periods so that they can be filtered.
 * @property {function(shaka.extern.TimelineRegionInfo)} onTimelineRegionAdded
 *   Should be called when a new timeline region is added.
 * @property {function(!Event)} onEvent
 *   Should be called to raise events.
 * @property {function(!shaka.util.Error)} onError
 *   Should be called when an error occurs.
 * @exportDoc
 */
shaka.extern.ManifestParser.PlayerInterface;


/**
 * A factory for creating the manifest parser.  This will be called with 'new'.
 * This function is registered with shaka.media.ManifestParser to create parser
 * instances.
 *
 * @typedef {function(new:shaka.extern.ManifestParser)}
 * @exportDoc
 */
shaka.extern.ManifestParser.Factory;


/**
 * Called by the Player to provide an updated configuration any time the
 * configuration changes.  Will be called at least once before start().
 *
 * @param {shaka.extern.ManifestConfiguration} config
 * @exportDoc
 */
shaka.extern.ManifestParser.prototype.configure = function(config) {};


/**
 * Initialize and start the parser. When |start| resolves, it should return the
 * initial version of the manifest. |start| will only be called once. If |stop|
 * is called while |start| is pending, |start| should reject.
 *
 * @param {string} uri The URI of the manifest.
 * @param {shaka.extern.ManifestParser.PlayerInterface} playerInterface
 *    The player interface contains the callbacks and members that the parser
 *    can use to communicate with the player and outside world.
 * @return {!Promise.<shaka.extern.Manifest>}
 * @exportDoc
 */
shaka.extern.ManifestParser.prototype.start = function(uri, playerInterface) {};


/**
 * Tell the parser that it must stop and free all internal resources as soon as
 * possible. Only once all internal resources are stopped and freed will the
 * promise resolve. Once stopped a parser will not be started again.
 *
 * The parser should support having |stop| called multiple times and the promise
 * should always resolve.
 *
 * @return {!Promise}
 * @exportDoc
 */
shaka.extern.ManifestParser.prototype.stop = function() {};


/**
 * Tells the parser to do a manual manifest update.  Implementing this is
 * optional.  This is only called when 'emsg' boxes are present.
 * @exportDoc
 */
shaka.extern.ManifestParser.prototype.update = function() {};


/**
 * Tells the parser that the expiration time of an EME session has changed.
 * Implementing this is optional.
 *
 * @param {string} sessionId
 * @param {number} expiration
 * @exportDoc
 */
shaka.extern.ManifestParser.prototype.onExpirationUpdated = function(
    sessionId, expiration) {};
