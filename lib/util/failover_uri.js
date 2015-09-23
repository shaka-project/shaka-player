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

goog.provide('shaka.util.FailoverUri');

goog.require('goog.Uri');
goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.util.AjaxRequest');



/**
 * Creates a FailoverUri, which handles requests to multiple URLs in case of
 * failure.
 *
 * @param {shaka.util.FailoverUri.NetworkCallback} callback
 * @param {Array.<!goog.Uri>} urls
 * @param {number=} opt_startByte The start byte of the data, defaults to 0.
 * @param {?number=} opt_endByte The end byte of the data, null means the end;
 *     defaults to null.
 * @constructor
 */
shaka.util.FailoverUri = function(callback, urls, opt_startByte, opt_endByte) {
  shaka.asserts.assert(urls);
  shaka.asserts.assert(urls.length > 0);

  /** @const {!Array.<!goog.Uri>} */
  this.urls = urls;

  /** @const {number} */
  this.startByte = opt_startByte || 0;

  /** @const {?number} */
  this.endByte = opt_endByte != null ? opt_endByte : null;

  /** @private {?Promise} */
  this.requestPromise_ = null;

  /** @private {shaka.util.AjaxRequest} */
  this.request_ = null;

  /** @private {shaka.util.FailoverUri.NetworkCallback} */
  this.callback_ = callback;
};


/**
 * A callback to the application called prior to media network events.  The
 * first parameter is the URL for the request.  The second parameter is the
 * headers for the request.  These can be modified.  The callback should return
 * a modified URL for the request, or null to use the original.
 *
 * @typedef {?function(string,!Object.<string, string>):(string?)}
 * @exportDoc
 */
shaka.util.FailoverUri.NetworkCallback;


/**
 * Resolves a relative url to the given |baseUrl|.
 *
 * @param {Array.<!goog.Uri>} baseUrl
 * @param {!goog.Uri} url
 * @return {!Array.<!goog.Uri>}
 */
shaka.util.FailoverUri.resolve = function(baseUrl, url) {
  if (!baseUrl || baseUrl.length === 0) {
    return [url];
  }

  return baseUrl.map(function(e) { return e.resolve(url); });
};


/**
 * Gets the data specified by the URLs.
 *
 * @param {shaka.util.AjaxRequest.Parameters=} opt_parameters
 * @param {shaka.util.IBandwidthEstimator=} opt_estimator
 * @return {!Promise.<!ArrayBuffer|string>}
 */
shaka.util.FailoverUri.prototype.fetch =
    function(opt_parameters, opt_estimator) {
  if (this.requestPromise_) {
    // A fetch is already in progress.
    return this.requestPromise_;
  }

  var parameters = opt_parameters || new shaka.util.AjaxRequest.Parameters();
  if (this.startByte || this.endByte) {
    var rangeString =
        this.startByte + '-' + (this.endByte != null ? this.endByte : '');
    parameters.requestHeaders['Range'] = 'bytes=' + rangeString;
  }

  shaka.asserts.assert(!this.request_);
  this.requestPromise_ = this.createRequest_(0, parameters, opt_estimator);
  return this.requestPromise_;
};


/**
 * Aborts fetch() if it is pending.
 */
shaka.util.FailoverUri.prototype.abortFetch = function() {
  if (this.request_) {
    // Set the promise first to indicate to the running promise it is an abort.
    this.requestPromise_ = null;
    this.request_.abort();
    this.request_ = null;
  }
};


/**
 * Creates a request using the given url.  This will add the catch block
 * and will recursively call itself to handle failover.
 *
 * @private
 * @param {number} i
 * @param {!shaka.util.AjaxRequest.Parameters} parameters
 * @param {shaka.util.IBandwidthEstimator=} opt_estimator
 * @return {!Promise.<!ArrayBuffer|string>}
 */
shaka.util.FailoverUri.prototype.createRequest_ =
    function(i, parameters, opt_estimator) {
  shaka.asserts.assert(i < this.urls.length);

  var url = this.urls[i].toString();
  if (this.callback_) {
    url = this.callback_(url, parameters.requestHeaders) || url;
  }
  this.request_ = new shaka.util.AjaxRequest(url, parameters);
  if (opt_estimator) {
    this.request_.estimator = opt_estimator;
  }

  var p = this.request_.send().then(shaka.util.TypedBind(this,
      /** @param {!XMLHttpRequest} xhr */
      function(xhr) {
        // |requestPromise_| MUST be set to null; otherwise, we will
        // effectively cache every response.
        this.requestPromise_ = null;
        this.request_ = null;
        return Promise.resolve(xhr.response);
      }));

  p = p.catch(shaka.util.TypedBind(this,
      /** @param {*} error */
      function(error) {
        if (this.requestPromise_ && i + 1 < this.urls.length) {
          shaka.log.info('Trying fallback URL...');
          this.requestPromise_ = this.createRequest_(
              i + 1, parameters, opt_estimator);
          return this.requestPromise_;
        } else {
          this.request_ = null;
          this.requestPromise_ = null;
          return Promise.reject(error);
        }
      }));

  return p;
};


/**
 * Creates a deep-copy of the object.
 *
 * @return {!shaka.util.FailoverUri}
 */
shaka.util.FailoverUri.prototype.clone = function() {
  return new shaka.util.FailoverUri(
      this.callback_,
      this.urls.map(function(a) { return a.clone(); }),
      this.startByte,
      this.endByte
  );
};


/**
 * Gets the first url.
 *
 * @return {!string}
 */
shaka.util.FailoverUri.prototype.toString = function() {
  return this.urls[0].toString();
};

