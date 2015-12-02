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

goog.provide('shaka.net.NetworkingEngine');

goog.require('goog.Uri');
goog.require('shaka.asserts');
goog.require('shaka.util.Error');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.PublicPromise');



/**
 * NetworkingEngine wraps all networking operations.  This accepts plugins that
 * handle the actual request.  A plugin is registered using registerPlugin.
 * Each scheme has at most one plugin to handle the request.
 *
 * @struct
 * @constructor
 * @implements {shaka.util.IDestroyable}
 */
shaka.net.NetworkingEngine = function() {
  /** @private {boolean} */
  this.destroyed_ = false;

  /** @private {!Array.<Promise>} */
  this.requests_ = [];

  /** @private {!Array.<shaka.net.NetworkingEngine.RequestFilter>} */
  this.requestFilters_ = [];

  /** @private {!Array.<shaka.net.NetworkingEngine.ResponseFilter>} */
  this.responseFilters_ = [];
};


/**
 * <p>
 * Defines parameters for how to retry requests.
 * </p>
 *
 * <ul>
 * <li>
 *   <b>maxAttempts</b>: number <br>
 *   The maximum number of times the request should be attempted.
 *
 * <li>
 *   <b>baseDelay</b>: number <br>
 *   The delay before the first retry, in milliseconds.
 *
 * <li>
 *   <b>backoffFactor</b>: number <br>
 *   The multiplier for successive retry delays.
 *
 * <li>
 *   <b>fuzzFactor</b>: number <br>
 *   The maximum amount of fuzz to apply to each retry delay.
 *   For example, 0.5 means "between 50% below and 50% above the retry delay."
 *
 * <li>
 *   <b>timeout</b>: number <br>
 *   The request timeout, in milliseconds.  Zero means "unlimited".
 * </ul>
 *
 * @typedef {{
 *     maxAttempts: number,
 *     baseDelay: number,
 *     backoffFactor: number,
 *     fuzzFactor: number,
 *     timeout: number
 * }}
 */
shaka.net.NetworkingEngine.RetryParameters;


/**
 * <p>
 * Defines a request object.  This is passed to one or more request filters that
 * alter the request; then it is passed to a scheme plugin which performs the
 * actual request operation.
 * </p>
 *
 * <ul>
 * <li>
 *   <b>uri</b>: Array.&lt;string&gt; <br>
 *   An array of URIs to attempt.  They will be tried in the order they are
 *   given.
 *
 *   <b>method</b>: string <br>
 *   The HTTP method to use for the request.
 *
 *   <b>body</b>: ArrayBuffer <br>
 *   The body of the request.
 *
 *   <b>headers</b>: Object.&lt;string, string&gt; <br>
 *   A mapping of headers for the request.  e.g.: {'HEADER': 'VALUE'}
 *
 *   <b>allowCrossSiteCredentials</b>: boolean <br>
 *   Make requests with credentials.  This will allow cookies in cross-site
 *   requests.  See <a href="http://goo.gl/YBRKPe">http://goog.gl/YBRKPe</a>.
 *
 *   <b>retryParameters</b>: RetryParameters <br>
 *   An object used to define how often to make retries.
 * </ul>
 *
 * @typedef {{
 *     uri: !Array.<string>,
 *     method: string,
 *     body: ArrayBuffer,
 *     headers: !Object.<string, string>,
 *     allowCrossSiteCredentials: boolean,
 *     retryParameters: !shaka.net.NetworkingEngine.RetryParameters
 * }}
 */
shaka.net.NetworkingEngine.Request;


/**
 * Defines possible request types.
 *
 * @enum {number}
 */
shaka.net.NetworkingEngine.RequestType = {
  MANIFEST: 0,
  SEGMENT: 1,
  LICENSE: 2
};


/**
 * Defines a response object.  This includes the response data and header info.
 * This is given back from the scheme plugin.  This is passed to a response
 * filter before being returned from the request call.
 *
 * @typedef {{
 *     data: ArrayBuffer,
 *     headers: !Object.<string, string>
 * }}
 */
shaka.net.NetworkingEngine.Response;


/**
 * Defines a plugin that handles a specific scheme.
 *
 * @typedef {!function(string, shaka.net.NetworkingEngine.Request):
 *     Promise.<shaka.net.NetworkingEngine.Response>}
 */
shaka.net.NetworkingEngine.SchemePlugin;


/**
 * Defines a filter for requests.  This filter takes the request and modifies
 * it before it is sent to the scheme plugin.
 *
 * @typedef {!function(shaka.net.NetworkingEngine.RequestType,
 *                     shaka.net.NetworkingEngine.Request)}
 */
shaka.net.NetworkingEngine.RequestFilter;


/**
 * Defines a filter for responses.  This filter takes the response and modifies
 * it before it is returned.
 *
 * @typedef {!function(shaka.net.NetworkingEngine.RequestType,
 *                     shaka.net.NetworkingEngine.Response)}
 */
shaka.net.NetworkingEngine.ResponseFilter;


/**
 * Contains the scheme plugins.
 *
 * @private {!Object.<string, ?shaka.net.NetworkingEngine.SchemePlugin>}
 */
shaka.net.NetworkingEngine.schemes_ = {};


/**
 * Registers a scheme plugin.  This plugin will handle all requests with the
 * given scheme.  If a plugin with the same scheme already exists, it is
 * replaced.
 *
 * @param {string} scheme
 * @param {shaka.net.NetworkingEngine.SchemePlugin} plugin
 * @export
 */
shaka.net.NetworkingEngine.registerScheme = function(scheme, plugin) {
  shaka.net.NetworkingEngine.schemes_[scheme] = plugin;
};


