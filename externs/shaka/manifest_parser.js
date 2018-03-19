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


/** @externs */



/**
 * Parses media manifests and handles manifest updates.
 *
 * Given a URI where the initial manifest is found, a parser will request the
 * manifest, parse it, and return the resulting Manifest object.
 *
 * If the manifest requires updates (e.g. for live media), the parser will use
 * background timers to update the same Manifest object.
 *
 * @interface
 * @exportDoc
 */
shakaExtern.ManifestParser = function() {};


/**
 * @typedef {{
 *   networkingEngine: !shaka.net.NetworkingEngine,
 *   filterNewPeriod: function(shakaExtern.Period),
 *   filterAllPeriods: function(!Array.<!shakaExtern.Period>),
 *   onTimelineRegionAdded: function(shakaExtern.TimelineRegionInfo),
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
 * @property {function(shakaExtern.Period)} filterNewPeriod
 *   Should be called on a new Period so that it can be filtered.
 * @property {function(!Array.<!shakaExtern.Period>)} filterAllPeriods
 *   Should be called on all Periods so that they can be filtered.
 * @property {function(shakaExtern.TimelineRegionInfo)} onTimelineRegionAdded
 *   Should be called when a new timeline region is added.
 * @property {function(!Event)} onEvent
 *   Should be called to raise events.
 * @property {function(!shaka.util.Error)} onError
 *   Should be called when an error occurs.
 * @exportDoc
 */
shakaExtern.ManifestParser.PlayerInterface;


/**
 * A factory for creating the manifest parser.  This will be called with 'new'.
 * This function is registered with shaka.media.ManifestParser to create parser
 * instances.
 *
 * @typedef {function(new:shakaExtern.ManifestParser)}
 * @exportDoc
 */
shakaExtern.ManifestParser.Factory;


/**
 * Called by the Player to provide an updated configuration any time the
 * configuration changes.  Will be called at least once before start().
 *
 * @param {shakaExtern.ManifestConfiguration} config
 * @exportDoc
 */
shakaExtern.ManifestParser.prototype.configure = function(config) {};


/**
 * Parses the given manifest data into a Manifest object and starts any
 * background timers that are needed.  This will only be called once.
 *
 * @param {string} uri The URI of the manifest.
 * @param {shakaExtern.ManifestParser.PlayerInterface} playerInterface Contains
 *   the interface to the Player.
 * @return {!Promise.<shakaExtern.Manifest>}
 * @exportDoc
 */
shakaExtern.ManifestParser.prototype.start = function(uri, playerInterface) {};


/**
 * Stops any background timers and frees any objects held by this instance.
 * This will only be called after a successful call to start.  This will only
 * be called once.
 *
 * @return {!Promise}
 * @exportDoc
 */
shakaExtern.ManifestParser.prototype.stop = function() {};


/**
 * Tells the parser to do a manual manifest update.  Implementing this is
 * optional.  This is only called when 'emsg' boxes are present.
 * @exportDoc
 */
shakaExtern.ManifestParser.prototype.update = function() {};


/**
 * Tells the parser that the expiration time of an EME session has changed.
 * Implementing this is optional.
 *
 * @param {string} sessionId
 * @param {number} expiration
 * @exportDoc
 */
shakaExtern.ManifestParser.prototype.onExpirationUpdated = function(
    sessionId, expiration) {};
