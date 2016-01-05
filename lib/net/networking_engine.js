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
 * handle the actual request.  A plugin is registered using registerScheme.
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
 * Request types.  Allows a filter to decide which requests to read/alter.
 *
 * @enum {number}
 * @export
 */
shaka.net.NetworkingEngine.RequestType = {
  'MANIFEST': 0,
  'SEGMENT': 1,
  'LICENSE': 2
};


/**
 * Defines a plugin that handles a specific scheme.
 *
 * @typedef {!function(string, shakaExtern.Request):
 *     Promise.<shakaExtern.Response>}
 */
shaka.net.NetworkingEngine.SchemePlugin;


/**
 * Defines a filter for requests.  This filter takes the request and modifies
 * it before it is sent to the scheme plugin.
 *
 * @typedef {!function(shaka.net.NetworkingEngine.RequestType,
 *                     shakaExtern.Request)}
 */
shaka.net.NetworkingEngine.RequestFilter;


/**
 * Defines a filter for responses.  This filter takes the response and modifies
 * it before it is returned.
 *
 * @typedef {!function(shaka.net.NetworkingEngine.RequestType,
 *                     shakaExtern.Response)}
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
 * @param {shakaExtern.Request} request
 * @return {!Promise.<shakaExtern.Response>}
 * @export
 */
shaka.net.NetworkingEngine.prototype.request = function(type, request) {
  if (this.destroyed_)
    return Promise.reject();

  shaka.asserts.assert(request.uris && request.uris.length,
                       'Request without URIs!');

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
    var index = i % request.uris.length;
    p = /** @type {!Promise.<shakaExtern.Response>} */ (
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
 * @param {shakaExtern.Request} request
 * @param {number} index
 * @return {!Promise.<shakaExtern.Response>}
 * @private
 */
shaka.net.NetworkingEngine.prototype.send_ = function(type, request, index) {
  if (this.destroyed_)
    return Promise.reject();

  var uri = new goog.Uri(request.uris[index]);
  var scheme = uri.getScheme();
  var plugin = shaka.net.NetworkingEngine.schemes_[scheme];
  if (!plugin) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.UNSUPPORTED_SCHEME,
        uri));
  }

  return plugin(request.uris[index], request).then(function(response) {
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
 * @param {shakaExtern.Request} request
 * @param {number} delayMs The current base delay.
 * @param {number} index
 * @return {!Promise.<shakaExtern.Response>}
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

