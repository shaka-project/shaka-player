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
 * @param {!shaka.net.NetworkingEngine} networkingEngine The networking engine
 *     to use for network requests.
 * @param {function(shakaExtern.Period)} filterPeriod A callback to be invoked
 *     on all new Periods so that they can be filtered.
 * @param {function(!shaka.util.Error)} onError A callback to be invoked on
 *     errors.
 * @param {function(!Event)} onEvent A callback to be invoked to dispatch events
 *     to the application.
 * @return {!Promise.<shakaExtern.Manifest>}
 * @exportDoc
 */
shakaExtern.ManifestParser.prototype.start =
    function(uri, networkingEngine, filterPeriod, onError, onEvent) {};


/**
 * Stops any background timers and frees any objects held by this instance.
 * This will only be called after a successful call to start.  This will only
 * be called once.
 *
 * @return {!Promise}
 * @exportDoc
 */
shakaExtern.ManifestParser.prototype.stop = function() {};
