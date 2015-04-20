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
 * @fileoverview Implements an asynchronous HTTP request.
 */

goog.provide('shaka.util.AjaxRequest');

goog.require('goog.Uri');
goog.require('shaka.asserts');
goog.require('shaka.util.Clock');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TypedBind');
goog.require('shaka.util.Uint8ArrayUtils');



/**
 * Creates an AjaxRequest. An AjaxRequest manages retries automatically.
 *
 * @param {string} url The URL to request.
 *
 * @struct
 * @constructor
 */
shaka.util.AjaxRequest = function(url) {
  /**
   * The request URL.
   * @protected {string}
   */
  this.url = url;

  /**
   * A collection of parameters which an instance of a subclass may wish to
   * override.
   * @protected {!shaka.util.AjaxRequest.Parameters}
   */
  this.parameters = new shaka.util.AjaxRequest.Parameters();

  /**
   * The number of times the request has been attempted.
   * @private {number}
   */
  this.attempts_ = 0;

  /**
   * A timestamp in milliseconds when the request began.
   * @private {number}
   */
  this.startTime_ = 0;

  /**
   * The delay, in milliseconds, before the next retry.
   * @private {number}
   */
  this.retryDelayMs_ = 0;

  /**
   * The last used delay.  This is used in unit tests only.
   * @private {number}
   */
  this.lastDelayMs_ = 0;

  /** @private {XMLHttpRequest} */
  this.xhr_ = null;

  /**
   * Resolved when the request is completed successfully.
   * Rejected if it cannot be completed.
   * @private {shaka.util.PublicPromise.<!XMLHttpRequest>}
   */
  this.promise_ = new shaka.util.PublicPromise();

  /** @type {shaka.util.IBandwidthEstimator} */
  this.estimator = null;
};



/**
 * A collection of parameters which an instance of a subclass may wish to
 * override.
 *
 * @struct
 * @constructor
 */
shaka.util.AjaxRequest.Parameters = function() {
  /**
   * The request body, if desired.
   * @type {ArrayBuffer}
   */
  this.body = null;

  /**
   * The maximum number of times the request should be attempted.
   * @type {number}
   */
  this.maxAttempts = 1;

  /**
   * The delay before the first retry, in milliseconds.
   * @type {number}
   */
  this.baseRetryDelayMs = 1000;

  /**
   * The multiplier for successive retry delays.
   * @type {number}
   */
  this.retryBackoffFactor = 2.0;

  /**
   * The maximum amount of fuzz to apply to each retry delay.
   * For example, 0.5 means "between 50% below and 50% above the retry delay."
   * @type {number}
   */
  this.retryFuzzFactor = 0.5;

  /**
   * The request timeout, in milliseconds.  Zero means "unlimited".
   * @type {number}
   */
  this.requestTimeoutMs = 0;

  /**
   * The HTTP request method, such as 'GET' or 'POST'.
   * @type {string}
   */
  this.method = 'GET';

  /**
   * The response type, corresponding to XMLHttpRequest.responseType.
   * @type {string}
   */
  this.responseType = 'arraybuffer';

  /**
   * A dictionary of request headers.
   * @type {!Object.<string, string>}
   */
  this.requestHeaders = {};

  /**
   * Make requests with credentials.  This will allow cookies in cross-site
   * requests.
   * @see http://goo.gl/YBRKPe
   * @type {boolean}
   */
  this.withCredentials = false;

  /**
   * Will attempt to read the server's Date header and synchronize the clock.
   * @see shaka.util.Clock
   * @type {boolean}
   */
  this.synchronizeClock = false;
};


/**
 * Destroys the AJAX request.
 * This happens automatically after the internal promise is resolved or
 * rejected.
 *
 * @private
 */
shaka.util.AjaxRequest.prototype.destroy_ = function() {
  this.cleanupRequest_();
  this.parameters.body = null;
  this.promise_ = null;
  this.estimator = null;
};


/**
 * Remove |xhr_|'s references to bound functions, and set |xhr_| to null.
 *
 * @private
 */
shaka.util.AjaxRequest.prototype.cleanupRequest_ = function() {
  if (this.xhr_) {
    this.xhr_.onload = null;
    this.xhr_.onreadystatechange = null;
    this.xhr_.onerror = null;
  }
  this.xhr_ = null;
};


/**
 * Sends the request.  Called by subclasses.
 *
 * @return {Promise.<!XMLHttpRequest>}
 *
 * @protected
 */
