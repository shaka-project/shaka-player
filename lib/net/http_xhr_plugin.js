/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.net.HttpXHRPlugin');

goog.require('goog.asserts');
goog.require('shaka.net.HttpPluginUtils');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.Error');


/**
 * @summary A networking plugin to handle http and https URIs via XHR.
 * @export
 */
shaka.net.HttpXHRPlugin = class {
  /**
   * @param {string} uri
   * @param {shaka.extern.Request} request
   * @param {shaka.net.NetworkingEngine.RequestType} requestType
   * @param {shaka.extern.ProgressUpdated} progressUpdated Called when a
   *   progress event happened.
   * @param {shaka.extern.HeadersReceived} headersReceived Called when the
   *   headers for the download are received, but before the body is.
   * @param {shaka.extern.SchemePluginConfig} config
   * @return {!shaka.extern.IAbortableOperation.<shaka.extern.Response>}
   * @export
   */
  static parse(uri, request, requestType, progressUpdated, headersReceived,
      config) {
    const xhr = new shaka.net.HttpXHRPlugin.Xhr_();

    // Last time stamp when we got a progress event.
    let lastTime = Date.now();
    // Last number of bytes loaded, from progress event.
    let lastLoaded = 0;

    const promise = new Promise(((resolve, reject) => {
      xhr.open(request.method, uri, true);
      xhr.responseType = 'arraybuffer';
      xhr.timeout = request.retryParameters.timeout;
      xhr.withCredentials = request.allowCrossSiteCredentials;
      let headers = {};

      xhr.onabort = () => {
        reject(new shaka.util.Error(
            shaka.util.Error.Severity.RECOVERABLE,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.OPERATION_ABORTED,
            uri, requestType));
      };
      xhr.onreadystatechange = (event) => {
        if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
          headers = shaka.net.HttpXHRPlugin.headersToGenericObject_(xhr);
          headersReceived(headers);
        }
      };
      xhr.onload = (event) => {
        // eslint-disable-next-line shaka-rules/buffersource-no-instanceof
        goog.asserts.assert(xhr.response instanceof ArrayBuffer,
            'XHR should have a response by now!');
        const xhrResponse = xhr.response;

        try {
          const currentTime = Date.now();
          progressUpdated(currentTime - lastTime, event.loaded - lastLoaded,
              /* numBytesRemaining= */ 0);
          const response = shaka.net.HttpPluginUtils.makeResponse(headers,
              xhrResponse, xhr.status, uri, xhr.responseURL, request,
              requestType);
          resolve(response);
        } catch (error) {
          goog.asserts.assert(error instanceof shaka.util.Error,
              'Wrong error type!');
          reject(error);
        }
      };
      xhr.onerror = (event) => {
        reject(new shaka.util.Error(
            shaka.util.Error.Severity.RECOVERABLE,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.HTTP_ERROR,
            uri, event, requestType));
      };
      xhr.ontimeout = (event) => {
        reject(new shaka.util.Error(
            shaka.util.Error.Severity.RECOVERABLE,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.TIMEOUT,
            uri, requestType));
      };
      xhr.onprogress = (event) => {
        const currentTime = Date.now();
        // If the time between last time and this time we got progress event
        // is long enough, or if a whole segment is downloaded, call
        // progressUpdated().
        const minBytes = config.minBytesForProgressEvents || 0;
        const chunkSize = event.loaded - lastLoaded;
        if ((currentTime - lastTime > 100 && chunkSize >= minBytes) ||
            (event.lengthComputable && event.loaded == event.total)) {
          const numBytesRemaining =
              xhr.readyState == 4 ? 0 : event.total - event.loaded;
          progressUpdated(currentTime - lastTime, chunkSize,
              numBytesRemaining);
          lastLoaded = event.loaded;
          lastTime = currentTime;
        }
      };

      for (const key in request.headers) {
        // The Fetch API automatically normalizes outgoing header keys to
        // lowercase. For consistency's sake, do it here too.
        const lowercasedKey = key.toLowerCase();
        xhr.setRequestHeader(lowercasedKey, request.headers[key]);
      }
      xhr.send(request.body);
    }));

    return new shaka.util.AbortableOperation(
        promise,
        () => {
          xhr.abort();
          return Promise.resolve();
        });
  }

  /**
   * @param {!XMLHttpRequest} xhr
   * @return {!Object<string, string>}
   * @private
   */
  static headersToGenericObject_(xhr) {
    // Since Edge incorrectly return the header with a leading new
    // line character ('\n'), we trim the header here.
    const headerLines = xhr.getAllResponseHeaders().trim().split('\r\n');
    const headers = {};
    for (const header of headerLines) {
      /** @type {!Array<string>} */
      const parts = header.split(': ');
      headers[parts[0].toLowerCase()] = parts.slice(1).join(': ');
    }
    return headers;
  }
};


/**
 * Overridden in unit tests, but compiled out in production.
 *
 * @const {function(new: XMLHttpRequest)}
 * @private
 */
shaka.net.HttpXHRPlugin.Xhr_ = window.XMLHttpRequest;


shaka.net.NetworkingEngine.registerScheme(
    'http', shaka.net.HttpXHRPlugin.parse,
    shaka.net.NetworkingEngine.PluginPriority.FALLBACK,
    /* progressSupport= */ true);
shaka.net.NetworkingEngine.registerScheme(
    'https', shaka.net.HttpXHRPlugin.parse,
    shaka.net.NetworkingEngine.PluginPriority.FALLBACK,
    /* progressSupport= */ true);
shaka.net.NetworkingEngine.registerScheme(
    'blob', shaka.net.HttpXHRPlugin.parse,
    shaka.net.NetworkingEngine.PluginPriority.FALLBACK,
    /* progressSupport= */ true);

