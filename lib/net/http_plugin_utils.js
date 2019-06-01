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

goog.provide('shaka.net.HttpPluginUtils');

goog.require('shaka.log');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');


/**
 * @namespace shaka.net.HttpPluginUtils
 * @summary A set of http networking utility functions.
 * @exportDoc
 */


/**
 * @param {!Object.<string,string>} headers
 * @param {?ArrayBuffer} data
 * @param {number} status
 * @param {string} uri
 * @param {string} responseURL
 * @param {shaka.net.NetworkingEngine.RequestType} requestType
 * @return {!shaka.extern.Response}
 */
shaka.net.HttpPluginUtils.makeResponse =
    function(headers, data, status, uri, responseURL, requestType) {
  if (status >= 200 && status <= 299 && status != 202) {
    // Most 2xx HTTP codes are success cases.
    /** @type {shaka.extern.Response} */
    let response = {
      uri: responseURL || uri,
      originalUri: uri,
      data: data,
      headers: headers,
      fromCache: !!headers['x-shaka-from-cache'],
    };
    return response;
  } else {
    let responseText = null;
    try {
      responseText = shaka.util.StringUtils.fromBytesAutoDetect(data);
    } catch (exception) {}
    shaka.log.debug('HTTP error text:', responseText);

    let severity = status == 401 || status == 403 ?
        shaka.util.Error.Severity.CRITICAL :
        shaka.util.Error.Severity.RECOVERABLE;
    throw new shaka.util.Error(
        severity,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.BAD_HTTP_STATUS,
        uri,
        status,
        responseText,
        headers,
        requestType);
  }
};