shaka.util.AjaxRequest.prototype.sendInternal = function() {
  shaka.asserts.assert(this.xhr_ == null);
  if (this.xhr_) {
    // The request is already in-progress, so there's nothing to do.
    return this.promise_;
  }

  // We can't request from data or idb URIs, so handle it separately.
  if (this.url.lastIndexOf('data:', 0) == 0) {
    return this.handleDataUri_();
  } else if (this.url.lastIndexOf('idb:', 0) == 0) {
    return this.handleOfflineUri_();
  }

  this.attempts_++;
  this.startTime_ = Date.now();

  if (!this.retryDelayMs_) {
    // First try.  Lock in the retry delay.
    this.retryDelayMs_ = this.parameters.baseRetryDelayMs;
  }

  this.xhr_ = new XMLHttpRequest();

  var url = this.url;
  if (this.estimator) {
    // NOTE:  Cached responses ruin bandwidth estimation and can cause wildly
    // inappropriate adaptation decisions.  Since we cannot detect that a
    // response was cached after the fact, we add a cache-busting parameter to
    // the request to avoid caching.  There are other methods, but they do not
    // work cross-origin without control over both client and server.
    var modifiedUri = new goog.Uri(url);
    modifiedUri.getQueryData().add('_', Date.now());
    url = modifiedUri.toString();
  }

  this.xhr_.open(this.parameters.method, url, true);
  this.xhr_.responseType = this.parameters.responseType;
  this.xhr_.timeout = this.parameters.requestTimeoutMs;
  this.xhr_.withCredentials = this.parameters.withCredentials;

  this.xhr_.onload = this.onLoad_.bind(this);
  if (this.parameters.synchronizeClock) {
    this.xhr_.onreadystatechange = this.onReadyStateChange_.bind(this);
  }
  this.xhr_.onerror = this.onError_.bind(this);

  for (var k in this.parameters.requestHeaders) {
    this.xhr_.setRequestHeader(k, this.parameters.requestHeaders[k]);
  }
  this.xhr_.send(this.parameters.body);

  return this.promise_;
};


/**
 * Handles a data URI.
 * This method does not modify |this|'s state.
 *
 * @return {!Promise}
 *
 * @private
 */
shaka.util.AjaxRequest.prototype.handleDataUri_ = function() {
  // Alias.
  var StringUtils = shaka.util.StringUtils;
  var Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

  // Fake the data URI request.
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/data_URIs
  var path = this.url.split(':')[1];
  var optionalTypeAndRest = path.split(';');
  var rest = optionalTypeAndRest.pop();
  var optionalEncodingAndData = rest.split(',');
  var data = optionalEncodingAndData.pop();
  var optionalEncoding = optionalEncodingAndData.pop();

  if (optionalEncoding == 'base64') {
    data = StringUtils.fromBase64(data);
  } else {
    data = window.decodeURIComponent(data);
  }

  if (this.parameters.responseType == 'arraybuffer') {
    data = Uint8ArrayUtils.fromString(data).buffer;
  }

  // We can't set the response field of an XHR, although we can make a
  // hacky object that will still look like an XHR.
  var xhr = /** @type {!XMLHttpRequest} */ (
      JSON.parse(JSON.stringify(new XMLHttpRequest())));
  xhr.response = data;
  xhr.responseText = data.toString();

  var promise = this.promise_;
  promise.resolve(xhr);
  this.destroy_();
  return promise;
};


/**
 * Handles an offline URI.
 * This method does not modify |this|'s state.
 *
 * @return {!Promise}
 *
 * @private
 */
