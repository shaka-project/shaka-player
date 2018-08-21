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
  const headers = new shaka.net.HttpFetchPlugin.Headers_();
  shaka.util.MapUtils.forEach(request.headers, function(key, value) {
    headers.append(key, value);
  });

  const controller = new shaka.net.HttpFetchPlugin.AbortController_();

  /** @type {!RequestInit} */
  const init = {
    // Edge does not treat null as undefined for body; https://bit.ly/2luyE6x
    body: request.body || undefined,
    headers: headers,
    method: request.method,
    signal: controller.signal,
    credentials: request.allowCrossSiteCredentials ? 'include' : undefined
  };

  /** @type {shaka.net.HttpFetchPlugin.AbortStatus} */
  const abortStatus = {
    canceled: false,
    timedOut: false,
  };

  // The fetch API does not timeout natively, so do a timeout manually using the
  // AbortController.
  let timeout;
  if (request.retryParameters.timeout) {
    let onTimeout = function() {
      abortStatus.timedOut = true;
      controller.abort();
    };
    timeout = setTimeout(onTimeout, request.retryParameters.timeout);
  }

  const promise = shaka.net.HttpFetchPlugin.request_(uri, requestType, init,
      abortStatus, timeout);

  return new shaka.util.AbortableOperation(
    promise,
    () => {
      abortStatus.canceled = true;
      controller.abort();
      return Promise.resolve();
    });
};

/**
 * @param {string} uri
 * @param {shaka.net.NetworkingEngine.RequestType} requestType
 * @param {!RequestInit} init
 * @param {shaka.net.HttpFetchPlugin.AbortStatus} abortStatus
 * @param {number|undefined} timeoutId
 * @return {!Promise<!shakaExtern.Response>}
 * @private
 */
shaka.net.HttpFetchPlugin.request_ = async function(uri, requestType, init,
    abortStatus, timeoutId) {
  const fetch = shaka.net.HttpFetchPlugin.fetch_;
  let response;
  let arrayBuffer;

  try {
    response = await fetch(uri, init);
    arrayBuffer = await response.arrayBuffer();
  } catch (error) {
    if (abortStatus.canceled) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.OPERATION_ABORTED,
          uri, requestType);
    } else if (abortStatus.timedOut) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.TIMEOUT,
          uri, requestType);
    } else {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.HTTP_ERROR,
          uri, error, requestType);
    }
  } finally {
    clearTimeout(timeoutId);
  }

  const headers = {};
  /** @type {Headers} */
  const responseHeaders = response.headers;
  responseHeaders.forEach(function(value, key) {
    // Since IE/Edge incorrectly return the header with a leading new line
    // character ('\n'), we trim the header here.
    headers[key.trim()] = value;
  });

  return shaka.net.HttpPluginUtils.makeResponse(headers,
      arrayBuffer, response.status, uri, response.url, requestType);
};

/**
 * @typedef {{
 *   canceled: boolean,
 *   timedOut: boolean
 * }}
 * @property {boolean} canceled
 *   Indicates if the request was canceled.
 * @property {boolean} timedOut
 *   Indicates if the request timed out.
 */
shaka.net.HttpFetchPlugin.AbortStatus;


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
