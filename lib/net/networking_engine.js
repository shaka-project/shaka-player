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
goog.require('shaka.log');
goog.require('shaka.net.Backoff');
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.ConfigUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.OperationManager');



/**
 * NetworkingEngine wraps all networking operations.  This accepts plugins that
 * handle the actual request.  A plugin is registered using registerScheme.
 * Each scheme has at most one plugin to handle the request.
 *
 * @param {function(number, number)=} opt_onSegmentDownloaded Called
 *   when a segment is downloaded. Passed the duration, in milliseconds, that
 *   the request took, and the total number of bytes transferred.
 *
 * @struct
 * @constructor
 * @implements {shaka.util.IDestroyable}
 * @export
 */
shaka.net.NetworkingEngine = function(opt_onSegmentDownloaded) {
  /** @private {boolean} */
  this.destroyed_ = false;

  /** @private {!shaka.util.OperationManager} */
  this.operationManager_ = new shaka.util.OperationManager();

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
  'FALLBACK': 1,
  'PREFERRED': 2,
  'APPLICATION': 3
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
  let priority =
      opt_priority || shaka.net.NetworkingEngine.PluginPriority.APPLICATION;
  let existing = shaka.net.NetworkingEngine.schemes_[scheme];
  if (!existing || priority >= existing.priority) {
    shaka.net.NetworkingEngine.schemes_[scheme] = {
      priority: priority,
      plugin: plugin
    };
  }
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
  shaka.util.ArrayUtils.remove(this.requestFilters_, filter);
};


/**
 * Clears all request filters.
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
  shaka.util.ArrayUtils.remove(this.responseFilters_, filter);
};


/**
 * Clears all response filters.
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
  this.destroyed_ = true;
  this.requestFilters_ = [];
  this.responseFilters_ = [];
  return this.operationManager_.destroy();
};


/**
 * Shims return values from requests to look like Promises, so that callers have
 * time to update to the new operation-based API.
 *
 * @param {!shakaExtern.IAbortableOperation.<shakaExtern.Response>} operation
 * @return {!shakaExtern.IAbortableOperation.<shakaExtern.Response>}
 * @private
 */
shaka.net.NetworkingEngine.shimRequests_ = function(operation) {
  // TODO: remove in v2.5
  operation.then = (onSuccess, onError) => {
    shaka.log.alwaysWarn('The network request interface has changed!  Please ' +
                         'update your application to the new interface, ' +
                         'which allows operations to be aborted.  Support ' +
                         'for the old API will be removed in v2.5.');
    return operation.promise.then(onSuccess, onError);
  };
  operation.catch = (onError) => {
    shaka.log.alwaysWarn('The network request interface has changed!  Please ' +
                         'update your application to the new interface, ' +
                         'which allows operations to be aborted.  Support ' +
                         'for the old API will be removed in v2.5.');
    return operation.promise.catch(onError);
  };
  return operation;
};


/**
 * Makes a network request and returns the resulting data.
 *
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shakaExtern.Request} request
 * @return {!shakaExtern.IAbortableOperation.<shakaExtern.Response>}
 * @export
 */
shaka.net.NetworkingEngine.prototype.request = function(type, request) {
  let cloneObject = shaka.util.ConfigUtils.cloneObject;

  // Reject all requests made after destroy is called.
  if (this.destroyed_) {
    return shaka.net.NetworkingEngine.shimRequests_(
        shaka.util.AbortableOperation.aborted());
  }

  goog.asserts.assert(request.uris && request.uris.length,
                      'Request without URIs!');

  // If a request comes from outside the library, some parameters may be left
  // undefined.  To make it easier for application developers, we will fill them
  // in with defaults if necessary.
  //
  // We clone retryParameters and uris so that if a filter modifies the request,
  // it doesn't contaminate future requests.
  request.method = request.method || 'GET';
  request.headers = request.headers || {};
  request.retryParameters = request.retryParameters ?
      cloneObject(request.retryParameters) :
      shaka.net.NetworkingEngine.defaultRetryParameters();
  request.uris = cloneObject(request.uris);

  let requestFilterOperation = this.filterRequest_(type, request);
  let requestOperation = requestFilterOperation.chain(
      () => this.makeRequestWithRetry_(type, request));
  let responseFilterOperation = requestOperation.chain(
      (response) => this.filterResponse_(type, response));

  // Keep track of time spent in filters.
  let requestFilterStartTime = Date.now();
  let requestFilterMs = 0;
  requestFilterOperation.promise.then(() => {
    requestFilterMs = Date.now() - requestFilterStartTime;
  }, () => {});  // Silence errors in this fork of the Promise chain.

  let responseFilterStartTime = 0;
  requestOperation.promise.then(() => {
    responseFilterStartTime = Date.now();
  }, () => {});  // Silence errors in this fork of the Promise chain.

  let operation = responseFilterOperation.chain((response) => {
    let responseFilterMs = Date.now() - responseFilterStartTime;

    response.timeMs += requestFilterMs;
    response.timeMs += responseFilterMs;

    if (this.onSegmentDownloaded_ && !response.fromCache &&
        type == shaka.net.NetworkingEngine.RequestType.SEGMENT) {
      this.onSegmentDownloaded_(response.timeMs, response.data.byteLength);
    }

    return response;
  }, (e) => {
    // Any error thrown from elsewhere should be recategorized as CRITICAL here.
    // This is because by the time it gets here, we've exhausted retries.
    if (e) {
      goog.asserts.assert(e instanceof shaka.util.Error, 'Wrong error type');
      e.severity = shaka.util.Error.Severity.CRITICAL;
    }

    throw e;
  });

  // Add the operation to the manager for later cleanup.
  this.operationManager_.manage(operation);
  return shaka.net.NetworkingEngine.shimRequests_(operation);
};


