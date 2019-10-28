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
goog.require('shaka.util.Platform');


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
  const ManifestParser = shaka.media.ManifestParser;
  let support = {};

  // Make sure all registered parsers are shown, but only for MSE-enabled
  // platforms where our parsers matter.
  if (shaka.util.Platform.supportsMediaSource()) {
    for (let type in ManifestParser.parsersByMime) {
      support[type] = true;
    }
    for (let type in ManifestParser.parsersByExtension) {
      support[type] = true;
    }
  }

  // Make sure all well-known types are tested as well, just to show an explicit
  // false for things people might be expecting.
  const testMimeTypes = [
    // DASH
    'application/dash+xml',
    // HLS
    'application/x-mpegurl',
    'application/vnd.apple.mpegurl',
    // SmoothStreaming
    'application/vnd.ms-sstr+xml',
  ];
  const testExtensions = {
    // DASH
    'mpd': 'application/dash+xml',
    // HLS
    'm3u8': 'application/x-mpegurl',
    // SmoothStreaming
    'ism': 'application/vnd.ms-sstr+xml',
  };

  for (let type of testMimeTypes) {
    // Only query our parsers for MSE-enabled platforms.  Otherwise, query a
    // temporary media element for native support for these types.
    if (shaka.util.Platform.supportsMediaSource()) {
      support[type] = !!ManifestParser.parsersByMime[type];
    } else {
      support[type] = shaka.util.Platform.supportsMediaType(type);
    }
  }

  for (let extension in testExtensions) {
    // Only query our parsers for MSE-enabled platforms.  Otherwise, query a
    // temporary media element for native support for these MIME type for the
    // extension.
    if (shaka.util.Platform.supportsMediaSource()) {
      support[extension] = !!ManifestParser.parsersByExtension[extension];
    } else {
      const type = testExtensions[extension];
      support[extension] = shaka.util.Platform.supportsMediaType(type);
    }
  }

  return support;
};


/**
 * Create a manifest parser to parse the manifest at |uri|.
 *
 * @param {string} uri
 * @param {!shaka.net.NetworkingEngine} netEngine
 * @param {shaka.extern.RetryParameters} retryParams
 * @param {?string} mimeType
 * @return {!Promise.<!shaka.extern.ManifestParser>}
 */
shaka.media.ManifestParser.create = async function(
    uri, netEngine, retryParams, mimeType) {
  try {
    const Factory = await shaka.media.ManifestParser.getFactory_(
        uri, netEngine, retryParams, mimeType);

    return new Factory();
  } catch (error) {
    goog.asserts.assert(
        error instanceof shaka.util.Error, 'Incorrect error type');

    // Regardless of what the error was, we need to upgrade it to a critical
    // error. We can't do anything if we can't create a manifest parser.
    error.severity = shaka.util.Error.Severity.CRITICAL;

    throw error;
  }
};


/**
 * Get a factory that can create a manifest parser that should be able to parse
 * the manifest at |uri|.
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
  const ManifestParser = shaka.media.ManifestParser;

  // Try using the MIME type we were given.
  if (mimeType) {
    const factory = ManifestParser.parsersByMime[mimeType.toLowerCase()];
    if (factory) {
      return factory;
    }

    shaka.log.warning(
        'Could not determine manifest type using MIME type ', mimeType);
  }

  const extension = ManifestParser.getExtension(uri);
  if (extension) {
    const factory = ManifestParser.parsersByExtension[extension];
    if (factory) {
      return factory;
    }

    shaka.log.warning(
        'Could not determine manifest type for extension ', extension);
  } else {
    shaka.log.warning('Could not find extension for ', uri);
  }

  if (!mimeType) {
    mimeType = await ManifestParser.getMimeType(uri, netEngine, retryParams);

    if (mimeType) {
      const factory = shaka.media.ManifestParser.parsersByMime[mimeType];
      if (factory) {
        return factory;
      }

      shaka.log.warning('Could not determine manifest type using MIME type',
                        mimeType);
    }
  }

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
 */
shaka.media.ManifestParser.getMimeType = async function(
    uri, netEngine, retryParams) {
  const type = shaka.net.NetworkingEngine.RequestType.MANIFEST;

  let request = shaka.net.NetworkingEngine.makeRequest([uri], retryParams);
  request.method = 'HEAD';

  let response = await netEngine.request(type, request).promise;

  // https://bit.ly/2K9s9kf says this header should always be available,
  // but just to be safe:
  const mimeType = response.headers['content-type'];
  return mimeType ? mimeType.toLowerCase().split(';').shift() : '';
};


/**
 * @param {string} uri
 * @return {string}
 */
shaka.media.ManifestParser.getExtension = function(uri) {
  const uriObj = new goog.Uri(uri);
  const uriPieces = uriObj.getPath().split('/');
  const uriFilename = uriPieces.pop();
  const filenamePieces = uriFilename.split('.');

  // Only one piece means there is no extension.
  if (filenamePieces.length == 1) {
    return '';
  }

  return filenamePieces.pop().toLowerCase();
};


/**
 * Determines whether or not this URI and MIME type are supported by our own
 * manifest parsers on this platform.  This takes into account whether or not
 * MediaSource is available, as well as which parsers are registered to the
 * system.
 *
 * @param {string} uri
 * @param {string} mimeType
 * @return {boolean}
 */
shaka.media.ManifestParser.isSupported = function(uri, mimeType) {
  // Without MediaSource, our own parsers are useless.
  if (!shaka.util.Platform.supportsMediaSource()) {
    return false;
  }

  if (mimeType in shaka.media.ManifestParser.parsersByMime) {
    return true;
  }

  const extension = shaka.media.ManifestParser.getExtension(uri);
  if (extension in shaka.media.ManifestParser.parsersByExtension) {
    return true;
  }

  return false;
};
