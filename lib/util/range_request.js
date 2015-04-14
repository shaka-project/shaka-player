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
 * @fileoverview Implements a range request.
 */

goog.provide('shaka.util.RangeRequest');

goog.require('shaka.asserts');
goog.require('shaka.util.AjaxRequest');



/**
 * Creates a RangeRequest.
 *
 * @param {string} url The URL.
 * @param {number} begin The start byte.
 * @param {?number} end The end byte, null to request to the end.
 * @param {number=} opt_maxAttempts
 * @param {number=} opt_baseRetryDelayMs
 *
 * @struct
 * @constructor
 * @extends {shaka.util.AjaxRequest}
 */
shaka.util.RangeRequest =
    function(url, begin, end, opt_maxAttempts, opt_baseRetryDelayMs) {
  shaka.util.AjaxRequest.call(this, url);

  shaka.asserts.assert(begin !== undefined && begin !== null);
  // Avoid adding the Range header if the range is actually the whole file.
  if (begin || end) {
    var rangeString = begin + '-' + (end != null ? end : '');
    this.parameters.requestHeaders['Range'] = 'bytes=' + rangeString;
  }

  if (opt_maxAttempts)
    this.parameters.maxAttempts = opt_maxAttempts;

  if (opt_baseRetryDelayMs)
    this.parameters.baseRetryDelayMs = opt_baseRetryDelayMs;
};
goog.inherits(shaka.util.RangeRequest, shaka.util.AjaxRequest);


/**
 * Sends the range request.
 * @return {!Promise.<!ArrayBuffer>}
 */
shaka.util.RangeRequest.prototype.send = function() {
  return this.sendInternal().then(shaka.util.TypedBind(this,
      /** @param {!XMLHttpRequest} xhr */
      function(xhr) {
        var data = /** @type {ArrayBuffer} */ (xhr.response);
        return Promise.resolve(data);
      })
  );
};

