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

goog.provide('shaka.net.NetworkingEngine');

goog.require('goog.Uri');
goog.require('goog.asserts');
goog.require('shaka.net.Backoff');
goog.require('shaka.util.ConfigUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');



/**
 * NetworkingEngine wraps all networking operations.  This accepts plugins that
 * handle the actual request.  A plugin is registered using registerScheme.
 * Each scheme has at most one plugin to handle the request.
 *
 * @param {function(number, number)=} opt_onSegmentDownloaded Called
 *   when a segment is downloaded. Passed the duration, in milliseconds, that
 *   the request took; and the total number of bytes transferred.
 *
 * @struct
 * @constructor
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.net.NetworkingEngine = function(opt_onSegmentDownloaded) {
  /** @private {boolean} */
  this.destroyed_ = false;

  /** @private {!Array.<!Promise>} */
  this.requests_ = [];

  /** @private {!Array.<shakaExtern.RequestFilter>} */
  this.requestFilters_ = [];

  /** @private {!Array.<shakaExtern.ResponseFilter>} */
  this.responseFilters_ = [];

  /** @private {?function(number, number)} */
  this.onSegmentDownloaded_ = opt_onSegmentDownloaded || null;
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
  'LICENSE': 2,
  'APP': 3
};


/**
 * Priority level for network scheme plugins.
 * If multiple plugins are provided for the same scheme, only the
 * highest-priority one is used.
 *
 * @enum {number}
 * @export
 */
shaka.net.NetworkingEngine.PluginPriority = {
  FALLBACK: 1,
  PREFERRED: 2,
  APPLICATION: 3
};


/**
 * @typedef {{
 *   plugin: shakaExtern.SchemePlugin,
 *   priority: number
 * }}
 * @property {shakaExtern.SchemePlugin} plugin
 *   The associated plugin.
 * @property {number} priority
 *   The plugin's priority.
 */
shaka.net.NetworkingEngine.SchemeObject;


/**
 * Contains the scheme plugins.
 *
 * @private {!Object.<string, shaka.net.NetworkingEngine.SchemeObject>}
 */
shaka.net.NetworkingEngine.schemes_ = {};


/**
 * Registers a scheme plugin.  This plugin will handle all requests with the
 * given scheme.  If a plugin with the same scheme already exists, it is
 * replaced, unless the existing plugin is of higher priority.
 * If no priority is provided, this defaults to the highest priority of
 * APPLICATION.
 *
 * @param {string} scheme
 * @param {shakaExtern.SchemePlugin} plugin
 * @param {number=} opt_priority
 * @export
 */
