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
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @namespace
 * @summary A networking plugin to handle data URIs.
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/data_URIs
 * @param {string} uri
 * @param {shaka.extern.Request} request
 * @param {shaka.net.NetworkingEngine.RequestType} requestType
 * @param {shaka.extern.ProgressUpdated} progressUpdated Called when a
 *   progress event happened.
 * @return {!shaka.extern.IAbortableOperation.<shaka.extern.Response>}
 * @export
 */
shaka.net.DataUriPlugin = function(uri, request, requestType, progressUpdated) {
  try {
    let parsed = shaka.net.DataUriPlugin.parse(uri);

    /** @type {shaka.extern.Response} */
    let response = {
      uri: uri,
      originalUri: uri,
      data: parsed.data,
      headers: {
        'content-type': parsed.contentType,
      },
    };

    return shaka.util.AbortableOperation.completed(response);
  } catch (error) {
    return shaka.util.AbortableOperation.failed(error);
  }
};


/**
 * @param {string} uri
 * @return {{data: ArrayBuffer, contentType: string}}
 */
shaka.net.DataUriPlugin.parse = function(uri) {
  // Extract the scheme.
  let parts = uri.split(':');
  if (parts.length < 2 || parts[0] != 'data') {
    shaka.log.error('Bad data URI, failed to parse scheme');
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.MALFORMED_DATA_URI,
        uri);
  }
  let path = parts.slice(1).join(':');

  // Extract the encoding and MIME type (required but can be empty).
  let infoAndData = path.split(',');
  if (infoAndData.length < 2) {
    shaka.log.error('Bad data URI, failed to extract encoding and MIME type');
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.MALFORMED_DATA_URI,
        uri);
  }
  let info = infoAndData[0];
  let dataStr = window.decodeURIComponent(infoAndData.slice(1).join(','));

  // The MIME type is always the first thing in the semicolon-separated list
  // of type parameters.  It may be blank.
  const typeInfoList = info.split(';');
  const contentType = typeInfoList[0];

  // Check for base64 encoding, which is always the last in the
  // semicolon-separated list if present.
  let base64Encoded = false;
  if (typeInfoList.length > 1 &&
      typeInfoList[typeInfoList.length - 1] == 'base64') {
    base64Encoded = true;
    typeInfoList.pop();
  }

  // Convert the data.
  /** @type {ArrayBuffer} */
  let data;
  if (base64Encoded) {
    data = shaka.util.Uint8ArrayUtils.fromBase64(dataStr).buffer;
  } else {
    data = shaka.util.StringUtils.toUTF8(dataStr);
  }

  return {data, contentType};
};


shaka.net.NetworkingEngine.registerScheme('data', shaka.net.DataUriPlugin);
