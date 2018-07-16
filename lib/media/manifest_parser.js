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
goog.require('goog.asserts');
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
 * @type {!Object.<string, shaka.extern.ManifestParser.Factory>}
 */
shaka.media.ManifestParser.parsersByMime = {};


/**
 * Contains the parser factory functions indexed by file extension.
 *
 * @type {!Object.<string, shaka.extern.ManifestParser.Factory>}
 */
shaka.media.ManifestParser.parsersByExtension = {};


/**
 * Registers a manifest parser by file extension.
 *
 * @param {string} extension The file extension of the manifest.
 * @param {shaka.extern.ManifestParser.Factory} parserFactory The factory
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
 * @param {shaka.extern.ManifestParser.Factory} parserFactory The factory
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
  let support = {};
  for (let type in shaka.media.ManifestParser.parsersByMime) {
    support[type] = true;
  }
  for (let type in shaka.media.ManifestParser.parsersByExtension) {
    support[type] = true;
  }

  // Make sure all well-known types are tested as well, just to show an explicit
  // false for things people might be expecting.
  let testMimeTypes = [
    // DASH
    'application/dash+xml',
    // HLS
    'application/x-mpegurl',
    'application/vnd.apple.mpegurl',
    // SmoothStreaming
    'application/vnd.ms-sstr+xml',
  ];
  let testExtensions = [
    // DASH
    'mpd',
    // HLS
    'm3u8',
    // SmoothStreaming
    'ism',
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
 * @param {string} uri
 * @param {!shaka.net.NetworkingEngine} netEngine
 * @param {shaka.extern.RetryParameters} retryParams
 * @param {?string} mimeType
 * @return {!Promise.<shaka.extern.ManifestParser.Factory>}
 */
shaka.media.ManifestParser.getFactory = async function(
    uri, netEngine, retryParams, mimeType) {
  try {
    return await shaka.media.ManifestParser.getFactory_(
        uri, netEngine, retryParams, mimeType);
  } catch (error) {
    goog.asserts.assert(
        error instanceof shaka.util.Error, 'Incorrect error type');

    error.severity = shaka.util.Error.Severity.CRITICAL;

    throw error;
  }
};


/**
 * The internal version of |getFactory| which does not ensure the some error
 * constraints as the public |getFactory|.
 *
 * @param {string} uri
 * @param {!shaka.net.NetworkingEngine} netEngine
 * @param {shaka.extern.RetryParameters} retryParams
 * @param {?string} mimeType
 * @return {!Promise.<shaka.extern.ManifestParser.Factory>}
 * @private
 */
shaka.media.ManifestParser.getFactory_ = async function(
    uri, netEngine, retryParams, mimeType) {
  // Try using the mime type we were given.
  if (mimeType) {
    let mime = mimeType.toLowerCase();
    let factory = shaka.media.ManifestParser.parsersByMime[mime];

    if (factory) {
      return factory;
    }

    shaka.log.warning(
        'Could not determine manifest type using mime type ', mime);
  }

  // Try using the uri extension.
  let uriObj = new goog.Uri(uri);
  let uriPieces = uriObj.getPath().split('/');
  let uriFilename = uriPieces.pop();
  let filenamePieces = uriFilename.split('.');

  // Only one piece means there is no extension.
  if (filenamePieces.length > 1) {
    let extension = filenamePieces.pop().toLowerCase();
    let factory = shaka.media.ManifestParser.parsersByExtension[extension];

    if (factory) {
      return factory;
    }

    shaka.log.warning(
        'Could not determine manifest type for extension ', extension);
  } else {
    shaka.log.warning('Could not find extension for ', uri);
  }

  let mime = await shaka.media.ManifestParser.getMimeType_(uri,
                                                           netEngine,
                                                           retryParams);
  let factory = shaka.media.ManifestParser.parsersByMime[mime];
  if (factory) {
    return factory;
  }

  shaka.log.warning('Could not determine manifest type using mime type ', mime);

  throw new shaka.util.Error(
      shaka.util.Error.Severity.CRITICAL,
      shaka.util.Error.Category.MANIFEST,
      shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE,
      uri);
};


/**
 * @param {string} uri
 * @param {!shaka.net.NetworkingEngine} netEngine
 * @param {shaka.extern.RetryParameters} retryParams
 * @return {!Promise.<string>}
 * @private
 */
shaka.media.ManifestParser.getMimeType_ = async function(
    uri, netEngine, retryParams) {
  const type = shaka.net.NetworkingEngine.RequestType.MANIFEST;

  let request = shaka.net.NetworkingEngine.makeRequest([uri], retryParams);
  request.method = 'HEAD';

  let response = await netEngine.request(type, request).promise;

  // https://bit.ly/2K9s9kf says this header should always be available,
  // but just to be safe:
  let mimeType = response.headers['content-type'];
  return mimeType ? mimeType.toLowerCase() : '';
};
