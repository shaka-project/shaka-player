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

goog.provide('shaka.util.LicenseRequest');

goog.require('shaka.player.Defaults');
goog.require('shaka.util.AjaxRequest');
goog.require('shaka.util.FailoverUri');



/**
 * Creates a LicenseRequest. A LicenseRequest manages retries automatically.
 *
 * @param {string} url The URL.
 * @param {(ArrayBuffer|?string)} body The request's body.
 * @param {string} method The HTTP request method, which must be either 'GET'
 *     or 'POST'.
 * @param {boolean} withCredentials True if cookies should be sent in
 *     cross-domain license requests.  If true, the browser will reject license
 *     responses which use the wildcard header "Access-Control-Allow-Origin: *".
 *     See http://goo.gl/pzY9F7 for more information.
 * @param {Object.<string, string>=} opt_extraHeaders Optional extra HTTP
 *     request headers as key-value pairs.
 * @param {number=} opt_requestTimeout The timeout for a LicenseRequest in
 *     seconds.
 *
 * @struct
 * @constructor
 */
shaka.util.LicenseRequest = function(
    url,
    body,
    method,
    withCredentials,
    opt_extraHeaders,
    opt_requestTimeout) {
  shaka.asserts.assert((method == 'GET') || (method == 'POST'));

  /** @private {!shaka.util.FailoverUri} */
  this.url_ = new shaka.util.FailoverUri(null, [new goog.Uri(url)]);

  /** @private {!shaka.util.AjaxRequest.Parameters} */
  this.parameters_ = new shaka.util.AjaxRequest.Parameters();

  this.parameters_.body = body;
  this.parameters_.method = method;
  this.parameters_.maxAttempts = 3;
  this.parameters_.withCredentials = withCredentials;

  var timeoutSeconds = opt_requestTimeout != null ?
      opt_requestTimeout : shaka.player.Defaults.LICENSE_REQUEST_TIMEOUT;
  this.parameters_.requestTimeoutMs = timeoutSeconds * 1000;

  // Clone the headers.
  var extraHeaders = opt_extraHeaders || {};
  for (var key in extraHeaders) {
    this.parameters_.requestHeaders[key] = extraHeaders[key];
  }
};


/**
 * Sends the license request.
 * @return {!Promise.<!Uint8Array>}
 */
shaka.util.LicenseRequest.prototype.send = function() {
  return this.url_.fetch(this.parameters_).then(
      /** @param {!ArrayBuffer|string} body */
      function(body) {
        var response = /** @type {!ArrayBuffer} */ (body);
        return Promise.resolve(new Uint8Array(response));
      }
  );
};