/**
 * Removes a scheme plugin.
 *
 * @param {string} scheme
 * @export
 */
shaka.net.NetworkingEngine.unregisterScheme = function(scheme) {
  delete shaka.net.NetworkingEngine.schemes_[scheme];
};


/**
 * Registers a new request filter.  All filters are applied in the order they
 * are registered.
 *
 * @param {shaka.net.NetworkingEngine.RequestFilter} filter
 * @export
 */
shaka.net.NetworkingEngine.prototype.registerRequestFilter = function(filter) {
  this.requestFilters_.push(filter);
};


/**
 * Removes a request filter.
 *
 * @param {shaka.net.NetworkingEngine.RequestFilter} filter
 * @export
 */
shaka.net.NetworkingEngine.prototype.unregisterRequestFilter =
    function(filter) {
  var filters = this.requestFilters_;
  var i = filters.indexOf(filter);
  if (i >= 0) {
    filters.splice(i, 1);
  }
};


/**
 * Registers a new response filter.  All filters are applied in the order they
 * are registered.
 *
 * @param {shaka.net.NetworkingEngine.ResponseFilter} filter
 * @export
 */
shaka.net.NetworkingEngine.prototype.registerResponseFilter = function(filter) {
  this.responseFilters_.push(filter);
};


/**
 * Removes a response filter.
 *
 * @param {shaka.net.NetworkingEngine.ResponseFilter} filter
 * @export
 */
shaka.net.NetworkingEngine.prototype.unregisterResponseFilter =
    function(filter) {
  var filters = this.responseFilters_;
  var i = filters.indexOf(filter);
  if (i >= 0) {
    filters.splice(i, 1);
  }
};


/** @override */
shaka.net.NetworkingEngine.prototype.destroy = function() {
  this.destroyed_ = true;
  this.requestFilters_ = [];
  this.responseFilters_ = [];

  var cleanup = [];
  for (var i = 0; i < this.requests_.length; ++i) {
    cleanup.push(this.requests_[i].catch(function() {}));
  }
  return Promise.all(cleanup);
};


/**
 * Makes a network request and returns the resulting data.
 *
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shaka.net.NetworkingEngine.Request} request
 * @return {!Promise.<shaka.net.NetworkingEngine.Response>}
 * @export
 */
shaka.net.NetworkingEngine.prototype.request = function(type, request) {
  if (this.destroyed_)
    return Promise.reject();

  shaka.asserts.assert(request.uri);

  // Send to the filter first, in-case they change the URI.
  var requestFilters = this.requestFilters_;
  for (var i = 0; i < requestFilters.length; i++) {
    try {
      requestFilters[i](type, request);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  var retry = request.retryParameters || {};
  var maxAttempts = retry.maxAttempts || 1;
  var backoffFactor = retry.backoffFactor || 2.0;
  var delay = (retry.baseDelay == null ? 1000 : retry.baseDelay);

  var p = this.send_(type, request, 0);
  for (var i = 1; i < maxAttempts; i++) {
    var index = i % request.uri.length;
    p = /** @type {!Promise.<shaka.net.NetworkingEngine.Response>} */ (
        p.catch(this.resend_.bind(this, type, request, delay, index)));
    delay *= backoffFactor;
  }

  // Add the request to the array.
  this.requests_.push(p);
  return p.then(function(response) {
    this.requests_.splice(this.requests_.indexOf(p), 1);
    return response;
  }.bind(this)).catch(function(e) {
    this.requests_.splice(this.requests_.indexOf(p), 1);
    return Promise.reject(e);
  }.bind(this));
};


/**
 * Sends the given request to the correct plugin.  This does not handle retry.
 *
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shaka.net.NetworkingEngine.Request} request
 * @param {number} index
 * @return {!Promise.<shaka.net.NetworkingEngine.Response>}
 * @private
 */
shaka.net.NetworkingEngine.prototype.send_ = function(type, request, index) {
  if (this.destroyed_)
    return Promise.reject();

  var uri = new goog.Uri(request.uri[index]);
  var scheme = uri.getScheme();
  var plugin = shaka.net.NetworkingEngine.schemes_[scheme];
  if (!plugin) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.UNSUPPORTED_SCHEME,
        uri));
  }

  return plugin(request.uri[index], request).then(function(response) {
    // Since we are inside a promise, no need to catch errors; they will result
    // in a failed promise.
    var responseFilters = this.responseFilters_;
    for (var i = 0; i < responseFilters.length; i++) {
      responseFilters[i](type, response);
    }

    return response;
  }.bind(this));
};


/**
 * Resends the request after applying a delay.  This does not handle retry.
 *
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shaka.net.NetworkingEngine.Request} request
 * @param {number} delayMs The current base delay.
 * @param {number} index
 * @return {!Promise.<shaka.net.NetworkingEngine.Response>}
 * @private
 */
shaka.net.NetworkingEngine.prototype.resend_ =
    function(type, request, delayMs, index) {
  var p = new shaka.util.PublicPromise();

  // Fuzz the delay to avoid tons of clients hitting the server at once
  // after it recovers from whatever is causing it to fail.
  var retry = request.retryParameters || {};
  var fuzzFactor = (retry.fuzzFactor == null ? 0.5 : retry.fuzzFactor);
  var negToPosOne = (Math.random() * 2.0) - 1.0;
  var negToPosFuzzFactor = negToPosOne * fuzzFactor;
  var fuzzedDelay = delayMs * (1.0 + negToPosFuzzFactor);
  window.setTimeout(p.resolve, fuzzedDelay);

  return p.then(this.send_.bind(this, type, request, index));
};

