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

goog.require('goog.Uri');
goog.require('shaka.log');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');


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
shaka.media.ManifestParser.probeSupport = function() {
  // Make sure all registered parsers are shown.
  var support = {};
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
 * Finds a manifest parser factory to parse the given manifest.
 *
 * @param {string} manifestUri
 * @param {!shaka.net.NetworkingEngine} netEngine
 * @param {shakaExtern.RetryParameters} retryParams
 * @param {shakaExtern.ManifestParser.Factory=} opt_manifestParserFactory
 * @return {!Promise.<shakaExtern.ManifestParser.Factory>}
 */
shaka.media.ManifestParser.getFactory = function(
    manifestUri, netEngine, retryParams, opt_manifestParserFactory) {
  var factory = opt_manifestParserFactory;
  var extension;

  if (!factory) {
    // Try to choose a manifest parser by file extension.
    var uriObj = new goog.Uri(manifestUri);
    var uriPieces = uriObj.getPath().split('/');
    var uriFilename = uriPieces.pop();
    var filenamePieces = uriFilename.split('.');
    // Only one piece means there is no extension.
    if (filenamePieces.length > 1) {
      extension = filenamePieces.pop().toLowerCase();
      factory = shaka.media.ManifestParser.parsersByExtension[extension];
    }
  }

  if (factory)
    return Promise.resolve(factory);

  // Try to choose a manifest parser by MIME type.
  var headRequest =
      shaka.net.NetworkingEngine.makeRequest([manifestUri], retryParams);
  headRequest.method = 'HEAD';
  var type = shaka.net.NetworkingEngine.RequestType.MANIFEST;

  return netEngine.request(type, headRequest).then(
      function(response) {
        var mimeType = response.headers['content-type'];
        // https://goo.gl/yzKDRx says this header should always be available,
        // but just to be safe:
        if (mimeType) {
          mimeType = mimeType.toLowerCase();
        }
        factory = shaka.media.ManifestParser.parsersByMime[mimeType];
        if (!factory) {
          shaka.log.error(
              'Unable to guess manifest type by file extension ' +
              'or by MIME type.', extension, mimeType);
          return Promise.reject(new shaka.util.Error(
              shaka.util.Error.Category.MANIFEST,
              shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE,
              manifestUri));
        }
        return factory;
      }, function(error) {
        shaka.log.error('HEAD request to guess manifest type failed!', error);
        return Promise.reject(error);
      });
};
