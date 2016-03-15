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

goog.provide('shaka.media.ManifestParser');


/**
 * @namespace shaka.media.ManifestParser
 * @summary An interface to register manifest parsers.
 * @exportDoc
 */


/**
 * Contains the parser factory functions indexed by MIME type.
 *
 * @type {!Object.<string, shakaExtern.ManifestParser.Factory>}
 */
shaka.media.ManifestParser.parsersByMime = {};


/**
 * Contains the parser factory functions indexed by file extension.
 *
 * @type {!Object.<string, shakaExtern.ManifestParser.Factory>}
 */
shaka.media.ManifestParser.parsersByExtension = {};


/**
 * Registers a manifest parser by file extension.
 *
 * @param {string} extension The file extension of the manifest.
 * @param {shakaExtern.ManifestParser.Factory} parserFactory The factory
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
 * @param {shakaExtern.ManifestParser.Factory} parserFactory The factory
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
