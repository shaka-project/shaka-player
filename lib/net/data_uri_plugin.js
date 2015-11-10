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

goog.provide('shaka.net.DataUriPlugin');

goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * A plugin that makes data uri requests.  This plugin is auto-registered
 * with the networking engine.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/data_URIs
 * @param {string} uri
 * @param {shaka.net.NetworkingEngine.Request} request
 * @return {!Promise.<shaka.net.NetworkingEngine.Response>}
 */
shaka.net.DataUriPlugin = function(uri, request) {
  return new Promise(function(resolve, reject) {
    // TODO: Change to the new Error object.
    // Extract the scheme.
    var parts = uri.split(':');
    if (parts.length < 2 || parts[0] != 'data')
      reject('Bad data URI.');
    var path = parts.slice(1).join(':');

    // Extract the encoding and MIME type (required but can be empty).
    var infoAndData = path.split(',');
    if (infoAndData.length < 2)
      reject('Bad data URI.');
    var info = infoAndData[0];
    var data = infoAndData.slice(1).join(',');

    // Extract the encoding (optional).
    var typeAndEncoding = info.split(';');
    var encoding = null;
    if (typeAndEncoding.length > 1)
      encoding = typeAndEncoding[1];

    // Convert the data.
    data = window.decodeURIComponent(data);
    if (encoding == 'base64') {
      data = shaka.util.StringUtils.fromBase64(data);
    } else if (encoding) {
      reject('Bad data URI.');
    }
    data = shaka.util.Uint8ArrayUtils.fromString(data).buffer;

    var response = {data: data, headers: {}};
    resolve(response);
  });
};


shaka.net.NetworkingEngine.registerScheme('data', shaka.net.DataUriPlugin);

