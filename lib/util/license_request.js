/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview Implements a license request.
 */

goog.provide('shaka.util.LicenseRequest');

goog.require('shaka.util.AjaxRequest');



/**
 * Creates a LicenseRequest. A LicenseRequest manages retries automatically.
 *
 * @param {string} serverUrl The URL of the license server.
 * @param {!ArrayBuffer} requestBody The body of the license request.
 * @param {boolean} withCredentials True if cookies should be sent in
 *     cross-domain license requests.  If true, the browser will reject license
 *     responses which use the wildcard header "Access-Control-Allow-Origin: *".
 *     See http://goo.gl/pzY9F7 for more information.
 *
 * @struct
 * @constructor
 * @extends {shaka.util.AjaxRequest}
 */
shaka.util.LicenseRequest = function(serverUrl, requestBody, withCredentials) {
  shaka.util.AjaxRequest.call(this, serverUrl);
  this.parameters.body = requestBody;
  this.parameters.method = 'POST';
  this.parameters.maxAttempts = 3;
  this.parameters.withCredentials = withCredentials;
};
goog.inherits(shaka.util.LicenseRequest, shaka.util.AjaxRequest);


/**
 * Sends the license request.
 * @return {!Promise.<!Uint8Array>}
 */
shaka.util.LicenseRequest.prototype.send = function() {
  return this.sendInternal().then(
      /** @param {!XMLHttpRequest} xhr */
      function(xhr) {
        var response = /** @type {ArrayBuffer} */ (xhr.response);
        return Promise.resolve(new Uint8Array(response));
      }
  );
};

