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

goog.provide('shaka.net.HttpXHRPlugin');

goog.require('goog.asserts');
goog.require('shaka.net.HttpPluginUtils');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.Error');


/**
 * @namespace
 * @summary A networking plugin to handle http and https URIs via XHR.
 * @param {string} uri
 * @param {shaka.extern.Request} request
 * @param {shaka.net.NetworkingEngine.RequestType} requestType
 * @param {shaka.extern.ProgressUpdated} progressUpdated Called when a
 *   progress event happened.
 * @return {!shaka.extern.IAbortableOperation.<shaka.extern.Response>}
 * @export
 */
shaka.net.HttpXHRPlugin = function(uri, request, requestType, progressUpdated) {
  let xhr = new shaka.net.HttpXHRPlugin.Xhr_();

  // Last time stamp when we got a progress event.
  let lastTime = Date.now();
  // Last number of bytes loaded, from progress event.
  let lastLoaded = 0;

  let promise = new Promise(function(resolve, reject) {
    xhr.open(request.method, uri, true);
    xhr.responseType = 'arraybuffer';
    xhr.timeout = request.retryParameters.timeout;
    xhr.withCredentials = request.allowCrossSiteCredentials;

    xhr.onabort = function() {
      reject(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.OPERATION_ABORTED,
          uri, requestType));
    };
    xhr.onload = function(event) {
      let target = event.target;
      goog.asserts.assert(target, 'XHR onload has no target!');
      // Since IE and Edge incorrectly return the header with a leading new line
      // character ('\n'), we trim the header here.
      const headerLines = target.getAllResponseHeaders().trim().split('\r\n');
      const headers = {};
      for (const header of headerLines) {
        /** @type {!Array.<string>} */
        const parts = header.split(': ');
        headers[parts[0].toLowerCase()] = parts.slice(1).join(': ');
      }

      try {
        let response = shaka.net.HttpPluginUtils.makeResponse(headers,
          target.response, target.status, uri, target.responseURL,
          requestType);
        resolve(response);
      } catch (error) {
        goog.asserts.assert(error instanceof shaka.util.Error,
            'Wrong error type!');
        reject(error);
      }
    };
    xhr.onerror = function(event) {
      reject(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.HTTP_ERROR,
          uri, event, requestType));
    };
    xhr.ontimeout = function(event) {
      reject(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.TIMEOUT,
          uri, requestType));
    };
    xhr.onprogress = function(event) {
      let currentTime = Date.now();
      // If the time between last time and this time we got progress event
      // is long enough, or if a whole segment is downloaded, call
      // progressUpdated().
      if (currentTime - lastTime > 100 ||
          (event.lengthComputable && event.loaded == event.total)) {
        progressUpdated(currentTime - lastTime, event.loaded - lastLoaded,
          event.total - event.loaded);
        lastLoaded = event.loaded;
        lastTime = currentTime;
      }
    };

    for (let key in request.headers) {
      // The Fetch API automatically normalizes outgoing header keys to
      // lowercase. For consistency's sake, do it here too.
      let lowercasedKey = key.toLowerCase();
      xhr.setRequestHeader(lowercasedKey, request.headers[key]);
    }
    xhr.send(request.body);
  });

  return new shaka.util.AbortableOperation(
    promise,
    () => {
      xhr.abort();
      return Promise.resolve();
    });
};


/**
 * Overridden in unit tests, but compiled out in production.
 *
 * @const {function(new: XMLHttpRequest)}
 * @private
 */
shaka.net.HttpXHRPlugin.Xhr_ = window.XMLHttpRequest;


shaka.net.NetworkingEngine.registerScheme('http', shaka.net.HttpXHRPlugin,
    shaka.net.NetworkingEngine.PluginPriority.FALLBACK);
shaka.net.NetworkingEngine.registerScheme('https', shaka.net.HttpXHRPlugin,
    shaka.net.NetworkingEngine.PluginPriority.FALLBACK);

