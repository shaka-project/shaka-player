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
goog.provide('shaka.net.NetworkingEngine.PendingRequest');

goog.require('goog.Uri');
goog.require('goog.asserts');
goog.require('shaka.net.Backoff');
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.ObjectUtils');
goog.require('shaka.util.OperationManager');


/**
 * @event shaka.net.NetworkingEngine.RetryEvent
 * @description Fired when the networking engine receives a recoverable error
 *   and retries.
 * @property {string} type
 *   'retry'
 * @property {?shaka.util.Error} error
 *   The error that caused the retry. If it was a non-Shaka error, this is set
 *   to null.
 * @exportDoc
 */


/**
 * NetworkingEngine wraps all networking operations.  This accepts plugins that
 * handle the actual request.  A plugin is registered using registerScheme.
 * Each scheme has at most one plugin to handle the request.
 *
 * @param {function(number, number)=} onProgressUpdated Called when a progress
 *   event is triggered. Passed the duration, in milliseconds, that the request
 *   took, and the number of bytes transferred.
 *
 * @struct
 * @constructor
 * @implements {shaka.util.IDestroyable}
 * @extends {shaka.util.FakeEventTarget}
 * @export
 */
shaka.net.NetworkingEngine = function(onProgressUpdated) {
  shaka.util.FakeEventTarget.call(this);

  /** @private {boolean} */
  this.destroyed_ = false;

  /** @private {!shaka.util.OperationManager} */
  this.operationManager_ = new shaka.util.OperationManager();

  /** @private {!Set.<shaka.extern.RequestFilter>} */
  this.requestFilters_ = new Set();

  /** @private {!Set.<shaka.extern.ResponseFilter>} */
  this.responseFilters_ = new Set();

  /** @private {?function(number, number)} */
  this.onProgressUpdated_ = onProgressUpdated || null;
};

goog.inherits(shaka.net.NetworkingEngine, shaka.util.FakeEventTarget);


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
  'APP': 3,
  'TIMING': 4,
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
  'APPLICATION': 3,
};


/**
 * @typedef {{
 *   plugin: shaka.extern.SchemePlugin,
 *   priority: number
 * }}
 * @property {shaka.extern.SchemePlugin} plugin
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
 * @typedef {{
 *   response: shaka.extern.Response,
 *   gotProgress: boolean
 * }}
 *
 * @description
 * Defines a response wrapper object, including the response object and whether
 * progress event is fired by the scheme plugin.
 *
 * @property {shaka.extern.Response} response
 * @property {boolean} gotProgress
 * @private
 */
shaka.net.NetworkingEngine.ResponseAndGotProgress;


/**
 * Registers a scheme plugin.  This plugin will handle all requests with the
 * given scheme.  If a plugin with the same scheme already exists, it is
 * replaced, unless the existing plugin is of higher priority.
 * If no priority is provided, this defaults to the highest priority of
 * APPLICATION.
 *
 * @param {string} scheme
 * @param {shaka.extern.SchemePlugin} plugin
 * @param {number=} priority
 * @export
 */