shaka.util.AjaxRequest.prototype.handleOfflineUri_ = function() {
  // URL should have format idb://<streamId>/<segmentId>
  var ids = this.url.split('/');
  shaka.asserts.assert(ids.length == 4);
  var streamId = parseInt(ids[2], 10);
  var segmentId = parseInt(ids[3], 10);
  shaka.asserts.assert(!isNaN(streamId));
  shaka.asserts.assert(!isNaN(segmentId));

  var db = new shaka.util.ContentDatabase(null, null);
  return db.setUpDatabase().then(
      function() {
        return db.retrieveSegment(streamId, segmentId);
      }
  ).then(shaka.util.TypedBind(this,
      /** @param {ArrayBuffer} data */
      function(data) {
        // We can't set the response field of an XHR, although we can make a
        // hacky object that will still look like an XHR.
        var xhr = /** @type {!XMLHttpRequest} */ (
            JSON.parse(JSON.stringify(new XMLHttpRequest())));
        xhr.response = data;

        var promise = this.promise_;
        promise.resolve(xhr);
        db.closeDatabaseConnection();
        this.destroy_();
        return promise;
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {Error} e */
      function(e) {
        db.closeDatabaseConnection();
        this.destroy_();
        return Promise.reject(e);
      })
  );
};


/**
 * Creates an error object with necessary details about the request.
 * @param {string} message The error message.
 * @param {string} type The error type.
 * @return {!Error}
 * @private
 */
shaka.util.AjaxRequest.prototype.createError_ = function(message, type) {
  var error = new Error(message);
  error.type = type;
  error.status = this.xhr_.status;
  error.url = this.url;
  error.method = this.parameters.method;
  error.body = this.parameters.body;
  error.xhr = this.xhr_;
  return error;
};


/**
 * Aborts an in-progress request.
 * If a request is not in-progress then this function does nothing.
 */
shaka.util.AjaxRequest.prototype.abort = function() {
  if (!this.xhr_ || this.xhr_.readyState == XMLHttpRequest.DONE) {
    return;
  }
  shaka.asserts.assert(this.xhr_.readyState != 0);

  this.xhr_.abort();

  var error = this.createError_('Request aborted.', 'aborted');
  this.promise_.reject(error);
  this.destroy_();
};


/**
 * Handles a "load" event.
 *
 * @param {!ProgressEvent} event The ProgressEvent from the request.
 *
 * @private
 */
shaka.util.AjaxRequest.prototype.onLoad_ = function(event) {
  shaka.asserts.assert(event.target == this.xhr_);

  if (this.estimator) {
    this.estimator.sample(Date.now() - this.startTime_, event.loaded);
  }

  if (this.xhr_.status >= 200 && this.xhr_.status <= 299) {
    // All 2xx HTTP codes are success cases.
    this.promise_.resolve(this.xhr_);
    this.destroy_();
  } else if (this.attempts_ < this.parameters.maxAttempts) {
    this.cleanupRequest_();

    var sendAgain = this.sendInternal.bind(this);

    // Fuzz the delay to avoid tons of clients hitting the server at once
    // after it recovers from whatever is causing it to fail.
    var negToPosOne = (Math.random() * 2.0) - 1.0;
    var negToPosFuzzFactor = negToPosOne * this.parameters.retryFuzzFactor;
    var fuzzedDelay = this.retryDelayMs_ * (1.0 + negToPosFuzzFactor);
    window.setTimeout(sendAgain, fuzzedDelay);

    // Store the fuzzed delay to make testing retries feasible.
    this.lastDelayMs_ = fuzzedDelay;

    // Back off the next delay.
    this.retryDelayMs_ *= this.parameters.retryBackoffFactor;
  } else {
    var error = this.createError_('HTTP error.', 'net');
    this.promise_.reject(error);
    this.destroy_();
  }
};


/**
 * Handles a "readystatechange" event.
 *
 * @private
 */
shaka.util.AjaxRequest.prototype.onReadyStateChange_ = function() {
  if (this.xhr_.readyState != XMLHttpRequest.HEADERS_RECEIVED) {
    return;
  }

  shaka.asserts.assert(this.parameters.synchronizeClock);

  // This may not be available, depending on server configuration and CORS.
  // For clock synchronization to work cross-origin, the server explicitly
  // has to allow the client access to the "Date" header using the response
  // header "Access-Control-Expose-Headers".
  // It is also worth noting that this is not a fancy sync mechanism and
  // does not account for round-trip times or latency.  For our purposes,
  // subsecond synchronization is not really necessary.
  var date = Date.parse(this.xhr_.getResponseHeader('Date'));
  if (date) {
    shaka.util.Clock.sync(date);
  }
};


/**
 * Handles an "error" event.
 *
 * @param {!ProgressEvent} event The ProgressEvent from this.xhr_.
 *
 * @private
 */
shaka.util.AjaxRequest.prototype.onError_ = function(event) {
  // Do not try again since an "error" event is usually unrecoverable.
  shaka.asserts.assert(event.target == this.xhr_);

  var error = this.createError_('Network failure.', 'net');
  this.promise_.reject(error);
  this.destroy_();
};