shaka.net.NetworkingEngine.registerScheme =
    function(scheme, plugin, opt_priority) {
  goog.asserts.assert(opt_priority == undefined || opt_priority > 0,
      'explicit priority must be > 0');
  var priority =
      opt_priority || shaka.net.NetworkingEngine.PluginPriority.APPLICATION;
  var existing = shaka.net.NetworkingEngine.schemes_[scheme];
  if (!existing || priority >= existing.priority)
    shaka.net.NetworkingEngine.schemes_[scheme] = {
      priority: priority,
      plugin: plugin
    };
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
 * @param {shakaExtern.RequestFilter} filter
 * @export
 */
shaka.net.NetworkingEngine.prototype.registerRequestFilter = function(filter) {
  this.requestFilters_.push(filter);
};


/**
 * Removes a request filter.
 *
 * @param {shakaExtern.RequestFilter} filter
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
 * Clear all request filters.
 *
 * @export
 */
shaka.net.NetworkingEngine.prototype.clearAllRequestFilters = function() {
  this.requestFilters_ = [];
};


/**
 * Registers a new response filter.  All filters are applied in the order they
 * are registered.
 *
 * @param {shakaExtern.ResponseFilter} filter
 * @export
 */
shaka.net.NetworkingEngine.prototype.registerResponseFilter = function(filter) {
  this.responseFilters_.push(filter);
};


/**
 * Removes a response filter.
 *
 * @param {shakaExtern.ResponseFilter} filter
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


/**
 * Clear all response filters.
 *
 * @export
 */
shaka.net.NetworkingEngine.prototype.clearAllResponseFilters = function() {
  this.responseFilters_ = [];
};


/**
 * Gets a copy of the default retry parameters.
 *
 * @return {shakaExtern.RetryParameters}
 *
 * NOTE: The implementation moved to shaka.net.Backoff to avoid a circular
 * dependency between the two classes.
 */
shaka.net.NetworkingEngine.defaultRetryParameters =
    shaka.net.Backoff.defaultRetryParameters;


/**
 * Makes a simple network request for the given URIs.
 *
 * @param {!Array.<string>} uris
 * @param {shakaExtern.RetryParameters} retryParams
 * @return {shakaExtern.Request}
 */
shaka.net.NetworkingEngine.makeRequest = function(
    uris, retryParams) {
  return {
    uris: uris,
    method: 'GET',
    body: null,
    headers: {},
    allowCrossSiteCredentials: false,
    retryParameters: retryParams
  };
};


/**
 * @override
 * @export
 */
shaka.net.NetworkingEngine.prototype.destroy = function() {
  var Functional = shaka.util.Functional;
  this.destroyed_ = true;
  this.requestFilters_ = [];
  this.responseFilters_ = [];

  var cleanup = [];
  for (var i = 0; i < this.requests_.length; ++i) {
    cleanup.push(this.requests_[i].catch(Functional.noop));
  }
  return Promise.all(cleanup);
};


/**
 * Makes a network request and returns the resulting data.
 *
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shakaExtern.Request} request
 * @param {?function()=} opt_isCanceled
 * @return {!Promise.<shakaExtern.Response>}
 * @export
 */
shaka.net.NetworkingEngine.prototype.request =
    function(type, request, opt_isCanceled) {
  var isCanceled = opt_isCanceled || function() { return false; };
  var cloneObject = shaka.util.ConfigUtils.cloneObject;

  // New requests made after destroy is called are rejected.
  if (this.destroyed_)
    return Promise.reject();

  goog.asserts.assert(request.uris && request.uris.length,
                      'Request without URIs!');

  // If a request comes from outside the library, some parameters may be left
  // undefined.  To make it easier for application developers, we will fill them
  // in with defaults if necessary.
  //
  // We clone retryParameters and uris so that if a filter modifies the request,
  // then it doesn't contaminate future requests.
  request.method = request.method || 'GET';
  request.headers = request.headers || {};
  request.retryParameters = request.retryParameters ?
      cloneObject(request.retryParameters) :
      shaka.net.NetworkingEngine.defaultRetryParameters();
  request.uris = cloneObject(request.uris);

  var filterStartMs = Date.now();

  // Send to the filter first, in-case they change the URI.
  var p = Promise.resolve();
  this.requestFilters_.forEach(function(requestFilter) {
    // Request filters are resolved sequentially.
    p = p.then(requestFilter.bind(null, type, request));
  });

  // Catch any errors thrown by request filters, and substitute
  // them with a Shaka-native error.
  p = p.catch(function(e) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.REQUEST_FILTER_ERROR, e);
  });

  // Send out the request, and get a response.
  // The entire code is inside a then clause; thus, if a filter
  // rejects or errors, the networking engine will never send.
  p = p.then(function() {
    var filterTimeMs = (Date.now() - filterStartMs);
    var backoff = new shaka.net.Backoff(
        request.retryParameters, /* autoReset */ false, opt_isCanceled);
    var index = 0;
    // Every call to send_ must have an associated attempt() so that the
    // accounting in backoff is correct.
    return backoff.attempt().then(function() {
      return this.send_(
          type, request, backoff, index, filterTimeMs, isCanceled);
    }.bind(this));
  }.bind(this));

  // Add the request to the array.
  this.requests_.push(p);
  return p.then(function(response) {
    if (this.requests_.indexOf(p) >= 0) {
      this.requests_.splice(this.requests_.indexOf(p), 1);
    }
    if (this.onSegmentDownloaded_ && !response.fromCache &&
        type == shaka.net.NetworkingEngine.RequestType.SEGMENT) {
      this.onSegmentDownloaded_(response.timeMs, response.data.byteLength);
    }
    return response;
  }.bind(this)).catch(function(e) {
    // Ignore if using |Promise.reject()| to signal destroy.
    if (e) {
      goog.asserts.assert(e instanceof shaka.util.Error, 'Wrong error type');
      e.severity = shaka.util.Error.Severity.CRITICAL;
    }

    if (this.requests_.indexOf(p) >= 0) {
      this.requests_.splice(this.requests_.indexOf(p), 1);
    }
    return Promise.reject(e);
  }.bind(this));
};