shaka.net.NetworkingEngine.registerScheme =
    function(scheme, plugin, priority) {
  goog.asserts.assert(priority == undefined || priority > 0,
      'explicit priority must be > 0');
  priority =
      priority || shaka.net.NetworkingEngine.PluginPriority.APPLICATION;
  let existing = shaka.net.NetworkingEngine.schemes_[scheme];
  if (!existing || priority >= existing.priority) {
    shaka.net.NetworkingEngine.schemes_[scheme] = {
      priority: priority,
      plugin: plugin,
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
 * @param {shaka.extern.RequestFilter} filter
 * @export
 */
shaka.net.NetworkingEngine.prototype.registerRequestFilter = function(filter) {
  this.requestFilters_.add(filter);
};


/**
 * Removes a request filter.
 *
 * @param {shaka.extern.RequestFilter} filter
 * @export
 */
shaka.net.NetworkingEngine.prototype.unregisterRequestFilter =
    function(filter) {
  this.requestFilters_.delete(filter);
};


/**
 * Clears all request filters.
 *
 * @export
 */
shaka.net.NetworkingEngine.prototype.clearAllRequestFilters = function() {
  this.requestFilters_.clear();
};


/**
 * Registers a new response filter.  All filters are applied in the order they
 * are registered.
 *
 * @param {shaka.extern.ResponseFilter} filter
 * @export
 */
shaka.net.NetworkingEngine.prototype.registerResponseFilter = function(filter) {
  this.responseFilters_.add(filter);
};


/**
 * Removes a response filter.
 *
 * @param {shaka.extern.ResponseFilter} filter
 * @export
 */
shaka.net.NetworkingEngine.prototype.unregisterResponseFilter =
    function(filter) {
  this.responseFilters_.delete(filter);
};


/**
 * Clears all response filters.
 *
 * @export
 */
shaka.net.NetworkingEngine.prototype.clearAllResponseFilters = function() {
  this.responseFilters_.clear();
};


/**
 * Gets a copy of the default retry parameters.
 *
 * @return {shaka.extern.RetryParameters}
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
 * @param {shaka.extern.RetryParameters} retryParams
 * @return {shaka.extern.Request}
 */
shaka.net.NetworkingEngine.makeRequest = function(uris, retryParams) {
  return {
    uris: uris,
    method: 'GET',
    body: null,
    headers: {},
    allowCrossSiteCredentials: false,
    retryParameters: retryParams,
    licenseRequestType: null,
    sessionId: null,
  };
};


/**
 * @override
 * @export
 */
shaka.net.NetworkingEngine.prototype.destroy = function() {
  this.destroyed_ = true;
  this.requestFilters_.clear();
  this.responseFilters_.clear();
  return this.operationManager_.destroy();
};


/**
 * Makes a network request and returns the resulting data.
 *
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shaka.extern.Request} request
 * @return {!shaka.net.NetworkingEngine.PendingRequest}
 * @export
 */
shaka.net.NetworkingEngine.prototype.request = function(type, request) {
  const ObjectUtils = shaka.util.ObjectUtils;
  const numBytesRemainingObj =
      new shaka.net.NetworkingEngine.NumBytesRemainingClass();

  // Reject all requests made after destroy is called.
  if (this.destroyed_) {
    const p = Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.PLAYER,
        shaka.util.Error.Code.OPERATION_ABORTED));
    // Silence uncaught rejection errors, which may otherwise occur any place
    // we don't explicitly handle aborted operations.
    p.catch(() => {});
    return new shaka.net.NetworkingEngine.PendingRequest(
        p, () => Promise.resolve(), numBytesRemainingObj);
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
      ObjectUtils.cloneObject(request.retryParameters) :
      shaka.net.NetworkingEngine.defaultRetryParameters();
  request.uris = ObjectUtils.cloneObject(request.uris);

  // Apply the registered filters to the request.
  let requestFilterOperation = this.filterRequest_(type, request);
  let requestOperation = requestFilterOperation.chain(
      () => this.makeRequestWithRetry_(type, request, numBytesRemainingObj));
  let responseFilterOperation = requestOperation.chain(
      (responseAndGotProgress) =>
          this.filterResponse_(type, responseAndGotProgress));

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

  const operation = responseFilterOperation.chain((responseAndGotProgress) => {
    const responseFilterMs = Date.now() - responseFilterStartTime;
    const response = responseAndGotProgress.response;
    response.timeMs += requestFilterMs;
    response.timeMs += responseFilterMs;
    if (!responseAndGotProgress.gotProgress &&
        this.onProgressUpdated_ &&
        !response.fromCache &&
        type == shaka.net.NetworkingEngine.RequestType.SEGMENT) {
      this.onProgressUpdated_(response.timeMs, response.data.byteLength);
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

  // Return the pending request, which carries the response operation, and the
  // number of bytes remaining to be downloaded, updated by the progress events.
  // Add the operation to the manager for later cleanup.
  const pendingRequest =
      new shaka.net.NetworkingEngine.PendingRequest(operation.promise,
      operation.onAbort_, numBytesRemainingObj);
  this.operationManager_.manage(pendingRequest);
  return pendingRequest;
};


/**
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shaka.extern.Request} request
 * @return {!shaka.extern.IAbortableOperation.<undefined>}
 * @private
 */
shaka.net.NetworkingEngine.prototype.filterRequest_ = function(type, request) {
  let filterOperation = shaka.util.AbortableOperation.completed(undefined);

  for (const requestFilter of this.requestFilters_) {
    // Request filters are run sequentially.
    filterOperation =
        filterOperation.chain(() => requestFilter(type, request));
  }

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
 * @param {shaka.extern.Request} request
 * @param {shaka.net.NetworkingEngine.NumBytesRemainingClass}
 *            numBytesRemainingObj
 * @return {!shaka.extern.IAbortableOperation.<
 *            shaka.net.NetworkingEngine.ResponseAndGotProgress>}
 * @private
 */
shaka.net.NetworkingEngine.prototype.makeRequestWithRetry_ =
    function(type, request, numBytesRemainingObj) {
  let backoff = new shaka.net.Backoff(
      request.retryParameters, /* autoReset */ false);
  let index = 0;
  return this.send_(type, request, backoff, index, /* lastError */ null,
                    numBytesRemainingObj);
};


/**
 * Sends the given request to the correct plugin and retry using Backoff.
 *
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shaka.extern.Request} request
 * @param {!shaka.net.Backoff} backoff
 * @param {number} index
 * @param {?shaka.util.Error} lastError
 * @param {shaka.net.NetworkingEngine.NumBytesRemainingClass}
 *     numBytesRemainingObj
 * @return {!shaka.extern.IAbortableOperation.<
 *               shaka.net.NetworkingEngine.ResponseAndGotProgress>}
 * @private
 */
shaka.net.NetworkingEngine.prototype.send_ = function(
    type, request, backoff, index, lastError, numBytesRemainingObj) {
  let uri = new goog.Uri(request.uris[index]);
  let scheme = uri.getScheme();
  // Whether it got a progress event.
  let gotProgress = false;
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
    const segment = shaka.net.NetworkingEngine.RequestType.SEGMENT;

    return plugin(request.uris[index],
         request,
         type,
         // The following function is passed to plugin.
         (time, bytes, numBytesRemaining) => {
           if (this.onProgressUpdated_ && type == segment) {
             this.onProgressUpdated_(time, bytes);
             gotProgress = true;
             numBytesRemainingObj.setBytes(numBytesRemaining);
           }
        });
  }).chain((response) => {
    if (response.timeMs == undefined) {
      response.timeMs = Date.now() - startTimeMs;
    }
    let responseAndGotProgress = {
      response: response,
      gotProgress: gotProgress,
    };

    return responseAndGotProgress;
  }, (error) => {
    if (error && error.code == shaka.util.Error.Code.OPERATION_ABORTED) {
      // Don't change anything if the operation was aborted.
      throw error;
    }

    if (this.destroyed_) {
      return shaka.util.AbortableOperation.aborted();
    }

    if (error && error.severity == shaka.util.Error.Severity.RECOVERABLE) {
      // Don't pass in a non-shaka error, even if one is somehow thrown;
      // instead, call the listener with a null error.
      const errorOrNull = error instanceof shaka.util.Error ? error : null;
      let event = new shaka.util.FakeEvent('retry', {'error': errorOrNull});
      this.dispatchEvent(event);

      // Move to the next URI.
      index = (index + 1) % request.uris.length;
      const shakaError = /** @type {shaka.util.Error} */(error);
      return this.send_(type, request, backoff, index, shakaError,
                        numBytesRemainingObj);
    }

    // The error was not recoverable, so do not try again.
    // Rethrow the error so the Promise chain stays rejected.
    throw error || lastError;
  });

  return sendOperation;
};


/**
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shaka.net.NetworkingEngine.ResponseAndGotProgress}
 *        responseAndGotProgress
 * @return {!shaka.extern.IAbortableOperation.<
 *               shaka.net.NetworkingEngine.ResponseAndGotProgress>}
 * @private
 */
shaka.net.NetworkingEngine.prototype.filterResponse_ =
    function(type, responseAndGotProgress) {
  let filterOperation = shaka.util.AbortableOperation.completed(undefined);
  for (const responseFilter of this.responseFilters_) {
    // Response filters are run sequentially.
    filterOperation = filterOperation.chain(
      responseFilter.bind(null, type, responseAndGotProgress.response));
  }
  // If successful, return the filtered response with whether it got progress.
  return filterOperation.chain(() => {
    return responseAndGotProgress;
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

/**
 * A wrapper class for the number of bytes remaining to be downloaded for the
 * request.
 * Instead of using PendingRequest directly, this class is needed to be sent to
 * plugin as a parameter, and a Promise is returned, before PendingRequest is
 * created.
 *
 * @export
 */
shaka.net.NetworkingEngine.NumBytesRemainingClass = class {
  /**
   * Constructor
   */
  constructor() {
    /** @private {number} */
    this.bytesToLoad_ = 0;
  }

  /**
   * @param {number} bytesToLoad
   */
  setBytes(bytesToLoad) {
    this.bytesToLoad_ = bytesToLoad;
  }

  /**
   * @return {number}
   */
  getBytes() {
    return this.bytesToLoad_;
  }
};

/**
 * A pending network request. This can track the current progress of the
 * download, and allows the request to be aborted if the network is slow.
 *
 * @implements {shaka.extern.IAbortableOperation.<shaka.extern.Response>}
 * @extends {shaka.util.AbortableOperation}
 * @export
 */
shaka.net.NetworkingEngine.PendingRequest =
    class extends shaka.util.AbortableOperation {
  /**
   * @param {!Promise} promise
   *   A Promise which represents the underlying operation.  It is resolved when
   *   the operation is complete, and rejected if the operation fails or is
   *   aborted.  Aborted operations should be rejected with a shaka.util.Error
   *   object using the error code OPERATION_ABORTED.
   * @param {function():!Promise} onAbort
   *   Will be called by this object to abort the underlying operation.
   *   This is not cancelation, and will not necessarily result in any work
   *   being undone.  abort() should return a Promise which is resolved when the
   *   underlying operation has been aborted.  The returned Promise should never
   *   be rejected.
   * @param {shaka.net.NetworkingEngine.NumBytesRemainingClass}
   *   numBytesRemainingObj
   */
  constructor(promise, onAbort, numBytesRemainingObj) {
    super(promise, onAbort);

    /** @private {shaka.net.NetworkingEngine.NumBytesRemainingClass} */
    this.bytesRemaining_ = numBytesRemainingObj;
  }

 /**
  * @return {number}
  */
  getBytesRemaining() {
    return this.bytesRemaining_.getBytes();
  }
};
