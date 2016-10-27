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

goog.provide('shaka.net.DataUriPlugin');

goog.require('shaka.log');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @namespace
 * @summary A networking plugin to handle data URIs.
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/data_URIs
 * @param {string} uri
 * @param {shakaExtern.Request} request
 * @return {!Promise.<shakaExtern.Response>}
 */
shaka.net.DataUriPlugin = function(uri, request) {
  return new Promise(function(resolve, reject) {
    // Extract the scheme.
    var parts = uri.split(':');
    if (parts.length < 2 || parts[0] != 'data') {
      shaka.log.error('Bad data URI, failed to parse scheme');
      throw new shaka.util.Error(
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_DATA_URI,
          uri);
    }
    var path = parts.slice(1).join(':');

    // Extract the encoding and MIME type (required but can be empty).
    var infoAndData = path.split(',');
    if (infoAndData.length < 2) {
      shaka.log.error('Bad data URI, failed to extract encoding and MIME type');
      throw new shaka.util.Error(
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_DATA_URI,
          uri);
    }
    var info = infoAndData[0];
    var dataStr = window.decodeURIComponent(infoAndData.slice(1).join(','));

    // Extract the encoding (optional).
    var typeAndEncoding = info.split(';');
    var encoding = null;
    if (typeAndEncoding.length > 1)
      encoding = typeAndEncoding[1];

    // Convert the data.
    /** @type {ArrayBuffer} */
    var data;
    if (encoding == 'base64') {
      data = shaka.util.Uint8ArrayUtils.fromBase64(dataStr).buffer;
    } else if (encoding) {
      shaka.log.error('Bad data URI, unknown encoding');
      throw new shaka.util.Error(
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.UNKNOWN_DATA_URI_ENCODING,
          uri);
    } else {
      data = shaka.util.StringUtils.toUTF8(dataStr);
    }

    /** @type {shakaExtern.Response} */
    var response = {
      uri: uri,
      data: data,
      headers: {
        'content-type': typeAndEncoding[0]
      }
    };

    resolve(response);
  });
};


shaka.net.NetworkingEngine.registerScheme('data', shaka.net.DataUriPlugin);

