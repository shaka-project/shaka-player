/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.provide('shaka.media.ManifestParser');

goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');



/**
 * Used to parse media manifests and handle manifest updates.  This is given a
 * URI where the initial manifest is found.  This will request the manifest,
 * parse it, and return the resulting Manifest object.  If the manifest
 * requires updates (e.g. for live media), then the parser will spawn
 * background timers to update the same Manifest object.
 *
 * @interface
 */
shaka.media.ManifestParser = function() {};


/**
 * Defines a factory for creating the manifest parser.  This MUST be a
 * constructor function since it will be called with 'new'.  This function
 * is registered with the Player and is used to create parser instances.
 *
 * This is given a function to tell the Player that a new Period has been
 * created.  This MUST be called when a new Period appears and the Player will
 * filter and possibly change the Period before being added to the Manifest.
 * This is also called for the initial parse.
 *
 * @typedef {function(new:shaka.media.ManifestParser,
 *                    !shaka.net.NetworkingEngine,
 *                    shakaExtern.RetryParameters,
 *                    function(shakaExtern.Period),
 *                    function(!shaka.util.Error),
 *                    ?shakaExtern.ContentProtectionCallback)}
 */
shaka.media.ManifestParser.Factory;


/**
 * Contains the parser factory functions indexed by MIME type.
 *
 * @type {!Object.<string, shaka.media.ManifestParser.Factory>}
 */
shaka.media.ManifestParser.parsersByMime = {};


/**
 * Contains the parser factory functions indexed by file extension.
 *
 * @type {!Object.<string, shaka.media.ManifestParser.Factory>}
 */
shaka.media.ManifestParser.parsersByExtension = {};


/**
 * Registers a manifest parser by file extension.
 *
 * @param {string} extension The file extension of the manifest.
 * @param {shaka.media.ManifestParser.Factory} parserFactory The factory
 *   used to create parser instances.
 * @export
 */
shaka.media.ManifestParser.registerParserByExtension = function(
    extension, parserFactory) {
  shaka.media.ManifestParser.parsersByExtension[extension] = parserFactory;
};


/**
 * Registers a manifest parser by MIME type.
 *
 * @param {string} mimeType The MIME type of the manifest.
 * @param {shaka.media.ManifestParser.Factory} parserFactory The factory
 *   used to create parser instances.
 * @export
 */
shaka.media.ManifestParser.registerParserByMime = function(
    mimeType, parserFactory) {
  shaka.media.ManifestParser.parsersByMime[mimeType] = parserFactory;
};


/**
 * Returns a map of manifest support for well-known types.
 *
 * @return {!Object.<string, boolean>}
 */
shaka.media.ManifestParser.support = function() {
  // Every object in the support hierarchy has a "basic" member.
  // All "basic" members must be true for the library to be usable.
  var support = {'basic': true};

  // Make sure all registered parsers are shown.
  for (var type in shaka.media.ManifestParser.parsersByMime) {
    support[type] = true;
  }
  for (var type in shaka.media.ManifestParser.parsersByExtension) {
    support[type] = true;
  }

  // Make sure all well-known types are tested as well, just to show an explicit
  // false for things people might be expecting.
  var testMimeTypes = [
    // DASH
    'application/dash+xml',
    // HLS
    'application/x-mpegurl',
    'application/vnd.apple.mpegurl',
    // SmoothStreaming
    'application/vnd.ms-sstr+xml'
  ];
  var testExtensions = [
    // DASH
    'mpd',
    // HLS
    'm3u8',
    // SmoothStreaming
    'ism'
  ];

  testMimeTypes.forEach(function(type) {
    support[type] = !!shaka.media.ManifestParser.parsersByMime[type];
  });
  testExtensions.forEach(function(type) {
    support[type] = !!shaka.media.ManifestParser.parsersByExtension[type];
  });

  return support;
};


/**
 * Parses the given manifest data into a Manifest object and starts any
 * background timers that are needed.  This will only be called once.
 *
 * @param {string} uri The URI of the manifest.
 * @return {!Promise.<shakaExtern.Manifest>}
 */
shaka.media.ManifestParser.prototype.start = function(uri) {};


/**
 * Stops any background timers and frees any objects held by this instance.
 * This will only be called after a successful call to start.  This will only
 * be called once.
 *
 * @return {!Promise}
 */
shaka.media.ManifestParser.prototype.stop = function() {};