/**
 * Sends the given request to the correct plugin and retry using Backoff.
 *
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shakaExtern.Request} request
 * @param {!shaka.net.Backoff} backoff
 * @param {number} index
 * @param {number} requestFilterTime
 * @param {function()} isCanceled
 * @return {!Promise.<shakaExtern.Response>}
 * @private
 */
shaka.net.NetworkingEngine.prototype.send_ = function(
    type, request, backoff, index, requestFilterTime, isCanceled) {
  // Retries sent after destroy is called are rejected.
  if (this.destroyed_ || isCanceled())
    return Promise.reject();

  var uri = new goog.Uri(request.uris[index]);
  var scheme = uri.getScheme();

  if (!scheme) {
    // If there is no scheme, infer one from the location.
    scheme = shaka.net.NetworkingEngine.getLocationProtocol_();
    goog.asserts.assert(scheme[scheme.length - 1] == ':',
                        'location.protocol expected to end with a colon!');
    // Drop the colon.
    scheme = scheme.slice(0, -1);

    // Override the original URI to make the scheme explicit.
    uri.setScheme(scheme);
    request.uris[index] = uri.toString();
  }

  var object = shaka.net.NetworkingEngine.schemes_[scheme];
  var plugin = object ? object.plugin : null;
  if (!plugin) {
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.UNSUPPORTED_SCHEME,
        uri));
  }

  var startTimeMs = Date.now();
  return plugin(request.uris[index], request, type).then(function(response) {
    if (response.timeMs == undefined)
      response.timeMs = Date.now() - startTimeMs;
    var filterStartMs = Date.now();

    var p = Promise.resolve();
    this.responseFilters_.forEach(function(responseFilter) {
      // Response filters are resolved sequentially.
      p = p.then(function() {
        return Promise.resolve(responseFilter(type, response));
      }.bind(this));
    }.bind(this));

    // Catch any errors thrown by response filters, and substitute
    // them with a Shaka-native error.
    p = p.catch(function(e) {
      var severity = shaka.util.Error.Severity.CRITICAL;
      if (e instanceof shaka.util.Error)
        severity = e.severity;

      throw new shaka.util.Error(
          severity,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.RESPONSE_FILTER_ERROR, e);
    });

    return p.then(function() {
      response.timeMs += Date.now() - filterStartMs;
      response.timeMs += requestFilterTime;

      return response;
    });
  }.bind(this)).catch(function(error) {
    if (error && error.severity == shaka.util.Error.Severity.RECOVERABLE) {
      // Move to the next URI.
      index = (index + 1) % request.uris.length;

      if (isCanceled())
        return Promise.reject();
      return backoff.attempt().then(function() {
        // Delay has passed.  Try again.
        return this.send_(
            type, request, backoff, index, requestFilterTime, isCanceled);
      }.bind(this), function() {
        // No more attempts are allowed.  Fail with the most recent error.
        throw error;
      });
    }

    // The error was not recoverable, so do not try again.
    // Rethrow the error so the Promise chain stays rejected.
    throw error;
  }.bind(this));
};


/**
 * This is here only for testability.  We can't mock location in our tests on
 * all browsers, so instead we mock this.
 *
 * @return {string} The value of location.protocol.
 * @private
 */
shaka.net.NetworkingEngine.getLocationProtocol_ = function() {
  return location.protocol;
};