/**
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shakaExtern.Request} request
 * @return {!shakaExtern.IAbortableOperation.<undefined>}
 * @private
 */
shaka.net.NetworkingEngine.prototype.filterRequest_ = function(type, request) {
  let filterOperation = shaka.util.AbortableOperation.completed(undefined);

  this.requestFilters_.forEach((requestFilter) => {
    // Request filters are run sequentially.
    filterOperation =
        filterOperation.chain(() => requestFilter(type, request));
  });

  // Catch any errors thrown by request filters, and substitute
  // them with a Shaka-native error.
  return filterOperation.chain(undefined, (e) => {
    if (e && e.code == shaka.util.Error.Code.OPERATION_ABORTED) {
      // Don't change anything if the operation was aborted.
      throw e;
    }

    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.REQUEST_FILTER_ERROR, e);
  });
};


/**
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shakaExtern.Request} request
 * @return {!shakaExtern.IAbortableOperation.<shakaExtern.Response>}
 * @private
 */
shaka.net.NetworkingEngine.prototype.makeRequestWithRetry_ =
    function(type, request) {
  let backoff = new shaka.net.Backoff(
      request.retryParameters, /* autoReset */ false);
  let index = 0;
  return this.send_(type, request, backoff, index, /* lastError */ null);
};


/**
 * Sends the given request to the correct plugin and retry using Backoff.
 *
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shakaExtern.Request} request
 * @param {!shaka.net.Backoff} backoff
 * @param {number} index
 * @param {?shaka.util.Error} lastError
 * @return {!shakaExtern.IAbortableOperation.<shakaExtern.Response>}
 * @private
 */
shaka.net.NetworkingEngine.prototype.send_ = function(
    type, request, backoff, index, lastError) {
  let uri = new goog.Uri(request.uris[index]);
  let scheme = uri.getScheme();

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

  let object = shaka.net.NetworkingEngine.schemes_[scheme];
  let plugin = object ? object.plugin : null;
  if (!plugin) {
    return shaka.util.AbortableOperation.failed(
        new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.UNSUPPORTED_SCHEME,
            uri));
  }


  // Every attempt must have an associated backoff.attempt() call so that the
  // accounting is correct.
  let backoffOperation =
      shaka.util.AbortableOperation.notAbortable(backoff.attempt());

  let startTimeMs;
  let sendOperation = backoffOperation.chain(() => {
    if (this.destroyed_) {
      return shaka.util.AbortableOperation.aborted();
    }

    startTimeMs = Date.now();
    let operation = plugin(request.uris[index], request, type);

    // Backward compatibility with older scheme plugins.
    // TODO: remove in v2.5
    if (operation.promise == undefined) {
      shaka.log.alwaysWarn('The scheme plugin interface has changed!  Please ' +
                           'update your scheme plugins to the new interface ' +
                           'to add support for abort().  Support for the old ' +
                           'plugin interface will be removed in v2.5.');

      // The return was just a promise, so wrap it into an operation.
      let schemePromise = /** @type {!Promise} */(operation);
      operation = shaka.util.AbortableOperation.notAbortable(schemePromise);
    }
    return operation;
  }).chain((response) => {
    if (response.timeMs == undefined) {
      response.timeMs = Date.now() - startTimeMs;
    }
    return response;
  }, (error) => {
    if (error && error.code == shaka.util.Error.Code.OPERATION_ABORTED) {
      // Don't change anything if the operation was aborted.
      throw error;
    }

    if (this.destroyed_) {
      return shaka.util.AbortableOperation.aborted();
    }

    if (error && error.severity == shaka.util.Error.Severity.RECOVERABLE) {
      // Move to the next URI.
      index = (index + 1) % request.uris.length;
      let shakaError = /** @type {shaka.util.Error} */(error);
      return this.send_(type, request, backoff, index, shakaError);
    }

    // The error was not recoverable, so do not try again.
    // Rethrow the error so the Promise chain stays rejected.
    throw error || lastError;
  });

  return sendOperation;
};


/**
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shakaExtern.Response} response
 * @return {!shakaExtern.IAbortableOperation.<shakaExtern.Response>}
 * @private
 */
shaka.net.NetworkingEngine.prototype.filterResponse_ =
    function(type, response) {
  let filterOperation = shaka.util.AbortableOperation.completed(undefined);

  this.responseFilters_.forEach((responseFilter) => {
    // Response filters are run sequentially.
    filterOperation =
        filterOperation.chain(() => responseFilter(type, response));
  });

  return filterOperation.chain(() => {
    // If successful, return the filtered response.
    return response;
  }, (e) => {
    // Catch any errors thrown by request filters, and substitute
    // them with a Shaka-native error.

    if (e && e.code == shaka.util.Error.Code.OPERATION_ABORTED) {
      // Don't change anything if the operation was aborted.
      throw e;
    }

    // The error is assumed to be critical if the original wasn't a Shaka error.
    let severity = shaka.util.Error.Severity.CRITICAL;
    if (e instanceof shaka.util.Error) {
      severity = e.severity;
    }

    throw new shaka.util.Error(
        severity,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.RESPONSE_FILTER_ERROR, e);
  });
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
