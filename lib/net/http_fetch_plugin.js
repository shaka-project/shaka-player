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

goog.provide('shaka.net.HttpFetchPlugin');

goog.require('shaka.net.HttpPluginUtils');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.Error');
goog.require('shaka.util.MapUtils');


/**
 * @namespace
 * @summary A networking plugin to handle http and https URIs via the Fetch API.
 * @param {string} uri
 * @param {shakaExtern.Request} request
 * @param {shaka.net.NetworkingEngine.RequestType} requestType
 * @return {!shakaExtern.IAbortableOperation.<shakaExtern.Response>}
 * @export
 */
shaka.net.HttpFetchPlugin = function(uri, request, requestType) {
  let headers = new shaka.net.HttpFetchPlugin.Headers_();
  shaka.util.MapUtils.forEach(request.headers, function(key, value) {
    headers.append(key, value);
  });

  let controller = new shaka.net.HttpFetchPlugin.AbortController_();

  /** @type {!RequestInit} */
  let init = {
    // Edge does not treat null as undefined for body; https://goo.gl/ivDRbo.
    body: request.body || undefined,
    headers: headers,
    method: request.method,
    signal: controller.signal,
    credentials: request.allowCrossSiteCredentials ? 'include' : undefined
  };

  let canceled = false;
  let timedOut = false;

  // The fetch API does not timeout natively, so do a timeout manually using the
  // AbortController.
  let timeout;
  if (request.retryParameters.timeout) {
    let onTimeout = function() {
      timedOut = true;
      controller.abort();
    };
    timeout = setTimeout(onTimeout, request.retryParameters.timeout);
  }

  let fetch = shaka.net.HttpFetchPlugin.fetch_;
  let promise = fetch(uri, init).then(function(response) {
    clearTimeout(timeout);
    return response.arrayBuffer().then(function(arrayBuffer) {
      let headers = {};
      /** @type {Headers} */
      let responseHeaders = response.headers;
      responseHeaders.forEach(function(value, key) {
        // Since IE/Edge incorrectly return the header with a leading new line
        // character ('\n'), we trim the header here.
        headers[key.trim()] = value;
      });

      return shaka.net.HttpPluginUtils.makeResponse(headers,
          arrayBuffer, response.status, uri, response.url, requestType);
    });
  }).catch(function(error) {
    clearTimeout(timeout);
    if (canceled) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.OPERATION_ABORTED,
          uri, requestType));
    } else if (timedOut) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.TIMEOUT,
          uri, requestType));
    } else if (error.severity == undefined) {
      // Replace non-shaka errors with a generic HTTP_ERROR.
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.HTTP_ERROR,
          uri, error, requestType));
    } else {
      return Promise.reject(error);
    }
  });

  return new shaka.util.AbortableOperation(
    promise,
    () => {
      canceled = true;
      controller.abort();
      return Promise.resolve();
    });
};


/**
 * Determine if the Fetch API is supported in the browser. Note: this is
 * deliberately exposed as a method to allow the client app to use the same
 * logic as Shaka when determining support.
 * @return {boolean}
 * @export
 */
shaka.net.HttpFetchPlugin.isSupported = function() {
  return !!(window.fetch && window.AbortController);
};


/**
 * Overridden in unit tests, but compiled out in production.
 *
 * @const {function(string, !RequestInit)}
 * @private
 */
shaka.net.HttpFetchPlugin.fetch_ = window.fetch;


/**
 * Overridden in unit tests, but compiled out in production.
 *
 * @const {function(new: AbortController)}
 * @private
 */
shaka.net.HttpFetchPlugin.AbortController_ = window.AbortController;


/**
 * Overridden in unit tests, but compiled out in production.
 *
 * @const {function(new: Headers)}
 * @private
 */
shaka.net.HttpFetchPlugin.Headers_ = window.Headers;


if (shaka.net.HttpFetchPlugin.isSupported()) {
  shaka.net.NetworkingEngine.registerScheme('http', shaka.net.HttpFetchPlugin,
      shaka.net.NetworkingEngine.PluginPriority.PREFERRED);
  shaka.net.NetworkingEngine.registerScheme('https', shaka.net.HttpFetchPlugin,
      shaka.net.NetworkingEngine.PluginPriority.PREFERRED);
}
